import * as fs from 'fs/promises';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import type { UUID } from 'crypto';
import { ContextManager } from './context.js';
import { AgentMode, MODE_CONFIG, getToolCategory, isToolAllowed, isValidMode } from './modes.js';
import { FileEditor } from './editor.js';
import { GitUtils } from './utils/git.js';
import { TestRunnerDetector } from './utils/testRunner.js';
import { SafetyChecker, sanitizePath, sanitizeUrl } from './utils/safety.js';
import {
  globalProcessRegistry,
  looksLikeLongLivedCommand,
  type ProcessRegistry,
} from './process-registry.js';
import type { MCPServerConfig } from './types/index.js';
import { PluginManager } from './plugins.js';
import { MCPClientManager } from './mcp-client.js';
import { NeuralMemory } from './memory.js';
import * as os from 'os';
import { SkillManager } from './skills.js';
import { TestGenerator, generateTestsForFile, writeTestFile } from './tools/test-generator.js';
import { PatternMiner } from './pattern-miner.js';
import { BackgroundAgentManager } from './background-agent.js';
import { CodeGraph } from './code-graph.js';
import { ConflictSolver } from './conflict-solver.js';
import { SwarmOrchestrator } from './swarm.js';
import { PermissionManager, type ApprovalScope, type PermissionMode } from './permissions.js';
import { McpOAuthFlowManager } from './mcp/oauth-flow.js';
import { RemoteExecutionClient, type RemoteExecutionConfig } from './remote-execution.js';
import { RemoteWorkspaceClient } from './remote-workspace-client.js';
import picomatch from 'picomatch';
import {
  createFileHistoryState,
  fileHistoryMakeSnapshot,
  fileHistoryRewind,
  fileHistoryRestore,
  fileHistoryTrackEdit,
  type FileHistoryState,
} from './file-history.js';
import type { FileHistorySnapshot, FileHistorySnapshotEntry } from './transcript-types.js';

const execAsync = promisify(exec);

const DEFAULT_COMMAND_OUTPUT_CHARS = 20000;

/** Raster types: read_file must not decode as UTF-8 (misleading "lines" of binary). */
const READ_FILE_SKIP_RASTER_IMAGE_EXTS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.heic',
  '.heif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.webp',
]);

function compactCommandOutput(value: string, maxChars: number): { output: string; truncated: boolean; originalLength: number } {
  if (value.length <= maxChars) {
    return { output: value, truncated: false, originalLength: value.length };
  }

  const marker = `\n\n[output truncated: kept head/tail, original length ${value.length} chars]\n\n`;
  const available = Math.max(0, maxChars - marker.length);
  const headLength = Math.ceil(available * 0.6);
  const tailLength = Math.floor(available * 0.4);

  return {
    output: `${value.slice(0, headLength)}${marker}${value.slice(value.length - tailLength)}`,
    truncated: true,
    originalLength: value.length,
  };
}

/** Returned by former Playwright-backed browser tools; XibeCode does not bundle browsers. */
export const NO_EMBEDDED_BROWSER_MESSAGE =
  'XibeCode does not bundle Playwright, Chromium, or agent-browser. Install agent-browser globally on supported OS/arch if you want it, or use your environment browser MCP / fetch_url. For Playwright E2E in a repo, add @playwright/test there and run it via run_command.';

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

async function whichBinary(name: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`command -v ${shellQuote(name)}`, {
      timeout: 3000,
    });
    const p = stdout.trim().split('\n')[0];
    return p || null;
  } catch {
    return null;
  }
}

function screenshotSuccess(
  url: string,
  absOut: string,
  via: string,
  remappedFrom?: string,
): Record<string, unknown> {
  const media = `MEDIA:${absOut}`;
  const remapNote = remappedFrom
    ? ` (path remapped from ${remappedFrom} → workspace screenshots/)`
    : '';
  return {
    success: true,
    error: false,
    url,
    path: absOut,
    via,
    media_tag: media,
    remapped_from: remappedFrom,
    message: `Screenshot saved${remapNote}. Include this line in your final chat reply so the user receives the image:\n${media}`,
  };
}

/**
 * Interface for tool executors
 *
 * @category Tool Execution
 * @since 0.1.0
 */
export interface ToolExecutor {
  /**
   * Execute a tool with given input
   *
   * @param toolName - Name of the tool to execute
   * @param input - Tool input parameters
   * @returns Tool execution result
   */
  execute(toolName: string, input: any): Promise<any>;

  /**
   * Get all available tools
   *
   * @returns Array of tool definitions
   */
  getTools(): Tool[];
}

export const __testing = {
  compactCommandOutput,
};

/**
 * Main tool executor for XibeCode agent
 *
 * Provides 95+ tools across 8 categories for autonomous coding operations:
 * - File Operations: read, write, edit, delete files
 * - Git Operations: status, diff, commit, reset
 * - Shell Commands: run commands, interactive shell
 * - Web Operations: search, fetch URLs, HTTP requests
 * - Context Operations: code search, file finding, context discovery
 * - Test Operations: run tests, get results
 * - Memory Operations: update neural memory
 * - Browser guidance: use run_command + agent-browser (no bundled browser)
 *
 * Features:
 * - Mode-based tool permissions
 * - Safety checking for dangerous operations
 * - Plugin support for custom tools
 * - MCP integration for external tools
 * - Dry-run mode for safe previews
 * - Backup system for file operations
 *
 * @example
 * ```typescript
 * const executor = new CodingToolExecutor('/project', {
 *   dryRun: false,
 *   pluginManager,
 *   memory
 * });
 *
 * executor.setMode('agent');
 *
 * // Read a file
 * const result = await executor.execute('read_file', { path: 'src/app.ts' });
 *
 * // Edit a file
 * await executor.execute('edit_file', {
 *   path: 'src/app.ts',
 *   search: 'old code',
 *   replace: 'new code'
 * });
 * ```
 *
 * @category Tool Execution
 * @since 0.1.0
 */
export class CodingToolExecutor implements ToolExecutor {
  private workingDir: string;
  private contextManager: ContextManager;
  private fileEditor: FileEditor;
  private gitUtils: GitUtils;
  private testRunner: TestRunnerDetector;
  private safetyChecker: SafetyChecker;
  private pluginManager: PluginManager;
  private mcpClientManager?: MCPClientManager;
  private memory?: NeuralMemory;
  private skillManager: SkillManager;
  private patternMiner: PatternMiner;
  private backgroundAgent: BackgroundAgentManager;
  private codeGraph: CodeGraph;
  private conflictSolver: ConflictSolver;
  private swarmOrchestrator: SwarmOrchestrator;
  private platform: string;
  private dryRun: boolean;
  private testCommandOverride?: string;
  private permissionManager: PermissionManager;
  private remoteExecutionClient?: RemoteExecutionClient;
  private remoteWorkspaceClient?: RemoteWorkspaceClient;
  private remoteExecutionStrategy: 'host_only' | 'sandbox_full' = 'host_only';
  /** Session-scoped tools synthesized by the agent (meta-agent). Execution is sandboxed via run_command. */
  private dynamicTools = new Map<string, { description: string; script: string }>();
  private mcpOAuth = new McpOAuthFlowManager();
  private fileHistoryState: FileHistoryState = createFileHistoryState();
  private activeFileHistoryMessageId: UUID | null = null;
  /** Optional gate for high-risk tools (used by 24/7 gateway messaging). */
  private onDangerousApproval?: import('./utils/safety.js').DangerousApprovalHandler;
  /** Optional ask-user gate (gateway clarify / ask). */
  private onAskUser?: (req: {
    question: string;
    choices?: string[];
  }) => Promise<string>;
  private sessionApprovedKeys = new Set<string>();
  private alwaysApprovedKeys = new Set<string>();
  private processRegistry: ProcessRegistry = globalProcessRegistry;
  /** Abort signal for interrupting foreground commands (/stop). */
  private abortSignal?: AbortSignal;

  /**
   * Creates a new CodingToolExecutor instance
   *
   * Initializes all tool subsystems including file operations, git utilities,
   * test runner, safety checker, plugin manager, and optional MCP integration.
   *
   * @example
   * ```typescript
   * // Basic usage
   * const executor = new CodingToolExecutor('/project');
   *
   * // With options
   * const executor = new CodingToolExecutor('/project', {
   *   dryRun: true,
   *   pluginManager: new PluginManager(),
   *   memory: new NeuralMemory('./.xibecode/memory.json')
   * });
   * ```
   *
   * @param workingDir - Working directory for file operations (default: process.cwd())
   * @param options - Configuration options
   * @param options.dryRun - Enable dry-run mode (preview changes without executing)
   * @param options.testCommandOverride - Override test command detection
   * @param options.pluginManager - Plugin manager instance for custom tools
   * @param options.mcpClientManager - MCP client manager for external tool integration
   * @param options.memory - Neural memory instance for persistent learning
   * @param options.skillManager - Skill manager for loading custom workflows
   *
   * @category Constructor
   * @since 0.1.0
   */
  constructor(
    workingDir: string = process.cwd(),
    options?: {
      dryRun?: boolean;
      testCommandOverride?: string;
      pluginManager?: PluginManager;
      mcpClientManager?: MCPClientManager;
      memory?: NeuralMemory;
      skillManager?: SkillManager; // Optional for compatibility, but recommended
      permissionManager?: PermissionManager;
      initialFileHistoryState?: FileHistoryState;
      remoteExecution?: RemoteExecutionConfig;
      /** When set, high-risk tools pause until the handler returns once/session/always/deny. */
      onDangerousApproval?: import('./utils/safety.js').DangerousApprovalHandler;
      /** When set, ask_user tool waits for a human reply (gateway / CLI). */
      onAskUser?: (req: { question: string; choices?: string[] }) => Promise<string>;
      processRegistry?: ProcessRegistry;
      abortSignal?: AbortSignal;
    }
  ) {
    this.workingDir = workingDir;
    this.onDangerousApproval = options?.onDangerousApproval;
    this.onAskUser = options?.onAskUser;
    if (options?.processRegistry) this.processRegistry = options.processRegistry;
    this.abortSignal = options?.abortSignal;
    this.contextManager = new ContextManager(workingDir);
    this.fileEditor = new FileEditor(workingDir, {
      beforeMutate: async (fullPath: string) => {
        await this.trackFileEditBeforeMutation(fullPath);
      },
    });
    this.gitUtils = new GitUtils(workingDir);
    this.testRunner = new TestRunnerDetector(workingDir);
    this.safetyChecker = new SafetyChecker();
    this.pluginManager = options?.pluginManager || new PluginManager();
    this.mcpClientManager = options?.mcpClientManager;
    this.memory = options?.memory;
    this.patternMiner = new PatternMiner(workingDir);
    this.backgroundAgent = new BackgroundAgentManager(workingDir);
    this.codeGraph = new CodeGraph(workingDir);
    this.conflictSolver = new ConflictSolver(workingDir);
    this.swarmOrchestrator = new SwarmOrchestrator(this.backgroundAgent);
    // Initialize skill manager if provided, otherwise create a default one
    this.skillManager = options?.skillManager || new SkillManager(workingDir);
    this.platform = os.platform();
    this.dryRun = options?.dryRun || false;
    this.testCommandOverride = options?.testCommandOverride;
    this.permissionManager = options?.permissionManager ?? new PermissionManager(this.currentMode);
    this.fileHistoryState = options?.initialFileHistoryState ?? createFileHistoryState();
    if (options?.remoteExecution?.gatewayUrl) {
      const sharedSessionId = options.remoteExecution.sessionId;
      const sharedConfig: RemoteExecutionConfig = {
        ...options.remoteExecution,
        sessionId: sharedSessionId,
      };
      this.remoteExecutionClient = new RemoteExecutionClient(sharedConfig);
      this.remoteExecutionStrategy = sharedConfig.strategy || 'host_only';
      if (this.remoteExecutionStrategy === 'sandbox_full') {
        this.remoteWorkspaceClient = new RemoteWorkspaceClient(sharedConfig);
      }
    }
  }

  private updateFileHistoryState = (
    updater: (prev: FileHistoryState) => FileHistoryState,
  ): void => {
    this.fileHistoryState = updater(this.fileHistoryState);
  };

  setActiveFileHistoryMessageId(messageId: UUID): void {
    this.activeFileHistoryMessageId = messageId;
  }

  async ensureFileHistoryInitialized(messageId: UUID): Promise<void> {
    if (this.fileHistoryState.snapshots.length > 0) return;
    this.activeFileHistoryMessageId = messageId;
    await fileHistoryMakeSnapshot(this.updateFileHistoryState, messageId);
  }

  async finalizeFileHistorySnapshot(messageId: UUID): Promise<FileHistorySnapshot | undefined> {
    this.activeFileHistoryMessageId = messageId;
    return fileHistoryMakeSnapshot(this.updateFileHistoryState, messageId);
  }

  getFileHistoryState(): FileHistoryState {
    return this.fileHistoryState;
  }

  restoreFileHistorySnapshots(entries: FileHistorySnapshotEntry[]): void {
    const snapshots: FileHistorySnapshot[] = entries.map((entry) => ({
      messageId: entry.messageId,
      trackedFileBackups: entry.trackedFileBackups,
      timestamp: new Date(entry.timestamp),
    }));
    const trackedFiles = new Set<string>();
    for (const snapshot of snapshots) {
      for (const trackedPath of Object.keys(snapshot.trackedFileBackups)) {
        trackedFiles.add(trackedPath);
      }
    }
    this.fileHistoryState = {
      snapshots,
      trackedFiles,
      snapshotSequence: snapshots.length,
    };
  }

  private currentMode: AgentMode = 'agent';

  /** Bind abort signal so /stop can kill in-flight shell commands. */
  setAbortSignal(signal?: AbortSignal): void {
    this.abortSignal = signal;
  }

  /** Kill foreground shell children (gateway /stop interrupt). */
  interruptActiveCommands(): number {
    return this.processRegistry.killAllForeground('SIGTERM');
  }

  /**
   * Set the current agent mode
   *
   * Changes the tool executor's operating mode, which affects:
   * - Tool permissions (what tools are available)
   * - Dry-run default (some modes preview changes by default)
   * - Risk tolerance for operations
   *
   * @example
   * ```typescript
   * executor.setMode('plan');      // Read-only mode
   * executor.setMode('agent');     // Full capabilities
   * executor.setMode('security');  // Security-focused mode
   * ```
   *
   * @param mode - Agent mode to switch to
   *
   * @category Mode Management
   * @since 0.1.0
   */
  setMode(mode: AgentMode) {
    this.currentMode = mode;
    const config = MODE_CONFIG[mode];
    this.dryRun = config.defaultDryRun;
    this.permissionManager.setMode(mode);
  }

  setPermissionMode(permissionMode: PermissionMode) {
    this.permissionManager.setPermissionMode(permissionMode);
  }

  getPermissionContext() {
    return this.permissionManager.getContext();
  }

  /**
   * Safely parse tool input - handles string JSON, null, undefined
   *
   * @param input - Raw tool input (string, object, null, or undefined)
   * @returns Parsed input as object
   *
   * @internal
   */
  private parseInput(input: any): Record<string, any> {
    if (!input) return {};
    if (typeof input === 'string') {
      try { return JSON.parse(input); } catch { return {}; }
    }
    if (typeof input === 'object') return input;
    return {};
  }

  private resolveToolCategory(toolName: string): ReturnType<typeof getToolCategory> {
    return getToolCategory(toolName);
  }

  /**
   * Execute a tool with given input
   *
   * Main tool execution pipeline that:
   * 1. Checks tool permissions for current mode
   * 2. Routes MCP tools to external servers
   * 3. Routes plugin tools to plugin manager
   * 4. Performs safety assessment for risky operations
   * 5. Executes the tool implementation
   * 6. Returns structured result
   *
   * @example
   * ```typescript
   * // Read a file
   * const result = await executor.execute('read_file', {
   *   path: 'src/app.ts'
   * });
   *
   * if (result.success) {
   *   console.log(result.content);
   * }
   *
   * // Edit a file
   * await executor.execute('edit_file', {
   *   path: 'src/app.ts',
   *   search: 'const old = 1;',
   *   replace: 'const new = 2;'
   * });
   *
   * // Run a command
   * await executor.execute('run_command', {
   *   command: 'npm test'
   * });
   * ```
   *
   * @param toolName - Name of the tool to execute (e.g., 'read_file', 'edit_file')
   * @param input - Tool input parameters (varies by tool)
   * @returns Tool execution result with success/error status
   *
   * @see {@link getTools} for list of available tools
   * @category Tool Execution
   * @since 0.1.0
   */
  async execute(toolName: string, input: any): Promise<any> {
    const p = this.parseInput(input);
    const category = this.resolveToolCategory(toolName);

    // Check tool permissions
    // Special exception: Allow writing implementations.md in plan mode
    let permission = isToolAllowed(this.currentMode, toolName);

    if (this.currentMode === 'plan' && toolName === 'write_file') {
      const isImplPlan = p.path && (p.path === 'implementations.md' || p.path.endsWith('/implementations.md'));
      if (isImplPlan) {
        permission = { allowed: true };
      }
    }

    if (this.currentMode === 'pentest' && toolName === 'write_file') {
      const isPentestReport = p.path && (p.path === 'pentest-report.md' || p.path.endsWith('/pentest-report.md'));
      if (isPentestReport) {
        permission = { allowed: true };
      }
    }

    if (!permission.allowed) {
      return {
        error: true,
        success: false,
        message: `PERMISSION DENIED: ${permission.reason}. Please delegate this task to the appropriate agent using [[REQUEST_MODE: <mode> | reason=...]].`,
        blocked: true
      };
    }

    const permissionDecision = this.permissionManager.evaluateToolExecution(p, toolName, category);
    if (!permissionDecision.allowed) {
      return {
        error: true,
        success: false,
        message: permissionDecision.reason ?? 'Permission denied by runtime permission manager',
        blocked: true,
        requiresApproval: permissionDecision.requiresApproval,
      };
    }

    if (
      category &&
      (p.confirm === true || p.approved === true) &&
      (p.approval_scope === 'session' || p.approval_scope === 'directory')
    ) {
      this.permissionManager.grantToolApproval(
        toolName,
        category,
        p.approval_scope as ApprovalScope,
        typeof p.path === 'string' ? p.path : undefined,
      );
    }

    // Check if it's an MCP tool (format: serverName::toolName)
    // Harden dispatch: only route if server is currently connected.
    if (this.mcpClientManager && toolName.includes('::')) {
      const serverName = toolName.split('::')[0];
      if (serverName && this.mcpClientManager.isConnected(serverName)) {
      try {
        const result = await this.mcpClientManager.executeMCPTool(toolName, p);
        return {
          success: true,
          ...result,
        };
      } catch (error: any) {
        return {
          error: true,
          success: false,
          message: error.message,
        };
      }
      }
    }

    // Check if it's a plugin tool
    if (this.pluginManager.isPluginTool(toolName)) {
      return this.pluginManager.executePluginTool(toolName, p);
    }

    // Safety assessment for risky operations
    const riskAssessment = this.safetyChecker.assessToolRisk(toolName, p);

    // Check for blocked commands in run_command
    if (toolName === 'run_command' && p.command) {
      const blockCheck = this.safetyChecker.isCommandBlocked(p.command);
      if (blockCheck.blocked) {
        return {
          error: true,
          success: false,
          message: `Command blocked: ${blockCheck.reason}`,
          blocked: true,
        };
      }

      // Suggest safer alternative if available
      const suggestion = this.safetyChecker.suggestSaferAlternative(p.command);
      if (suggestion && riskAssessment.level === 'high') {
        riskAssessment.warnings.push(`Suggestion: ${suggestion}`);
      }
    }

    // Gateway / interactive: pause on high-risk tools until the user approves
    if (riskAssessment.level === 'high' && this.onDangerousApproval) {
      const approvalKey = this.approvalKey(toolName, p);
      if (
        !this.sessionApprovedKeys.has(approvalKey) &&
        !this.alwaysApprovedKeys.has(approvalKey)
      ) {
        const reason =
          riskAssessment.reasons[0] ||
          riskAssessment.warnings[0] ||
          'High-risk operation';
        const choice = await this.onDangerousApproval({
          toolName,
          reason,
          level: riskAssessment.level,
          command: typeof p.command === 'string' ? p.command : undefined,
          path: typeof p.path === 'string' ? p.path : undefined,
          warnings: riskAssessment.warnings,
        });
        if (choice === 'deny') {
          return {
            error: true,
            success: false,
            message: `Denied by user: ${reason}`,
            denied: true,
            blocked: true,
          };
        }
        if (choice === 'session') this.sessionApprovedKeys.add(approvalKey);
        if (choice === 'always') {
          this.alwaysApprovedKeys.add(approvalKey);
          this.sessionApprovedKeys.add(approvalKey);
        }
      }
    }

    try {
    if (this.dynamicTools.has(toolName)) {
      return this.runDynamicTool(toolName, p);
    }
    switch (toolName) {
      case 'read_file': {
        if (!p.path || typeof p.path !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: path (string). Example: {"path": "src/index.ts"}' };
        }
        return this.readFile(p.path, p.start_line, p.end_line);
      }

      case 'read_multiple_files': {
        if (!Array.isArray(p.paths) || p.paths.length === 0) {
          return { error: true, success: false, message: 'Missing required parameter: paths (non-empty array of strings). Example: {"paths": ["file1.ts", "file2.ts"]}' };
        }
        const validPaths = p.paths.filter((x: any) => typeof x === 'string');
        if (validPaths.length === 0) {
          return { error: true, success: false, message: 'paths array must contain strings. Example: {"paths": ["file1.ts", "file2.ts"]}' };
        }
        return this.readMultipleFiles(validPaths);
      }

      case 'write_file': {
        if (!p.path || typeof p.path !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: path (string)' };
        }
        if (typeof p.content !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: content (string)' };
        }
        return this.writeFile(p.path, p.content);
      }

      case 'edit_file': {
        if (!p.path || typeof p.path !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: path (string)' };
        }
        if (typeof p.search !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: search (string)' };
        }
        if (typeof p.replace !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: replace (string)' };
        }
        return this.editFile(p.path, p.search, p.replace, p.all);
      }

      case 'edit_lines': {
        if (!p.path || typeof p.path !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: path (string)' };
        }
        if (typeof p.start_line !== 'number' || typeof p.end_line !== 'number') {
          return { error: true, success: false, message: 'Missing required parameters: start_line, end_line (numbers)' };
        }
        if (typeof p.new_content !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: new_content (string)' };
        }
        return this.editLines(p.path, p.start_line, p.end_line, p.new_content);
      }

      case 'insert_at_line': {
        if (!p.path || typeof p.path !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: path (string)' };
        }
        if (typeof p.line !== 'number') {
          return { error: true, success: false, message: 'Missing required parameter: line (number)' };
        }
        return this.insertAtLine(p.path, p.line, p.content ?? '');
      }

      case 'verified_edit': {
        if (!p.path || typeof p.path !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: path (string)' };
        }
        if (typeof p.start_line !== 'number' || typeof p.end_line !== 'number') {
          return { error: true, success: false, message: 'Missing required parameters: start_line, end_line (numbers)' };
        }
        if (typeof p.old_content !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: old_content (string) - the content currently at those lines' };
        }
        if (typeof p.new_content !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: new_content (string)' };
        }
        return this.verifiedEditFile(p.path, p.start_line, p.end_line, p.old_content, p.new_content);
      }

      case 'list_directory':
        return this.listDirectory(p.path || '.');

      case 'search_files': {
        if (!p.pattern || typeof p.pattern !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: pattern (string). Example: {"pattern": "**/*.ts"}' };
        }
        return this.searchFiles(p.pattern, p.path);
      }

      case 'run_command': {
        if (!p.command || typeof p.command !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: command (string)' };
        }
        return this.runCommand(p.command, p.cwd, p.input, p.timeout, p.max_output_chars, {
          background: p.background === true,
        });
      }

      case 'check_process': {
        const id = typeof p.process_id === 'string' ? p.process_id : typeof p.id === 'string' ? p.id : '';
        if (!id) {
          return {
            error: true,
            success: false,
            message: 'Missing process_id. Use the id returned by a background run_command.',
          };
        }
        const polled = this.processRegistry.poll(id, {
          tail: typeof p.tail === 'number' ? p.tail : 4000,
        });
        if (!polled.found || !polled.session) {
          return { error: true, success: false, message: `Unknown process_id: ${id}` };
        }
        const s = polled.session;
        return {
          success: true,
          process_id: s.id,
          status: s.status,
          pid: s.pid,
          command: s.command,
          cwd: s.cwd,
          exitCode: s.exitCode,
          uptime_ms: (s.finishedAt || Date.now()) - s.startedAt,
          stdout_tail: polled.stdoutTail,
          stderr_tail: polled.stderrTail,
          error: s.error,
        };
      }

      case 'kill_process': {
        const id = typeof p.process_id === 'string' ? p.process_id : typeof p.id === 'string' ? p.id : '';
        if (!id) {
          return { error: true, success: false, message: 'Missing process_id' };
        }
        const result = this.processRegistry.kill(id);
        return {
          success: result.ok,
          error: result.ok ? false : true,
          message: result.message,
          process_id: id,
        };
      }

      case 'list_processes': {
        const onlyRunning = p.running !== false;
        const list = this.processRegistry.list(onlyRunning).map((s) => ({
          process_id: s.id,
          status: s.status,
          pid: s.pid,
          command: s.command.slice(0, 120),
          uptime_ms: (s.finishedAt || Date.now()) - s.startedAt,
        }));
        return { success: true, processes: list, count: list.length };
      }

      case 'ask_user': {
        if (!p.question || typeof p.question !== 'string') {
          return {
            error: true,
            success: false,
            message: 'Missing required parameter: question (string)',
          };
        }
        if (!this.onAskUser) {
          return {
            error: true,
            success: false,
            message:
              'ask_user is only available in interactive gateway/chat. Rephrase as a final reply instead.',
          };
        }
        let choices: string[] | undefined;
        if (Array.isArray(p.choices)) {
          choices = p.choices
            .map((c: any) => (typeof c === 'string' ? c.trim() : ''))
            .filter(Boolean)
            .slice(0, 4);
          if (!choices.length) choices = undefined;
        }
        try {
          const answer = await this.onAskUser({
            question: p.question.trim(),
            choices,
          });
          return {
            success: true,
            question: p.question.trim(),
            answer: String(answer || '').trim(),
            choices,
          };
        } catch (err: any) {
          return {
            error: true,
            success: false,
            message: err?.message || 'ask_user failed or timed out',
          };
        }
      }

      case 'create_directory': {
        if (!p.path || typeof p.path !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: path (string)' };
        }
        return this.createDirectory(p.path);
      }

      case 'delete_file': {
        if (!p.path || typeof p.path !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: path (string)' };
        }
        return this.deleteFile(p.path);
      }

      case 'move_file': {
        if (!p.source || typeof p.source !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: source (string)' };
        }
        if (!p.destination || typeof p.destination !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: destination (string)' };
        }
        return this.moveFile(p.source, p.destination);
      }

      case 'get_context': {
        if (!Array.isArray(p.files)) {
          return { error: true, success: false, message: 'Missing required parameter: files (array of strings)' };
        }
        return this.getContext(p.files.filter((f: any) => typeof f === 'string'));
      }

      case 'revert_file': {
        if (this.isSandboxFullMode()) {
          return {
            error: true,
            success: false,
            message: 'revert_file is currently unavailable in sandbox_full mode.',
          };
        }
        if (typeof p.message_id !== 'string' && typeof p.path !== 'string') {
          return {
            error: true,
            success: false,
            message: 'Missing required parameter: message_id (string UUID) or path (string with snapshot_index)',
          };
        }
        return this.revertFile(p.message_id, p.path, p.snapshot_index, p.backup_index);
      }

      case 'run_tests': {
        return this.runTests(p.command, p.cwd);
      }

      case 'get_test_status': {
        return this.getTestStatus();
      }

      case 'get_git_status': {
        return this.getGitStatus();
      }

      case 'get_git_diff_summary': {
        return this.getGitDiffSummary(p.target);
      }

      case 'get_git_changed_files': {
        return this.getGitChangedFiles(p.target);
      }

      case 'git_commit': {
        if (!p.message || typeof p.message !== 'string') return { error: true, success: false, message: 'Missing message' };
        return this.gitCommit(p.message, p.agent_name);
      }

      case 'git_blame_ai': {
        if (!p.file_path || typeof p.file_path !== 'string') return { error: true, success: false, message: 'Missing file_path' };
        return this.gitBlameAi(p.file_path);
      }

      case 'create_git_checkpoint': {
        if (!p.message || typeof p.message !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: message (string)' };
        }
        return this.createGitCheckpoint(p.message, p.strategy);
      }

      case 'revert_to_git_checkpoint': {
        if (!p.checkpoint_id || typeof p.checkpoint_id !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: checkpoint_id (string)' };
        }
        if (!p.confirm) {
          return { error: true, success: false, message: 'Revert requires explicit confirmation. Set confirm: true' };
        }
        return this.revertToGitCheckpoint(p.checkpoint_id, p.checkpoint_type, p.confirm);
      }

      case 'git_show_diff': {
        return this.gitShowDiff(p.file_path, p.target);
      }

      case 'mcp_list_resources': {
        if (!this.mcpClientManager) return { success: true, resources: [] };
        const resources = this.mcpClientManager.getAvailableResources().map((r) => ({
          server: r.serverName,
          uri: r.uri,
          name: r.name,
          mimeType: r.mimeType,
          description: r.description,
        }));
        return { success: true, resources, count: resources.length };
      }

      case 'mcp_read_resource': {
        if (!this.mcpClientManager) return { error: true, success: false, message: 'No MCP manager available' };
        if (!p.uri || typeof p.uri !== 'string') return { error: true, success: false, message: 'Missing uri (string)' };
        const result = await this.mcpClientManager.readResource(p.uri);
        return { success: true, ...result };
      }

      case 'mcp_list_prompts': {
        if (!this.mcpClientManager) return { success: true, prompts: [] };
        const prompts = this.mcpClientManager.getAvailablePrompts().map((pr) => ({
          server: pr.serverName,
          name: pr.name,
          description: pr.description,
          arguments: (pr as any).arguments,
        }));
        return { success: true, prompts, count: prompts.length };
      }

      case 'mcp_get_prompt': {
        if (!this.mcpClientManager) return { error: true, success: false, message: 'No MCP manager available' };
        if (!p.name || typeof p.name !== 'string') return { error: true, success: false, message: 'Missing name (string, format server::promptName)' };
        const args = p.args && typeof p.args === 'object' ? p.args : undefined;
        const result = await this.mcpClientManager.getPrompt(p.name, args);
        return { success: true, ...result };
      }

      case 'mcp_auth': {
        return this.mcpAuth(p);
      }

      case 'get_mcp_status': {
        return this.getMCPStatus();
      }

      case 'grep_code': {
        if (!p.pattern || typeof p.pattern !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: pattern (string)' };
        }
        return this.grepCode(p.pattern, p.path, p.ignore_case, p.file_pattern, p.max_results);
      }

      case 'web_search': {
        if (!p.query || typeof p.query !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: query (string)' };
        }
        return this.webSearch(p.query, p.max_results);
      }

      case 'fetch_url': {
        if (!p.url || typeof p.url !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: url (string)' };
        }
        return this.fetchUrl(p.url, p.max_length);
      }

      case 'update_memory': {
        if (!p.content || typeof p.content !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: content (string)' };
        }
        return this.updateMemory(p.content, p.append);
      }

      case 'remember_lesson': {
        if (!this.memory) {
          return { error: true, success: false, message: 'Memory system is not initialized.' };
        }
        if (!p.trigger || typeof p.trigger !== 'string') return { error: true, success: false, message: 'Missing trigger' };
        if (!p.action || typeof p.action !== 'string') return { error: true, success: false, message: 'Missing action' };
        if (!p.outcome || typeof p.outcome !== 'string') return { error: true, success: false, message: 'Missing outcome' };

        await this.memory.addMemory(p.trigger, p.action, p.outcome, p.tags || []);
        return {
          success: true,
          done: true,
          message: 'Lesson learned and saved to neural memory.',
          note: 'Write saved. This update is complete — do not repeat it.',
        };
      }

      case 'curated_memory': {
        return this.curatedMemoryAction(p);
      }

      case 'session_search': {
        if (!p.query || typeof p.query !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: query' };
        }
        return this.sessionSearchAction(p.query, p.limit);
      }

      case 'save_skill': {
        if (!p.name || typeof p.name !== 'string') {
          return { error: true, success: false, message: 'Missing name' };
        }
        if (!p.content || typeof p.content !== 'string') {
          return { error: true, success: false, message: 'Missing content (skill body markdown)' };
        }
        return this.saveSkillAction(p.name, p.description, p.content, p.tags);
      }

      case 'list_skills': {
        // Ensure skills are loaded (daemon/chat may call before loadSkills)
        try {
          await this.skillManager.loadSkills();
        } catch {
          /* best-effort */
        }
        const catalog = this.skillManager.listSkillsCatalog({
          query: typeof p.query === 'string' ? p.query : undefined,
          limit: typeof p.limit === 'number' ? p.limit : undefined,
        });
        return {
          success: true,
          count: catalog.length,
          skills: catalog,
          hint: 'Call view_skill with a skill name to load full instructions before applying them.',
        };
      }

      case 'view_skill': {
        const name = typeof p.name === 'string' ? p.name : typeof p.skill === 'string' ? p.skill : '';
        if (!name.trim()) {
          return { error: true, success: false, message: 'Missing required parameter: name (skill name)' };
        }
        try {
          await this.skillManager.loadSkills();
        } catch {
          /* best-effort */
        }
        const result = this.skillManager.viewSkill(name);
        if (!result.ok) {
          return { error: true, success: false, message: result.message };
        }
        const s = result.skill;
        return {
          success: true,
          name: s.name,
          description: s.description,
          provenance: s.provenance,
          tags: s.tags,
          instructions: s.instructions,
          filePath: s.filePath,
        };
      }

      case 'take_screenshot': {
        if (!p.url || typeof p.url !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: url (string)' };
        }
        if (!p.path || typeof p.path !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: path (string)' };
        }
        return this.takeScreenshot(p.url, p.path, p.fullPage !== false);
      }
      case 'get_console_logs':
      case 'run_visual_test':
      case 'check_accessibility':
      case 'measure_performance':
      case 'test_responsive':
      case 'capture_network':
      case 'preview_app':
        return { error: true, success: false, message: NO_EMBEDDED_BROWSER_MESSAGE };

      case 'search_skills_sh': {
        if (!p.query || typeof p.query !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: query (string)' };
        }
        return this.searchSkillsSh(p.query);
      }

      case 'install_skill_from_skills_sh': {
        if (!p.skill_id || typeof p.skill_id !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: skill_id (string)' };
        }
        return this.installSkillFromSkillsSh(p.skill_id);
      }

      // AI Test Generation Tools
      case 'generate_tests': {
        if (!p.file_path || typeof p.file_path !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: file_path (string)' };
        }
        return this.generateTests(p.file_path, {
          framework: p.framework,
          outputDir: p.output_dir,
          includeEdgeCases: p.include_edge_cases,
          includeMocks: p.include_mocks,
          maxTestsPerFunction: p.max_tests_per_function,
        }, p.write_file);
      }

      case 'mine_project_patterns': {
        const patterns = await this.patternMiner.mine();
        if (patterns.length === 0) {
          return { success: true, message: 'No significant repeated patterns found in the project.' };
        }

        // Format for AI consumption
        const summary = patterns.map(p =>
          `Pattern: ${p.description}\n` +
          `- Occurrences: ${p.frequency}\n` +
          `- Locations: ${p.chunks.map(c => `${path.relative(this.workingDir, c.filePath)}:${c.startLine}`).join(', ')}\n` +
          `- Example Code:\n\`\`\`typescript\n${p.chunks[0].content}\n\`\`\`\n`
        ).join('\n---\n\n');

        return {
          success: true,
          message: `Found ${patterns.length} pattern clusters.`,
          patterns: summary
        };
      }

      case 'start_background_task': {
        if (!p.prompt || typeof p.prompt !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: prompt (string)' };
        }
        const taskId = await this.backgroundAgent.startTask(p.prompt);
        return { success: true, message: `Background task started with ID: ${taskId}`, task_id: taskId };
      }

      case 'list_background_tasks': {
        const tasks = await this.backgroundAgent.listTasks();
        const summary = tasks.map(t =>
          `ID: ${t.id} | Status: ${t.status} | Started: ${new Date(t.startTime).toISOString()} | Prompt: "${t.prompt.substring(0, 50)}..."`
        ).join('\n');
        return { success: true, message: `Active Tasks:\n${summary || 'No active tasks.'}`, tasks };
      }

      case 'check_background_task': {
        if (!p.task_id || typeof p.task_id !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: task_id (string)' };
        }
        const logs = await this.backgroundAgent.getTaskLogs(p.task_id);
        const task = await this.backgroundAgent.getTask(p.task_id);
        return { success: true, task, logs };
      }
      case 'search_code_graph': {
        if (!p.query || typeof p.query !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: query (symbol name)' };
        }
        const results = await this.codeGraph.findReferences(p.query);
        return { success: true, message: results };
      }

      case 'analyze_code_for_tests': {
        if (!p.file_path || typeof p.file_path !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: file_path (string)' };
        }
        return this.analyzeCodeForTests(p.file_path);
      }

      case 'resolve_merge_conflicts': {
        const files = await this.conflictSolver.findConflictingFiles();
        if (files.length === 0) {
          return { success: true, message: 'No merge conflicts found in the project.' };
        }

        // If specific file requested, use it; otherwise default to first
        const targetFile = (p.file_path && typeof p.file_path === 'string') ? p.file_path : files[0];

        // Ensure target is in the list or we try to parse it anyway
        const conflictData = await this.conflictSolver.parseConflicts(targetFile);

        if (!conflictData) {
          return { success: false, message: `Could not parse conflicts in ${targetFile}. Markers might be missing or malformed.`, other_files: files };
        }

        return {
          success: true,
          message: `Found ${files.length} conflicting files. Showing conflicts for: ${targetFile}`,
          conflicts: conflictData.conflicts.map(c => ({
            id: c.index,
            lines: `${c.startLine}-${c.endLine}`,
            ours: c.ours,
            theirs: c.theirs,
            base: c.base
          })),
          other_conflicting_files: files.filter(f => f !== targetFile)
        };
      }

      case 'delegate_subtask': {
        if (!p.task || typeof p.task !== 'string') return { error: true, success: false, message: 'Missing task' };
        if (!p.worker_type || typeof p.worker_type !== 'string') return { error: true, success: false, message: 'Missing worker_type (agent mode)' };

        if (!isValidMode(p.worker_type)) {
          return { error: true, success: false, message: `Invalid worker_type: ${p.worker_type}. Must be a valid AgentMode.` };
        }

        const result = await this.swarmOrchestrator.delegateSubtask(p.worker_type as AgentMode, p.task);
        return {
          success: result.success,
          result: result.result,
          status: result.status,
          worker: p.worker_type
        };
      }

      case 'run_swarm': {
        const subtasks = p.subtasks;
        if (!Array.isArray(subtasks) || subtasks.length === 0) {
          return { error: true, success: false, message: 'run_swarm requires a non-empty subtasks array' };
        }
        const normalized: { mode: AgentMode; task: string }[] = [];
        for (let i = 0; i < subtasks.length; i++) {
          const st = subtasks[i] as Record<string, unknown>;
          if (!st || typeof st !== 'object') {
            return { error: true, success: false, message: `Invalid subtasks[${i}]: expected object` };
          }
          const task = st.task;
          const worker_type = st.worker_type;
          if (typeof task !== 'string' || !task.trim()) {
            return { error: true, success: false, message: `subtasks[${i}].task must be a non-empty string` };
          }
          if (typeof worker_type !== 'string' || !isValidMode(worker_type)) {
            return {
              error: true,
              success: false,
              message: `subtasks[${i}].worker_type must be a valid AgentMode (got ${String(worker_type)})`,
            };
          }
          normalized.push({ mode: worker_type as AgentMode, task: task.trim() });
        }

        const timeoutMs =
          typeof p.timeout_ms === 'number' && Number.isFinite(p.timeout_ms) && p.timeout_ms > 0
            ? Math.floor(p.timeout_ms)
            : undefined;
        const maxConcurrent =
          typeof p.max_parallel === 'number' && Number.isFinite(p.max_parallel) && p.max_parallel > 0
            ? Math.floor(p.max_parallel)
            : undefined;

        const results = await this.swarmOrchestrator.delegateSubtasksParallel(normalized, {
          timeoutMs,
          maxConcurrent,
        });
        const success = results.every((r) => r.success);
        return {
          success,
          parallel: true,
          results,
          message: success
            ? 'All swarm subtasks finished successfully.'
            : 'One or more swarm subtasks failed, timed out, or were killed.',
        };
      }

      case 'synthesize_tool': {
        const name = typeof p.name === 'string' ? p.name.trim() : '';
        const description = typeof p.description === 'string' ? p.description.trim() : '';
        const script = typeof p.script === 'string' ? p.script.trim() : '';
        if (!name || !script) {
          return { error: true, success: false, message: 'Missing required parameters: name (string), script (string). description is optional.' };
        }
        if (!/^[a-z][a-z0-9_]*$/.test(name)) {
          return { error: true, success: false, message: 'Tool name must be lowercase letters, numbers, underscores only (e.g. my_helper).' };
        }
        const reserved = new Set(['read_file', 'write_file', 'run_command', 'synthesize_tool', 'get_context']);
        if (reserved.has(name)) {
          return { error: true, success: false, message: `Cannot override built-in tool: ${name}` };
        }
        this.dynamicTools.set(name, { description: description || name, script });
        return { success: true, message: `Tool "${name}" registered. You can call it with the same name. Execution is sandboxed.` };
      }

      default:
        return { error: true, success: false, message: `Unknown tool: ${toolName}. Available tools: read_file, read_multiple_files, write_file, edit_file, edit_lines, insert_at_line, verified_edit, list_directory, search_files, run_command, create_directory, delete_file, move_file, get_context, revert_file, run_tests, get_test_status, get_git_status, get_git_diff_summary, get_git_changed_files, create_git_checkpoint, revert_to_git_checkpoint, git_show_diff, get_mcp_status, grep_code, web_search, fetch_url, remember_lesson, synthesize_tool, list_skills, view_skill, save_skill, take_screenshot, get_console_logs, run_visual_test, check_accessibility, measure_performance, test_responsive, capture_network, search_skills_sh, install_skill_from_skills_sh, preview_app, delegate_subtask, run_swarm` };
    }
    } catch (err: any) {
      return { error: true, success: false, message: err?.message ?? String(err) };
    }
  }

  /**
   * Get all available tools for the agent
   *
   * Returns an array of tool definitions including core tools, plugin tools,
   * and MCP tools. Each tool includes:
   * - name: Tool identifier
   * - description: What the tool does (for Claude AI)
   * - input_schema: JSON Schema for input validation
   *
   * Tools are grouped by category:
   * - File Operations: read_file, write_file, edit_file, etc.
   * - Git Operations: get_git_status, git_commit, etc.
   * - Shell Commands: run_command, interactive_shell
   * - Web Operations: web_search, fetch_url, http_request
   * - Context Operations: grep_code, search_files, get_context
   * - Test Operations: run_tests, get_test_status
   * - Memory Operations: update_memory
   * - Browser Operations: open_browser, browser_click, etc.
   *
   * @example
   * ```typescript
   * const tools = executor.getTools();
   * console.log(`${tools.length} tools available`);
   *
   * // Find a specific tool
   * const readFile = tools.find(t => t.name === 'read_file');
   * console.log(readFile.description);
   * ```
   *
   * @returns Array of tool definitions with schemas
   *
   * @category Tool Management
   * @since 0.1.0
   */
  private approvalKey(toolName: string, params: Record<string, any>): string {
    if (typeof params.command === 'string') {
      return `${toolName}:cmd:${params.command.trim()}`;
    }
    if (typeof params.path === 'string') {
      return `${toolName}:path:${params.path}`;
    }
    return `${toolName}:${JSON.stringify(params).slice(0, 200)}`;
  }

  getTools(): Tool[] {
    const coreTools: Tool[] = [
      {
        name: 'read_file',
        description:
          'Read text file contents. For large files, can read specific line ranges to avoid token limits. Always use this before editing text files. Do NOT use this to "view" images (.png, .jpg, etc.) — it cannot decode pixels; use a user message that names the image path for vision, or run_command for metadata (file, identify).',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file to read',
            },
            start_line: {
              type: 'number',
              description: 'Optional: Start line number (1-indexed) for partial read',
            },
            end_line: {
              type: 'number',
              description: 'Optional: End line number for partial read',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'read_multiple_files',
        description: 'Read multiple files at once efficiently. Good for getting project context.',
        input_schema: {
          type: 'object',
          properties: {
            paths: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of file paths to read',
            },
          },
          required: ['paths'],
        },
      },
      {
        name: 'write_file',
        description: 'Write content to a file. Creates new file or overwrites existing. For editing existing files, prefer edit_file instead.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file',
            },
            content: {
              type: 'string',
              description: 'Full content to write',
            },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'edit_file',
        description: 'Edit file by searching for exact text and replacing it. MOST RELIABLE for making changes. The search string must be unique in the file.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to file to edit',
            },
            search: {
              type: 'string',
              description: 'Exact text to find (must be unique)',
            },
            replace: {
              type: 'string',
              description: 'Text to replace it with',
            },
            all: {
              type: 'boolean',
              description: 'Replace all occurrences (default: false, requires unique match)',
            },
          },
          required: ['path', 'search', 'replace'],
        },
      },
      {
        name: 'edit_lines',
        description: 'Edit specific line range in a file. Good for large files when you know the line numbers.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to file',
            },
            start_line: {
              type: 'number',
              description: 'Start line number (1-indexed)',
            },
            end_line: {
              type: 'number',
              description: 'End line number (inclusive)',
            },
            new_content: {
              type: 'string',
              description: 'New content to replace those lines',
            },
          },
          required: ['path', 'start_line', 'end_line', 'new_content'],
        },
      },
      {
        name: 'insert_at_line',
        description: 'Insert content at a specific line number without replacing existing content.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to file',
            },
            line: {
              type: 'number',
              description: 'Line number to insert at (1-indexed)',
            },
            content: {
              type: 'string',
              description: 'Content to insert',
            },
          },
          required: ['path', 'line', 'content'],
        },
      },
      {
        name: 'verified_edit',
        description: 'MOST RELIABLE file editing tool. Edit a file by specifying the exact line range, the old content that should currently be at those lines (for verification), and the new content to replace it with. If old_content does not match what is actually in the file, the edit is REJECTED and the actual content is returned so you can retry. ALWAYS use read_file first to get the current content and line numbers before using this tool. This is PREFERRED over edit_file and edit_lines for accuracy.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to file to edit',
            },
            start_line: {
              type: 'number',
              description: 'Start line number (1-indexed) of the content to replace',
            },
            end_line: {
              type: 'number',
              description: 'End line number (inclusive)',
            },
            old_content: {
              type: 'string',
              description: 'The content currently at those lines (for verification)',
            },
            new_content: {
              type: 'string',
              description: 'New content to replace those lines',
            },
          },
          required: ['path', 'start_line', 'end_line', 'old_content', 'new_content'],
        },
      },
      {
        name: 'mine_project_patterns',
        description: 'Analyze the project codebase to find repeated code patterns, structural duplication, and similar logic. Returns a list of pattern clusters that can be used to synthesize new skills.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'preview_app',
        description:
          'Disabled: no bundled browser. Returns guidance to use run_command with agent-browser or a browser MCP. Previously captured a screenshot and simplified DOM summary.',
        input_schema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL of the application to preview',
            },
            full_page: {
              type: 'boolean',
              description: 'Capture full page screenshot instead of just viewport (default: false)',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'start_background_task',
        description: 'Start a long-running task in the background. The agent will run in a detached process.',
        input_schema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The task instructions for the background agent',
            },
          },
          required: ['prompt'],
        },
      },
      {
        name: 'list_background_tasks',
        description: 'List all running and completed background tasks.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'check_background_task',
        description: 'Get the logs and status of a specific background task.',
        input_schema: {
          type: 'object',
          properties: {
            task_id: {
              type: 'string',
              description: 'The ID of the task to check',
            },
          },
          required: ['task_id'],
        },
      },
      {
        name: 'search_code_graph',
        description: 'Semantic code search using ts-morph. Finds where a symbol (class, function, variable) is defined and referenced in the project. More powerful than text search for code understanding.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The symbol name to search for (e.g. "User", "authService")' }
          },
          required: ['query']
        }
      },
      {
        name: 'list_directory',
        description: 'List files and directories in a path with metadata.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Directory path (default: current directory)',
            },
          },
        },
      },
      {
        name: 'search_files',
        description: 'Search for files matching a glob pattern. Cross-platform compatible.',
        input_schema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Glob pattern (e.g., "**/*.ts", "src/**/*.js")',
            },
            path: {
              type: 'string',
              description: 'Base path to search from',
            },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'run_command',
        description: `Execute shell command. Platform: ${this.platform}. Default timeout 120s for foreground. For long-lived processes (dev servers: pnpm/npm run dev, vite, next dev, watchers) set background=true — the command returns immediately with a process_id; use check_process to read logs and kill_process to stop. Long-lived commands are auto-backgrounded if you forget. Prefer non-interactive flags (--yes, -y). Do NOT hang on \`pnpm run dev\` in foreground.`,
        input_schema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Command to execute. Prefer non-interactive flags like --yes, -y, --default to avoid prompts.',
            },
            cwd: {
              type: 'string',
              description: 'Working directory (optional)',
            },
            input: {
              type: 'string',
              description: 'Stdin input to send to the command (for interactive prompts). Use \\n to separate multiple answers. Example: "yes\\n\\nmy-project\\n"',
            },
            timeout: {
              type: 'number',
              description: 'Foreground timeout in seconds (default: 120). Ignored when background=true.',
            },
            background: {
              type: 'boolean',
              description:
                'Run detached in the background (for servers/watchers). Returns process_id immediately. Use check_process / kill_process.',
            },
            max_output_chars: {
              type: 'number',
              description: `Maximum stdout/stderr characters to return per stream (default: ${DEFAULT_COMMAND_OUTPUT_CHARS}). Large output is summarized with head/tail context.`,
            },
          },
          required: ['command'],
        },
      },
      {
        name: 'check_process',
        description:
          'Poll a background process started with run_command(background=true). Returns status, exit code, and stdout/stderr tails.',
        input_schema: {
          type: 'object',
          properties: {
            process_id: {
              type: 'string',
              description: 'Process id from background run_command (e.g. proc_…)',
            },
            tail: {
              type: 'number',
              description: 'Max characters of log tail (default 4000)',
            },
          },
          required: ['process_id'],
        },
      },
      {
        name: 'kill_process',
        description: 'Stop a background process by process_id.',
        input_schema: {
          type: 'object',
          properties: {
            process_id: {
              type: 'string',
              description: 'Process id from background run_command',
            },
          },
          required: ['process_id'],
        },
      },
      {
        name: 'list_processes',
        description: 'List tracked background shell processes for this daemon.',
        input_schema: {
          type: 'object',
          properties: {
            running: {
              type: 'boolean',
              description: 'If true (default), only running processes',
            },
          },
        },
      },
      {
        name: 'ask_user',
        description:
          'Ask the human a clarifying question and wait for their reply (gateway chat). Use when you need a decision before continuing. Optional up to 4 choices; user can also type a custom answer.',
        input_schema: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'Question to ask the user',
            },
            choices: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional multiple-choice options (max 4)',
            },
          },
          required: ['question'],
        },
      },
      {
        name: 'create_directory',
        description: 'Create a directory (including parent directories).',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Directory path to create',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'delete_file',
        description: 'Delete a file or directory. USE WITH CAUTION.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to delete',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'move_file',
        description: 'Move or rename a file.',
        input_schema: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              description: 'Source path',
            },
            destination: {
              type: 'string',
              description: 'Destination path',
            },
          },
          required: ['source', 'destination'],
        },
      },
      {
        name: 'get_context',
        description: 'Get intelligent context about files including related files (imports, tests, configs). Use this to understand project structure.',
        input_schema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Primary files to get context for',
            },
          },
          required: ['files'],
        },
      },
      {
        name: 'revert_file',
        description: 'Rewind tracked workspace files to a snapshot message id, or restore one file from snapshot_index.',
        input_schema: {
          type: 'object',
          properties: {
            message_id: {
              type: 'string',
              description: 'Snapshot message UUID to rewind tracked files to (preferred).',
            },
            path: {
              type: 'string',
              description: 'Optional file path for single-file restore mode.',
            },
            snapshot_index: {
              type: 'number',
              description: 'Snapshot index for single-file restore mode (0 = oldest, -1 = latest).',
            },
            backup_index: {
              type: 'number',
              description: 'Deprecated legacy option; ignored when message_id is provided.',
            },
          },
          required: [],
        },
      },
      {
        name: 'run_tests',
        description: 'Run project tests. Automatically detects test runner (Vitest, Jest, Mocha, pytest, Go test, etc.) and package manager (pnpm > bun > npm). Use this to validate changes and fix failing tests.',
        input_schema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Optional: Custom test command to run instead of auto-detected command',
            },
            cwd: {
              type: 'string',
              description: 'Optional: Working directory to run tests in',
            },
          },
        },
      },
      {
        name: 'get_test_status',
        description: 'Get the status of the last test run, including pass/fail counts and failure details.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_git_status',
        description: 'Get current git repository status including branch, staged/unstaged files, and clean/dirty state.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_git_diff_summary',
        description: 'Get a summary of changes with line counts (insertions/deletions) per file.',
        input_schema: {
          type: 'object',
          properties: {
            target: {
              type: 'string',
              description: 'Optional: Target to compare against (default: HEAD). Examples: "HEAD", "main", "origin/main"',
            },
          },
        },
      },
      {
        name: 'get_git_changed_files',
        description: 'Get list of files that have been changed (staged + unstaged). Useful for focusing edits on relevant files.',
        input_schema: {
          type: 'object',
          properties: {
            target: {
              type: 'string',
              description: 'Optional: Target to compare against. If not provided, returns currently changed files.',
            },
          },
        },
      },
      {
        name: 'git_commit',
        description: 'Commit staged changes with optional AI attribution trailer (X-AI-Agent). Use this instead of run_command("git commit") to ensure proper credit.',
        input_schema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Commit message' },
            agent_name: { type: 'string', description: 'Name of the AI agent/persona (e.g. "Arya", "Coder")' }
          },
          required: ['message']
        }
      },
      {
        name: 'git_blame_ai',
        description: 'Get git blame output with AI attribution. Shows who (Human or AI Agent) wrote each line.',
        input_schema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Path to file' }
          },
          required: ['file_path']
        }
      },
      {
        name: 'create_git_checkpoint',
        description: 'Create a safe restore point before making risky changes. Can use git stash or commit strategy.',
        input_schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Description of the checkpoint (e.g., "before refactoring auth module")',
            },
            strategy: {
              type: 'string',
              enum: ['stash', 'commit'],
              description: 'Checkpoint strategy: "stash" (default) or "commit"',
            },
          },
          required: ['message'],
        },
      },
      {
        name: 'revert_to_git_checkpoint',
        description: 'Revert code to a previous checkpoint. REQUIRES explicit confirmation. Use list_checkpoints to see available checkpoints.',
        input_schema: {
          type: 'object',
          properties: {
            checkpoint_id: {
              type: 'string',
              description: 'Checkpoint ID (e.g., "stash@{0}" or commit hash)',
            },
            checkpoint_type: {
              type: 'string',
              enum: ['stash', 'commit'],
              description: 'Type of checkpoint',
            },
            confirm: {
              type: 'boolean',
              description: 'Must be set to true to confirm the revert operation',
            },
          },
          required: ['checkpoint_id', 'checkpoint_type', 'confirm'],
        },
      },
      {
        name: 'git_show_diff',
        description: 'Get unified diff output for a file or entire repository. Useful for reviewing changes.',
        input_schema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Optional: Specific file to get diff for. If not provided, shows all changes.',
            },
            target: {
              type: 'string',
              description: 'Optional: Target to compare against (default: HEAD)',
            },
          },
        },
      },
      {
        name: 'get_mcp_status',
        description: 'Get status of MCP (Model Context Protocol) servers. Shows which servers are configured, connected, and what tools/resources/prompts are available. Use this to check what MCP capabilities you have access to.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'mcp_list_resources',
        description: 'List resources exposed by connected MCP servers.',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'mcp_read_resource',
        description: 'Read an MCP resource by uri. Use uri in server::uri form.',
        input_schema: {
          type: 'object',
          properties: { uri: { type: 'string', description: 'Resource URI in server::uri form' } },
          required: ['uri'],
        },
      },
      {
        name: 'mcp_list_prompts',
        description: 'List prompts exposed by connected MCP servers.',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'mcp_get_prompt',
        description: 'Fetch an MCP prompt template by name (server::promptName) with optional args.',
        input_schema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Prompt name in server::promptName form' },
            args: { type: 'object', description: 'Optional prompt arguments' },
          },
          required: ['name'],
        },
      },
      {
        name: 'mcp_auth',
        description:
          'Authenticate an MCP server using OAuth. Use action=start to get an authUrl; if localhost callback is not reachable, use action=finish with callback_url pasted from the browser.',
        input_schema: {
          type: 'object',
          properties: {
            server: { type: 'string', description: 'MCP server name (as configured)' },
            action: { type: 'string', enum: ['start', 'finish'], description: 'OAuth flow action' },
            callback_url: { type: 'string', description: 'Full callback URL (only for action=finish)' },
          },
          required: ['server'],
        },
      },
      {
        name: 'resolve_merge_conflicts',
        description: 'Scan for git merge conflicts and get details for resolution. Returns the conflict blocks (ours/theirs) so the agent can fix them.',
        input_schema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Optional: Specific file to resolve. If omitted, picks the first conflicting file.' }
          }
        }
      },
      {
        name: 'run_swarm',
        description:
          'Run multiple specialized sub-agents in parallel (separate background processes) to save wall-clock time. Each entry has worker_type + task. Cap concurrent workers with max_parallel (default 6). Risk: workers editing the same files can conflict—split work by disjoint paths or use delegate_subtask serially when unsure.',
        input_schema: {
          type: 'object',
          properties: {
            subtasks: {
              type: 'array',
              description: 'One object per worker; each runs as an isolated sub-agent.',
              items: {
                type: 'object',
                properties: {
                  task: { type: 'string', description: 'Task for this worker only.' },
                  worker_type: {
                    type: 'string',
                    description: 'Agent mode for this worker',
                    enum: ['agent', 'plan', 'review']
                  }
                },
                required: ['task', 'worker_type']
              },
              minItems: 1
            },
            timeout_ms: {
              type: 'number',
              description: 'Optional per-subtask timeout in ms (same as delegate_subtask; default five minutes).'
            },
            max_parallel: {
              type: 'number',
              description: 'Max concurrent background agents (default 6). Lower on small machines; raise only if subtasks are independent.'
            }
          },
          required: ['subtasks']
        }
      },
      {
        name: 'grep_code',
        description: 'Search for a text pattern across your codebase using ripgrep (or grep fallback). Returns matching file paths, line numbers, and line content. Use this to find function usages, variable references, imports, error messages, etc. Much faster than reading files one by one.',
        input_schema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Text or regex pattern to search for',
            },
            path: {
              type: 'string',
              description: 'Directory or file to search in (default: current working directory)',
            },
            ignore_case: {
              type: 'boolean',
              description: 'Case-insensitive search (default: false)',
            },
            file_pattern: {
              type: 'string',
              description: 'Glob pattern to filter files, e.g. "*.ts" or "*.py"',
            },
            max_results: {
              type: 'number',
              description: 'Maximum results to return (default: 50)',
            },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'web_search',
        description: 'Search the web using DuckDuckGo. Returns titles, URLs, and snippets. Use this to look up documentation, find solutions to errors, research libraries, or get up-to-date information. No API key required.',
        input_schema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            max_results: {
              type: 'number',
              description: 'Max results to return (default: 8)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'remember_lesson',
        description: 'Save a key lesson, fix, or optimization to persistent memory. Use this when you solve a tricky problem, fix a build error, or find a better way to do something. This helps you avoid repeating mistakes in the future.',
        input_schema: {
          type: 'object',
          properties: {
            trigger: { type: 'string', description: 'The situation, error, or context that triggered this learning (e.g. "Build failed with error X")' },
            action: { type: 'string', description: 'What you did to fix or improve it' },
            outcome: { type: 'string', description: 'The positive result' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for categorization' }
          },
          required: ['trigger', 'action', 'outcome']
        }
      },
      {
        name: 'curated_memory',
        description:
          'Save durable facts to persistent memory that survive across sessions. Memory is ' +
          'injected into every future session (frozen snapshot at session start), so keep entries ' +
          'compact and high-signal.\n\n' +
          'HOW: prefer ONE call via an "operations" array for multiple changes ' +
          '(each item: {action, content?, old_text?}). The batch applies atomically and the char ' +
          'limit is checked only on the FINAL result — so one call can remove/replace stale ' +
          'entries AND add new ones. Use bare action/content/old_text only for a single change.\n\n' +
          'WHEN: save proactively when the user states a preference, correction, or personal ' +
          'detail, or you learn a stable fact about their environment, conventions, or workflow. ' +
          'Priority: user preferences & corrections > environment facts > procedures. The best ' +
          'memory stops the user repeating themselves.\n\n' +
          'IF FULL: an add is rejected with current entries shown. Reissue as ONE batch that ' +
          'removes or shortens enough stale entries and adds the new one together.\n\n' +
          'TARGETS: "user" = who the user is (name, role, preferences, style). "memory" = your ' +
          'notes (environment, conventions, tool quirks, lessons).\n\n' +
          'SKIP: trivial/obvious info, easily re-discovered facts, raw data dumps, task progress, ' +
          'completed-work logs, temporary TODO state (use session_search for those). Reusable ' +
          'procedures belong in a skill (save_skill), not memory.\n\n' +
          'On success the tool returns done=true and note="Write saved…". Do not repeat the same write.',
        input_schema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['add', 'replace', 'remove'],
              description:
                'Single-op action. Omit when using "operations" batch.',
            },
            target: {
              type: 'string',
              enum: ['memory', 'user'],
              description:
                'memory = agent notes (env/lessons); user = profile/preferences',
            },
            content: {
              type: 'string',
              description: 'Entry content for add/replace (single-op).',
            },
            old_text: {
              type: 'string',
              description:
                'Unique substring identifying an existing entry (required for replace/remove single-op).',
            },
            operations: {
              type: 'array',
              description:
                'Batch: atomic list of {action, content?, old_text?} against the final char budget. Preferred for multi-change or consolidating when full.',
              items: {
                type: 'object',
                properties: {
                  action: {
                    type: 'string',
                    enum: ['add', 'replace', 'remove'],
                  },
                  content: { type: 'string' },
                  old_text: { type: 'string' },
                },
                required: ['action'],
              },
            },
          },
          required: ['target'],
        },
      },
      {
        name: 'session_search',
        description:
          'Search past XibeCode sessions (full-text style) when you need details from prior conversations not in MEMORY.md.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search keywords' },
            limit: { type: 'number', description: 'Max hits (default 8)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'save_skill',
        description:
          'Save a reusable coding procedure as a learned skill (~/.xibecode/skills/learned/). Use after a non-trivial successful workflow you may need again.',
        input_schema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Skill slug (lowercase-hyphen)' },
            description: { type: 'string', description: 'Short description (≤120 chars)' },
            content: { type: 'string', description: 'Skill body markdown: When to Use, Procedure, Pitfalls' },
            tags: { type: 'array', items: { type: 'string' } },
          },
          required: ['name', 'content'],
        },
      },
      {
        name: 'list_skills',
        description:
          'List installed skills (metadata only — progressive disclosure). Use when you need domain workflows beyond the system prompt. Then call view_skill to load full instructions for a chosen skill.',
        input_schema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Optional filter on name/description/tags',
            },
            limit: {
              type: 'number',
              description: 'Max results (default 200)',
            },
          },
        },
      },
      {
        name: 'view_skill',
        description:
          'Load full instructions for a skill by name (after list_skills). Apply the procedure in this turn; do not invent steps that are not in the skill.',
        input_schema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Skill name (e.g. "debug-production", "react-next-patterns")',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'synthesize_tool',
        description: 'Register a new session-scoped tool (meta-agent). Use when you need a reusable script for repeated operations or after repeated failures. The script runs in the same sandbox as run_command. Name must be lowercase with underscores (e.g. my_helper).',
        input_schema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Tool name (lowercase, letters/numbers/underscores only)' },
            description: { type: 'string', description: 'Short description of what the tool does' },
            script: { type: 'string', description: 'Shell command or script to run when the tool is invoked (e.g. "grep -r pattern src/")' }
          },
          required: ['name', 'script']
        }
      },
      {
        name: 'take_screenshot',
        description:
          'Capture a PNG screenshot of a URL (including localhost). Uses agent-browser if installed, else headless Chrome/Chromium. path MUST be under the project working directory (e.g. screenshots/home.png) — never /tmp. On success returns path + a MEDIA: tag — include that line in your final chat reply so Telegram sends the image. For non-image files (pdf, zip, code, …) write the file then put MEDIA:path in the final reply the same way.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to visit (e.g., http://localhost:3000)' },
            path: {
              type: 'string',
              description:
                'Output path under the workspace only (e.g. screenshots/home.png). Absolute /tmp paths are remapped into screenshots/.',
            },
            fullPage: { type: 'boolean', description: 'Capture full page? Default: true' }
          },
          required: ['url', 'path']
        }
      },
      {
        name: 'get_console_logs',
        description:
          'Disabled: no bundled browser. Returns guidance; use agent-browser or host browser tooling for console capture.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to visit' }
          },
          required: ['url']
        }
      },
      {
        name: 'run_visual_test',
        description:
          'Disabled: no bundled browser. Returns guidance; use external visual regression or agent-browser workflows in the target project.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to test (e.g., http://localhost:3000)' },
            baseline_path: { type: 'string', description: 'Path to baseline screenshot file (e.g., baselines/homepage.png)' },
            output_dir: { type: 'string', description: 'Directory for test output (unused; tool disabled)' }
          },
          required: ['url', 'baseline_path']
        }
      },
      {
        name: 'check_accessibility',
        description:
          'Disabled: no bundled browser. Returns guidance; use Lighthouse, axe, or agent-browser in the environment.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to audit (e.g., http://localhost:3000)' }
          },
          required: ['url']
        }
      },
      {
        name: 'measure_performance',
        description:
          'Disabled: no bundled browser. Returns guidance; use Lighthouse or browser DevTools via your workflow.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to measure (e.g., http://localhost:3000)' }
          },
          required: ['url']
        }
      },
      {
        name: 'test_responsive',
        description:
          'Disabled: no bundled browser. Returns guidance; use agent-browser or project E2E tooling for viewport checks.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to test (e.g., http://localhost:3000)' },
            output_dir: { type: 'string', description: 'Directory for screenshots (default: .responsive-screenshots)' },
            viewports: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  width: { type: 'number' },
                  height: { type: 'number' }
                }
              },
              description: 'Custom viewports. Default: mobile (375x667), tablet (768x1024), desktop (1280x800), desktop-large (1920x1080)'
            }
          },
          required: ['url']
        }
      },
      {
        name: 'capture_network',
        description:
          'Disabled: no bundled browser. Returns guidance; use browser DevTools HAR, agent-browser, or MCP browser network logs.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to load and monitor (e.g., http://localhost:3000)' }
          },
          required: ['url']
        }
      },
      {
        name: 'fetch_url',
        description: 'Fetch and read content from any URL. HTML is automatically stripped to plain text. Use this to read documentation pages, API references, blog posts, or any web content. Supports HTML, JSON, and plain text.',
        input_schema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to fetch',
            },
            max_length: {
              type: 'number',
              description: 'Max characters to return (default: 20000). Increase for long docs.',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'update_memory',
        description: 'Save important project knowledge to .xibecode/memory.md so it persists across sessions. Use this to remember: coding conventions, architecture decisions, frequently used commands, project-specific notes, or anything useful for future sessions. The memory file is automatically loaded at the start of each session.',
        input_schema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'Content to save to memory (markdown format recommended)',
            },
            append: {
              type: 'boolean',
              description: 'If true (default), append to existing memory. If false, replace entire memory.',
            },
          },
          required: ['content'],
        },
      },
      {
        name: 'search_skills_sh',
        description: 'Search for AI coding skills from the skills.sh marketplace. Returns a list of available skills with their IDs and descriptions.',
        input_schema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (e.g., "react", "python", "testing")',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'install_skill_from_skills_sh',
        description: 'Install an AI coding skill from skills.sh using its ID found via search_skills_sh. The skill will be downloaded and available for use.',
        input_schema: {
          type: 'object',
          properties: {
            skill_id: {
              type: 'string',
              description: 'The unique ID of the skill to install (e.g., "vercel-labs/agent-skills@vercel-react-best-practices")',
            },
          },
          required: ['skill_id'],
        },
      },
      // AI Test Generation Tools
      {
        name: 'generate_tests',
        description: 'AI-powered test generation. Analyzes a source file and automatically generates comprehensive test cases including unit tests, edge cases, error handling tests, and type checks. Supports Vitest, Jest, Mocha, pytest, and Go test frameworks.',
        input_schema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Path to the source file to generate tests for (e.g., "src/utils/helpers.ts")',
            },
            framework: {
              type: 'string',
              enum: ['vitest', 'jest', 'mocha', 'pytest', 'go'],
              description: 'Test framework to use. Auto-detected if not specified.',
            },
            output_dir: {
              type: 'string',
              description: 'Directory for test output. Default: __tests__ for JS/TS, tests/ for Python, same dir for Go.',
            },
            include_edge_cases: {
              type: 'boolean',
              description: 'Include edge case tests (empty strings, null values, boundary conditions). Default: true',
            },
            include_mocks: {
              type: 'boolean',
              description: 'Include mock setup code for dependencies. Default: true',
            },
            max_tests_per_function: {
              type: 'number',
              description: 'Maximum test cases per function. Default: 5',
            },
            write_file: {
              type: 'boolean',
              description: 'Write generated tests to file. Default: false (returns content only)',
            },
          },
          required: ['file_path'],
        },
      },
      {
        name: 'analyze_code_for_tests',
        description: 'Analyze a source file to understand its structure before generating tests. Returns information about functions, classes, exports, imports, complexity, and dependencies. Useful for understanding what needs to be tested.',
        input_schema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Path to the source file to analyze (e.g., "src/utils/helpers.ts")',
            },
          },
          required: ['file_path'],
        },
      },
    ];

    // Merge MCP tools
    const mcpTools: Tool[] = [];
    if (this.mcpClientManager) {
      const availableMCPTools = this.mcpClientManager.getAvailableTools();
      for (const mcpTool of availableMCPTools) {
        mcpTools.push({
          name: `${mcpTool.serverName}::${mcpTool.name}`,
          description: `[MCP: ${mcpTool.serverName}] ${mcpTool.description}`,
          input_schema: mcpTool.inputSchema,
        });
      }
    }

    // Merge plugin tools
    const pluginTools = this.pluginManager.getPluginTools();
    const dynamicToolDefs: Tool[] = Array.from(this.dynamicTools.entries()).map(([name, def]) => ({
      name,
      description: `[Session tool] ${def.description}`,
      input_schema: { type: 'object' as const, properties: {} },
    }));
    return [...coreTools, ...dynamicToolDefs, ...mcpTools, ...pluginTools];
  }

  /**
   * Resolve relative file path to absolute path
   *
   * @param filePath - Relative or absolute file path
   * @returns Absolute path resolved against working directory
   *
   * @internal
   */
  private resolvePath(filePath: string): string {
    const result = sanitizePath(this.workingDir, filePath);
    if (!result.ok) throw new Error(result.message);
    return result.path;
  }

  /**
   * Screenshot outputs must stay inside the working directory (hosting/E2B
   * rejects paths outside workspace). Remap /tmp and other escapes into
   * screenshots/<basename> so take_screenshot never fails on path alone.
   */
  private resolveScreenshotOutPath(outPath: string): { abs: string; remappedFrom?: string } {
    const raw = String(outPath || '').trim() || `screenshots/shot-${Date.now()}.png`;
    const cleaned = raw
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^file:\/\//i, '');

    const direct = sanitizePath(this.workingDir, cleaned);
    if (direct.ok) {
      let abs = direct.path;
      if (!/\.(png|jpe?g|webp)$/i.test(abs)) abs = `${abs}.png`;
      return { abs };
    }

    const base =
      path.basename(cleaned.replace(/\/+$/, '')) || `shot-${Date.now()}.png`;
    const safeBase =
      base.replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '') || `shot-${Date.now()}.png`;
    const remapped = path.join('screenshots', safeBase);
    const again = sanitizePath(this.workingDir, remapped);
    if (!again.ok) {
      throw new Error(
        `Screenshot path not allowed (${again.message}). Use a path under the project, e.g. screenshots/home.png`,
      );
    }
    let abs = again.path;
    if (!/\.(png|jpe?g|webp)$/i.test(abs)) abs = `${abs}.png`;
    return { abs, remappedFrom: cleaned };
  }

  /**
   * Screenshot a page without bundling Playwright.
   * Prefers agent-browser, then headless Chrome/Chromium.
   * Returns MEDIA: tag for gateway chat delivery to the user.
   */
  private async takeScreenshot(
    url: string,
    outPath: string,
    fullPage = true,
  ): Promise<Record<string, unknown>> {
    const urlResult = sanitizeUrl(url.trim(), true);
    if (!urlResult.ok) {
      return { error: true, success: false, message: urlResult.message };
    }
    const safeUrl = urlResult.url;
    let absOut: string;
    let remappedFrom: string | undefined;
    try {
      const resolved = this.resolveScreenshotOutPath(outPath);
      absOut = resolved.abs;
      remappedFrom = resolved.remappedFrom;
    } catch (e: any) {
      return {
        error: true,
        success: false,
        message:
          e?.message ||
          'Screenshot path must stay inside the project (not /tmp). Use screenshots/home.png',
      };
    }
    await fs.mkdir(path.dirname(absOut), { recursive: true });

    const attempts: string[] = [];
    const tryCmd = async (
      label: string,
      command: string,
      opts?: { timeout?: number },
    ): Promise<boolean> => {
      try {
        await execAsync(command, {
          maxBuffer: 4 * 1024 * 1024,
          timeout: opts?.timeout ?? 60000,
          cwd: this.workingDir,
          env: { ...process.env },
        });
        try {
          const st = await fs.stat(absOut);
          if (st.isFile() && st.size > 0) return true;
        } catch {
          /* file missing */
        }
        attempts.push(`${label}: ran but output missing/empty`);
        return false;
      } catch (err: any) {
        attempts.push(`${label}: ${(err?.stderr || err?.message || err).toString().slice(0, 200)}`);
        return false;
      }
    };

    // Default browser stack: agent-browser (AI-first CLI) → Chromium headless.
    // Prefer agent-browser unless XIBECODE_PREFERRED_BROWSER=chrome|chromium.
    const preferChrome = /^(chrome|chromium|headless)$/i.test(
      (process.env.XIBECODE_PREFERRED_BROWSER || 'agent-browser').trim(),
    );

    const tryAgentBrowser = async (): Promise<Record<string, unknown> | null> => {
      const ab = await whichBinary('agent-browser');
      if (!ab) {
        attempts.push('agent-browser: not on PATH (install: npm i -g agent-browser && agent-browser install)');
        return null;
      }
      const fullFlag = fullPage ? ' --full' : '';
      // open then screenshot; path must be absolute for reliable write
      const ok = await tryCmd(
        'agent-browser',
        `${shellQuote(ab)} open ${shellQuote(safeUrl)} && ${shellQuote(ab)} screenshot${fullFlag} ${shellQuote(absOut)}`,
        { timeout: 90_000 },
      );
      if (ok) {
        return screenshotSuccess(safeUrl, absOut, 'agent-browser', remappedFrom);
      }
      attempts.push(
        'agent-browser: open/screenshot failed — try: agent-browser install --with-deps',
      );
      return null;
    };

    const tryChrome = async (): Promise<Record<string, unknown> | null> => {
      const chrome =
        (await whichBinary('google-chrome-stable')) ||
        (await whichBinary('google-chrome')) ||
        (await whichBinary('chromium')) ||
        (await whichBinary('chromium-browser')) ||
        (await whichBinary('chrome'));
      if (!chrome) {
        attempts.push('chrome/chromium: not on PATH');
        return null;
      }
      const ok = await tryCmd(
        'chrome-headless',
        `${shellQuote(chrome)} --headless=new --disable-gpu --no-sandbox --window-size=1280,800 --screenshot=${shellQuote(absOut)} ${shellQuote(safeUrl)}`,
        { timeout: 60_000 },
      );
      if (ok) {
        return screenshotSuccess(safeUrl, absOut, 'chrome-headless', remappedFrom);
      }
      return null;
    };

    if (!preferChrome) {
      const abHit = await tryAgentBrowser();
      if (abHit) return abHit;
      const chromeHit = await tryChrome();
      if (chromeHit) return chromeHit;
    } else {
      const chromeHit = await tryChrome();
      if (chromeHit) return chromeHit;
      const abHit = await tryAgentBrowser();
      if (abHit) return abHit;
    }

    const attemptText = attempts.length ? `\nAttempts:\n- ${attempts.join('\n- ')}` : '';
    return {
      error: true,
      success: false,
      message:
        `Screenshot FAILED for ${safeUrl} → ${absOut}.${attemptText}\n` +
        `RETRY OPTIONS (pick one, do not hang):\n` +
        `1) run_command: agent-browser open ${safeUrl} && agent-browser screenshot screenshots/retry.png\n` +
        `2) take_screenshot again with path "screenshots/home.png" (workspace only)\n` +
        `3) If browser missing: run_command "agent-browser install --with-deps" then retry once\n` +
        `4) Tell the user the screenshot failed with this error and emit [[TASK_COMPLETE | summary=screenshot failed]]`,
      path: absOut,
      remapped_from: remappedFrom,
      attempts,
      retryable: true,
      hint: NO_EMBEDDED_BROWSER_MESSAGE,
    };
  }

  private async trackFileEditBeforeMutation(fullPath: string): Promise<void> {
    if (this.remoteExecutionStrategy === 'sandbox_full') {
      // In full sandbox mode, file mutations happen remotely.
      return;
    }
    const messageId = this.activeFileHistoryMessageId;
    if (!messageId) return;
    try {
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) return;
    } catch {
      // Missing path is fine; fileHistoryTrackEdit records null backup.
    }
    await fileHistoryTrackEdit(
      this.fileHistoryState,
      this.updateFileHistoryState,
      fullPath,
      messageId,
    );
  }

  private isSandboxFullMode(): boolean {
    return this.remoteExecutionStrategy === 'sandbox_full' && Boolean(this.remoteWorkspaceClient);
  }

  /** Relative repo path only; used for remote find/rg roots. */
  private assertSafeRemoteSearchPath(rel: string): string {
    const raw = rel.trim() || '.';
    const norm = path.posix.normalize(raw.split(path.sep).join(path.posix.sep));
    if (path.posix.isAbsolute(norm)) {
      throw new Error('search path must be relative to the repo root');
    }
    for (const seg of norm.split('/')) {
      if (seg === '..') {
        throw new Error('search path must not traverse outside the repo');
      }
    }
    if (/[^A-Za-z0-9_.\-/]/.test(norm)) {
      throw new Error('search path contains unsupported characters');
    }
    return norm.length === 0 || norm === '.' ? '.' : norm;
  }

  private async readRemoteFullFile(filePath: string): Promise<string> {
    if (!this.remoteWorkspaceClient) return '';
    const result = await this.remoteWorkspaceClient.readFile(filePath);
    if (result?.error || result?.success === false) {
      throw new Error(String(result?.message || `Failed to read ${filePath}`));
    }
    return String(result?.content ?? '');
  }

  /**
   * Read file contents
   *
   * Reads a file from the filesystem. Supports partial reading by line range
   * to avoid token limits for large files. Always returns UTF-8 encoded text.
   *
   * @example
   * ```typescript
   * // Read entire file
   * const result = await executor.execute('read_file', {
   *   path: 'src/app.ts'
   * });
   *
   * // Read specific line range
   * const partial = await executor.execute('read_file', {
   *   path: 'src/large-file.ts',
   *   start_line: 100,
   *   end_line: 200
   * });
   * ```
   *
   * @param filePath - Path to file (relative to working directory)
   * @param startLine - Optional start line for partial read (1-indexed)
   * @param endLine - Optional end line for partial read (inclusive)
   * @returns Object with path, content, and line info
   *
   * @throws {FileNotFoundError} If file doesn't exist
   * @throws {PermissionError} If file is not readable
   *
   * @category File Operations
   * @mode All modes
   * @since 0.1.0
   */
  private async readFile(filePath: string, startLine?: number, endLine?: number): Promise<any> {
    if (this.isSandboxFullMode()) {
      try {
        return await this.remoteWorkspaceClient!.readFile(filePath, startLine, endLine);
      } catch (error: any) {
        return { error: true, success: false, message: `Failed to read ${filePath}: ${error.message}` };
      }
    }
    const fullPath = this.resolvePath(filePath);
    const ext = path.extname(filePath).toLowerCase();

    try {
      const st = await fs.stat(fullPath);
      if (!st.isFile()) {
        return { error: true, success: false, message: `Not a file: ${filePath}` };
      }

      if (READ_FILE_SKIP_RASTER_IMAGE_EXTS.has(ext)) {
        const base = path.basename(filePath);
        return {
          path: filePath,
          content:
            `This path is a binary image (${ext.slice(1) || 'image'}). read_file only handles text — it does not expose pixels to you.\n\n` +
            `To analyze what the image shows, ask the user to send a message that **includes this path** (e.g. ${base} or @${base}) so the CLI attaches it for vision/multimodal. ` +
            `For dimensions or format only, use run_command with file(1), identify, etc.`,
          lines: 3,
          binary_image: true,
          size_bytes: st.size,
        };
      }

      const content = await fs.readFile(fullPath, 'utf-8');

      if (startLine !== undefined && endLine !== undefined) {
        const lines = content.split('\n');
        const chunk = lines.slice(startLine - 1, endLine).join('\n');
        return {
          path: filePath,
          content: chunk,
          lines: endLine - startLine + 1,
          total_lines: lines.length,
          partial: true,
        };
      }

      const lines = content.split('\n');
      return {
        path: filePath,
        content,
        lines: lines.length,
        size: content.length,
      };
    } catch (error: any) {
      return { error: true, success: false, message: `Failed to read ${filePath}: ${error.message}` };
    }
  }

  private async readMultipleFiles(paths: string[]): Promise<any> {
    const CONCURRENCY_LIMIT = 20;
    const results: PromiseSettledResult<any>[] = [];
    for (let i = 0; i < paths.length; i += CONCURRENCY_LIMIT) {
      const chunk = paths.slice(i, i + CONCURRENCY_LIMIT);
      const chunkResults = await Promise.allSettled(
        chunk.map(async (p) => {
          const content = await this.readFile(p);
          return { path: p, ...content };
        })
      );
      results.push(...chunkResults);
    }

    return {
      files: results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value),
      errors: results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r, i) => ({ path: paths[i], error: r.reason.message })),
    };
  }

  /**
   * Write content to file
   *
   * Creates or overwrites a file with the given content. Automatically creates
   * parent directories if they don't exist. Creates a backup before overwriting
   * existing files.
   *
   * In dry-run mode, shows what would be written without making changes.
   *
   * @example
   * ```typescript
   * await executor.execute('write_file', {
   *   path: 'src/new-file.ts',
   *   content: 'export const hello = "world";'
   * });
   * ```
   *
   * @param filePath - Path to file (relative to working directory)
   * @param content - File content to write
   * @returns Object with success status, path, and file info
   *
   * @throws {PermissionError} If directory is not writable
   *
   * @category File Operations
   * @mode Write modes (agent, engineer, architect)
   * @since 0.1.0
   */
  private async writeFile(filePath: string, content: string): Promise<any> {
    if (this.isSandboxFullMode()) {
      if (this.dryRun) {
        const lines = content.split('\n').length;
        return {
          success: true,
          dryRun: true,
          path: filePath,
          lines,
          size: content.length,
          message: `[DRY RUN] Would write ${lines} lines to ${filePath}`,
        };
      }
      try {
        return await this.remoteWorkspaceClient!.writeFile(filePath, content);
      } catch (error: any) {
        return { error: true, success: false, message: `Failed to write ${filePath}: ${error.message}` };
      }
    }
    const fullPath = this.resolvePath(filePath);

    if (this.dryRun) {
      const lines = content.split('\n').length;
      return {
        success: true,
        dryRun: true,
        path: filePath,
        lines,
        size: content.length,
        message: `[DRY RUN] Would write ${lines} lines to ${filePath}`,
      };
    }

    try {
      await this.trackFileEditBeforeMutation(fullPath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
      const lines = content.split('\n').length;
      return {
        success: true,
        path: filePath,
        lines,
        size: content.length,
      };
    } catch (error: any) {
      return { error: true, success: false, message: `Failed to write ${filePath}: ${error.message}` };
    }
  }

  /**
   * Edit file using search and replace
   *
   * Performs intelligent search-and-replace editing using the FileEditor's
   * smart edit strategy. Searches for exact string matches and replaces them.
   * Automatically handles multi-line strings and special characters.
   *
   * Creates a backup before editing. In dry-run mode, shows what would be
   * changed without modifying the file.
   *
   * @example
   * ```typescript
   * // Replace first occurrence
   * await executor.execute('edit_file', {
   *   path: 'src/app.ts',
   *   search: 'const oldValue = 1;',
   *   replace: 'const newValue = 2;'
   * });
   *
   * // Replace all occurrences
   * await executor.execute('edit_file', {
   *   path: 'src/app.ts',
   *   search: 'oldName',
   *   replace: 'newName',
   *   all: true
   * });
   * ```
   *
   * @param filePath - Path to file (relative to working directory)
   * @param search - Exact string to search for (can be multi-line)
   * @param replace - Replacement string
   * @param all - Replace all occurrences (default: false, replaces first only)
   * @returns Object with success status, changes made, and diff
   *
   * @throws {FileNotFoundError} If file doesn't exist
   * @throws {SearchNotFoundError} If search string not found
   *
   * @category File Operations
   * @mode Write modes (agent, engineer, architect)
   * @since 0.1.0
   */
  private async editFile(filePath: string, search: string, replace: string, all?: boolean): Promise<any> {
    if (this.isSandboxFullMode()) {
      try {
        const current = await this.readRemoteFullFile(filePath);
        const occurrences = (current.match(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        if (occurrences === 0) {
          return { success: false, error: true, message: `Search string not found in ${filePath}` };
        }
        if (!all && occurrences > 1) {
          return { success: false, error: true, message: `Search string appears ${occurrences} times. Please be more specific or use all:true` };
        }
        const updated = all ? current.replaceAll(search, replace) : current.replace(search, replace);
        await this.remoteWorkspaceClient!.writeFile(filePath, updated);
        return { success: true, message: `Successfully edited ${filePath}` };
      } catch (error: any) {
        return { error: true, success: false, message: `Failed to edit ${filePath}: ${error.message}` };
      }
    }
    if (this.dryRun) {
      return {
        success: true,
        dryRun: true,
        path: filePath,
        message: `[DRY RUN] Would replace "${search.slice(0, 50)}..." with "${replace.slice(0, 50)}..."`,
      };
    }

    const result = await this.fileEditor.smartEdit(filePath, { search, replace, all });
    return result;
  }

  private async editLines(filePath: string, startLine: number, endLine: number, newContent: string): Promise<any> {
    if (this.isSandboxFullMode()) {
      try {
        const current = await this.readRemoteFullFile(filePath);
        const lines = current.split('\n');
        if (startLine < 1 || endLine > lines.length || startLine > endLine) {
          return {
            success: false,
            error: true,
            message: `Invalid line range: ${startLine}-${endLine} (file has ${lines.length} lines)`,
          };
        }
        const next = [
          ...lines.slice(0, startLine - 1),
          ...newContent.split('\n'),
          ...lines.slice(endLine),
        ].join('\n');
        await this.remoteWorkspaceClient!.writeFile(filePath, next);
        return { success: true, message: `Successfully edited lines ${startLine}-${endLine} in ${filePath}` };
      } catch (error: any) {
        return { error: true, success: false, message: `Failed to edit ${filePath}: ${error.message}` };
      }
    }
    if (this.dryRun) {
      const lines = newContent.split('\n').length;
      return {
        success: true,
        dryRun: true,
        path: filePath,
        message: `[DRY RUN] Would replace lines ${startLine}-${endLine} with ${lines} new lines`,
      };
    }

    const result = await this.fileEditor.editLineRange(filePath, { startLine, endLine, newContent });
    return result;
  }

  private async verifiedEditFile(filePath: string, startLine: number, endLine: number, oldContent: string, newContent: string): Promise<any> {
    if (this.isSandboxFullMode()) {
      try {
        const current = await this.readRemoteFullFile(filePath);
        const lines = current.split('\n');
        if (startLine < 1 || endLine > lines.length || startLine > endLine) {
          return {
            success: false,
            error: true,
            message: `Invalid line range: ${startLine}-${endLine} (file has ${lines.length} lines)`,
          };
        }
        const actual = lines.slice(startLine - 1, endLine).join('\n');
        const normalize = (s: string) => s.split('\n').map((line) => line.trimEnd()).join('\n').trim();
        if (normalize(actual) !== normalize(oldContent)) {
          return {
            success: false,
            error: true,
            message: `Content mismatch at lines ${startLine}-${endLine}. Re-read the file and retry.`,
            actual_content: actual,
          };
        }
        const next = [
          ...lines.slice(0, startLine - 1),
          ...newContent.split('\n'),
          ...lines.slice(endLine),
        ].join('\n');
        await this.remoteWorkspaceClient!.writeFile(filePath, next);
        return { success: true, message: `Successfully verified and edited lines ${startLine}-${endLine} in ${filePath}` };
      } catch (error: any) {
        return { error: true, success: false, message: `Failed to edit ${filePath}: ${error.message}` };
      }
    }
    if (this.dryRun) {
      return {
        success: true,
        dryRun: true,
        path: filePath,
        message: `[DRY RUN] Would verified-edit lines ${startLine}-${endLine} in ${filePath}`,
      };
    }

    const result = await this.fileEditor.verifiedEdit(filePath, { startLine, endLine, oldContent, newContent });
    return result;
  }

  private async insertAtLine(filePath: string, line: number, content: string): Promise<any> {
    if (this.isSandboxFullMode()) {
      try {
        const current = await this.readRemoteFullFile(filePath);
        const lines = current.split('\n');
        if (line < 1 || line > lines.length + 1) {
          return {
            success: false,
            error: true,
            message: `Invalid line number: ${line} (file has ${lines.length} lines)`,
          };
        }
        const next = [
          ...lines.slice(0, line - 1),
          ...content.split('\n'),
          ...lines.slice(line - 1),
        ].join('\n');
        await this.remoteWorkspaceClient!.writeFile(filePath, next);
        return { success: true, message: `Successfully inserted content at line ${line} in ${filePath}` };
      } catch (error: any) {
        return { error: true, success: false, message: `Failed to edit ${filePath}: ${error.message}` };
      }
    }
    if (this.dryRun) {
      const lines = content.split('\n').length;
      return {
        success: true,
        dryRun: true,
        path: filePath,
        message: `[DRY RUN] Would insert ${lines} lines at line ${line}`,
      };
    }

    const result = await this.fileEditor.insertAtLine(filePath, line, content);
    return result;
  }

  private async listDirectory(dirPath: string): Promise<any> {
    if (this.isSandboxFullMode()) {
      try {
        return await this.remoteWorkspaceClient!.listDirectory(dirPath);
      } catch (error: any) {
        return { error: true, success: false, message: `Failed to list directory ${dirPath}: ${error.message}` };
      }
    }
    const fullPath = this.resolvePath(dirPath);
    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const CONCURRENCY_LIMIT = 50;
      const results: any[] = [];
      for (let i = 0; i < entries.length; i += CONCURRENCY_LIMIT) {
        const chunk = entries.slice(i, i + CONCURRENCY_LIMIT);
        const chunkResults = await Promise.all(
          chunk.map(async (entry) => {
            const entryPath = path.join(fullPath, entry.name);
            try {
              const stats = await fs.stat(entryPath);
              return {
                name: entry.name,
                type: entry.isDirectory() ? 'directory' : 'file',
                size: stats.size,
                modified: stats.mtime,
              };
            } catch {
              return {
                name: entry.name,
                type: entry.isDirectory() ? 'directory' : 'file',
                size: 0,
              };
            }
          })
        );
        results.push(...chunkResults);
      }
      return { path: dirPath, entries: results, count: results.length };
    } catch (error: any) {
      return { error: true, success: false, message: `Failed to list directory ${dirPath}: ${error.message}` };
    }
  }

  private async searchFiles(pattern: string, searchPath: string = '.'): Promise<any> {
    if (this.isSandboxFullMode() && this.remoteExecutionClient) {
      try {
        return await this.searchFilesInSandbox(pattern, searchPath);
      } catch (error: any) {
        return { error: true, success: false, message: `Failed to search files: ${error.message}` };
      }
    }
    try {
      const files = await this.contextManager.searchFiles(pattern, { maxResults: 100 });
      return {
        pattern,
        files,
        count: files.length,
      };
    } catch (error: any) {
      return { error: true, success: false, message: `Failed to search files: ${error.message}` };
    }
  }

  private async searchFilesInSandbox(pattern: string, searchPath: string): Promise<any> {
    const client = this.remoteExecutionClient;
    if (!client) {
      return { error: true, success: false, message: 'Remote execution client not available' };
    }
    const root = client.getWorkspaceRoot();
    if (!root) {
      return { error: true, success: false, message: 'Remote workspace root unset' };
    }
    let subdir: string;
    try {
      subdir = this.assertSafeRemoteSearchPath(searchPath);
    } catch (e: any) {
      return { error: true, success: false, message: e.message || String(e) };
    }
    const globPattern = (pattern || '**/*').trim() || '**/*';
    const findDir = subdir === '.' ? '.' : subdir;
    const cmd = `find ${findDir} -type f 2>/dev/null | head -n 8000`;
    const result = await client.runCommand({
      command: cmd,
      cwd: root,
      timeout: 120,
      maxOutputChars: 2_000_000,
    });
    if (result?.error && result?.success === false) {
      return {
        error: true,
        success: false,
        message: String(result.stderr || result.message || 'find failed in sandbox'),
        pattern,
        searchPath: subdir,
      };
    }
    const raw = String(result.stdout ?? '');
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    const isMatch = picomatch(globPattern, { dot: true });
    const files: string[] = [];
    for (const line of lines) {
      const rel = line.replace(/^\.\//, '');
      if (rel && isMatch(rel)) {
        files.push(rel);
        if (files.length >= 100) break;
      }
    }
    return {
      pattern: globPattern,
      searchPath: subdir,
      files,
      count: files.length,
      truncated_scan: lines.length >= 8000,
    };
  }

  /**
   * Execute a shell command
   *
   * Runs a command in a shell (bash on Unix, PowerShell on Windows).
   * Captures stdout and stderr. Supports stdin input for interactive commands.
   * Automatically times out after 120 seconds (configurable).
   *
   * Safety checks are performed before execution to block dangerous commands
   * like `rm -rf /`, malicious scripts, and other high-risk operations.
   *
   * @example
   * ```typescript
   * // Run a simple command
   * const result = await executor.execute('run_command', {
   *   command: 'npm test'
   * });
   *
   * // Run with specific working directory
   * await executor.execute('run_command', {
   *   command: 'ls -la',
   *   cwd: './src'
   * });
   *
   * // Run with stdin input
   * await executor.execute('run_command', {
   *   command: 'cat > output.txt',
   *   input: 'Hello World'
   * });
   *
   * // Run with custom timeout
   * await executor.execute('run_command', {
   *   command: 'npm install',
   *   timeout: 300  // 5 minutes
   * });
   * ```
   *
   * @param command - Shell command to execute
   * @param cwd - Working directory (default: executor's working directory)
   * @param input - Optional stdin input for interactive commands
   * @param timeout - Timeout in seconds (default: 120)
   * @returns Object with stdout, stderr, exit code, and execution time
   *
   * @throws {SafetyError} If command is blocked by safety checker
   * @throws {TimeoutError} If command exceeds timeout
   *
   * @category Shell Commands
   * @mode Command modes (agent, engineer, debugger, tester)
   * @risk-level High
   * @since 0.1.0
   */
  private async runDynamicTool(toolName: string, _input: any): Promise<any> {
    const def = this.dynamicTools.get(toolName);
    if (!def) return { error: true, success: false, message: `Dynamic tool "${toolName}" not found` };
    return this.runCommand(def.script, this.workingDir, undefined, 60);
  }

  private async runCommand(
    command: string,
    cwd?: string,
    input?: string,
    timeout?: number,
    maxOutputChars?: number,
    opts?: { background?: boolean },
  ): Promise<any> {
    const workDir = cwd ? this.resolvePath(cwd) : this.workingDir;
    const outputLimit = Math.max(1000, maxOutputChars ?? DEFAULT_COMMAND_OUTPUT_CHARS);

    // Auto-background long-lived servers (pnpm dev, vite, etc.) so the agent
 // does not hang forever — process sessions.
    let background = opts?.background === true;
    let autoBackground = false;
    if (!background && looksLikeLongLivedCommand(command)) {
      background = true;
      autoBackground = true;
    }

    if (background) {
      // Remote sandbox: fall back to nohup-style one-shot (no process registry remote yet)
      if (this.remoteExecutionClient) {
        let remoteCwd: string | undefined;
        if (cwd) {
          remoteCwd = this.isSandboxFullMode() ? cwd : this.resolvePath(cwd);
        } else if (this.isSandboxFullMode()) {
          remoteCwd = this.remoteExecutionClient.getWorkspaceRoot();
        } else {
          remoteCwd = this.workingDir;
        }
        const bgCmd = `nohup sh -c ${JSON.stringify(command)} > /tmp/xibecode-bg-$$.log 2>&1 & echo $!`;
        const result = await this.remoteExecutionClient.runCommand({
          command: bgCmd,
          cwd: remoteCwd,
          timeout: 30,
          maxOutputChars: 2000,
        });
        const pid = String(result.stdout ?? '').trim().split('\n').pop();
        return {
          success: true,
          background: true,
          auto_background: autoBackground,
          remote: true,
          pid,
          message:
            `Started in background on remote (pid ${pid || '?'}). ` +
            (autoBackground
              ? 'Auto-backgrounded long-lived command so the agent can continue. '
              : '') +
            'Check logs on the remote host; use short health probes instead of waiting on the server process.',
          command,
        };
      }

      const session = this.processRegistry.spawnBackground({
        command,
        cwd: workDir,
        platform: this.platform,
      });
      // Brief settle so early crash stderr is captured
      await new Promise((r) => setTimeout(r, 400));
      const polled = this.processRegistry.poll(session.id, { tail: 2000 });
      const s = polled.session || session;
      return {
        success: s.status !== 'error',
        background: true,
        auto_background: autoBackground,
        process_id: s.id,
        pid: s.pid,
        status: s.status,
        command: s.command,
        cwd: s.cwd,
        stdout_tail: polled.stdoutTail || '',
        stderr_tail: polled.stderrTail || '',
        message:
          (autoBackground
            ? 'Auto-backgrounded long-lived command (dev server/watcher) so the agent is not blocked. '
            : 'Started in background. ') +
          `process_id=${s.id}. Use check_process to read logs, kill_process to stop. ` +
          'Verify readiness with a short probe (curl, list port) — do not re-run the same server command.',
      };
    }

    if (this.remoteExecutionClient) {
      let remoteCwd: string | undefined;
      if (cwd) {
        remoteCwd = this.isSandboxFullMode() ? cwd : this.resolvePath(cwd);
      } else if (this.isSandboxFullMode()) {
        remoteCwd = this.remoteExecutionClient.getWorkspaceRoot();
      } else {
        remoteCwd = this.workingDir;
      }
      const result = await this.remoteExecutionClient.runCommand({
        command,
        cwd: remoteCwd,
        input,
        timeout,
        maxOutputChars: outputLimit,
      });
      const compactedStdout = compactCommandOutput(String(result.stdout ?? '').trim(), outputLimit);
      const compactedStderr = compactCommandOutput(String(result.stderr ?? '').trim(), outputLimit);
      return {
        ...result,
        stdout: compactedStdout.output,
        stderr: compactedStderr.output,
        truncated: compactedStdout.truncated || compactedStderr.truncated,
        originalStdoutLength: compactedStdout.originalLength,
        originalStderrLength: compactedStderr.originalLength,
      };
    }

    const timeoutMs = (timeout || 120) * 1000;
    const shell = this.platform === 'win32' ? 'powershell.exe' : '/bin/sh';

    return new Promise((resolve) => {
      const child = spawn(shell, this.platform === 'win32' ? ['-Command', command] : ['-c', command], {
        cwd: workDir,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const releaseFg = this.processRegistry.trackForeground(child);

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let interrupted = false;
      let settled = false;

      const finish = (result: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (onAbort) this.abortSignal?.removeEventListener('abort', onAbort);
        releaseFg();

        const compactedStdout = compactCommandOutput(String(result.stdout ?? '').trim(), outputLimit);
        const compactedStderr = compactCommandOutput(String(result.stderr ?? '').trim(), outputLimit);

        resolve({
          ...result,
          stdout: compactedStdout.output,
          stderr: compactedStderr.output,
          truncated: compactedStdout.truncated || compactedStderr.truncated,
          originalStdoutLength: compactedStdout.originalLength,
          originalStderrLength: compactedStderr.originalLength,
          platform: this.platform,
          interrupted,
        });
      };

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGTERM');
        } catch {
          /* ignore */
        }
      }, timeoutMs);

      const onAbort = () => {
        interrupted = true;
        try {
          child.kill('SIGTERM');
        } catch {
          /* ignore */
        }
      };
      if (this.abortSignal) {
        if (this.abortSignal.aborted) {
          onAbort();
        } else {
          this.abortSignal.addEventListener('abort', onAbort);
        }
      }

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      if (input) {
        child.stdin.write(input.replace(/\\n/g, '\n'));
      }
      child.stdin.end();

      child.on('close', (code: number | null) => {
        let errOut = stderr;
        if (interrupted) {
          errOut = `${stderr}\nCommand interrupted by user (/stop).`.trim();
        } else if (timedOut) {
          errOut =
            `${stderr}\nCommand timed out after ${timeout || 120}s. ` +
            `For installs increase timeout; for dev servers use background=true (auto for pnpm/npm run dev).`.trim();
        }
        finish({
          stdout,
          stderr: errOut,
          success: !timedOut && !interrupted && code === 0,
          exitCode: code,
          timedOut,
          interrupted,
        });
      });

      child.on('error', (err: Error) => {
        finish({
          stdout,
          stderr: err.message,
          success: false,
          exitCode: undefined,
          timedOut,
          interrupted,
        });
      });
    });
  }

  private async createDirectory(dirPath: string): Promise<any> {
    if (this.isSandboxFullMode()) {
      try {
        return await this.remoteWorkspaceClient!.createDirectory(dirPath);
      } catch (error: any) {
        return { error: true, success: false, message: `Failed to create directory ${dirPath}: ${error.message}` };
      }
    }
    const fullPath = this.resolvePath(dirPath);
    try {
      await fs.mkdir(fullPath, { recursive: true });
      return { success: true, path: dirPath };
    } catch (error: any) {
      return { error: true, success: false, message: `Failed to create directory ${dirPath}: ${error.message}` };
    }
  }

  private async deleteFile(filePath: string): Promise<any> {
    if (this.isSandboxFullMode()) {
      if (this.dryRun) {
        return {
          success: true,
          dryRun: true,
          path: filePath,
          message: `[DRY RUN] Would delete ${filePath}`,
        };
      }
      try {
        return await this.remoteWorkspaceClient!.deleteFile(filePath);
      } catch (error: any) {
        return { error: true, success: false, message: `Failed to delete ${filePath}: ${error.message}` };
      }
    }
    const fullPath = this.resolvePath(filePath);

    if (this.dryRun) {
      try {
        const stats = await fs.stat(fullPath);
        const type = stats.isDirectory() ? 'directory' : 'file';
        return {
          success: true,
          dryRun: true,
          path: filePath,
          message: `[DRY RUN] Would delete ${type}: ${filePath}`,
        };
      } catch (error: any) {
        return {
          success: true,
          dryRun: true,
          path: filePath,
          message: `[DRY RUN] Would attempt to delete ${filePath} (file not found)`,
        };
      }
    }

    try {
      await this.trackFileEditBeforeMutation(fullPath);
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);
      }
      return { success: true, path: filePath };
    } catch (error: any) {
      return { error: true, success: false, message: `Failed to delete ${filePath}: ${error.message}` };
    }
  }

  private async moveFile(source: string, destination: string): Promise<any> {
    if (this.isSandboxFullMode()) {
      if (this.dryRun) {
        return {
          success: true,
          dryRun: true,
          source,
          destination,
          message: `[DRY RUN] Would move ${source} to ${destination}`,
        };
      }
      try {
        return await this.remoteWorkspaceClient!.moveFile(source, destination);
      } catch (error: any) {
        return { error: true, success: false, message: `Failed to move ${source}: ${error.message}` };
      }
    }
    if (this.dryRun) {
      return {
        success: true,
        dryRun: true,
        source,
        destination,
        message: `[DRY RUN] Would move ${source} to ${destination}`,
      };
    }

    const sourcePath = this.resolvePath(source);
    const destPath = this.resolvePath(destination);
    try {
      await this.trackFileEditBeforeMutation(sourcePath);
      await this.trackFileEditBeforeMutation(destPath);
      await fs.rename(sourcePath, destPath);
      return { success: true, source, destination };
    } catch (error: any) {
      return { error: true, success: false, message: `Failed to move ${source}: ${error.message}` };
    }
  }

  private async getContext(files: string[]): Promise<any> {
    if (this.isSandboxFullMode()) {
      try {
        const fileResults = await Promise.all(
          files.map(async (filePath) => {
            const file = await this.readFile(filePath);
            return {
              path: filePath,
              lines: Number(file?.lines ?? 0),
              language: path.extname(filePath).replace('.', '') || 'text',
              size: Number(file?.size ?? String(file?.content ?? '').length),
            };
          }),
        );
        return {
          files: fileResults,
          totalFiles: fileResults.length,
          estimatedTokens: fileResults.reduce((sum, item) => sum + Math.ceil((item.size || 0) / 4), 0),
        };
      } catch (error: any) {
        return { error: true, success: false, message: `Failed to get context: ${error.message}` };
      }
    }
    try {
      const context = await this.contextManager.buildContext(files);
      return {
        files: context.files.map(f => ({
          path: f.path,
          lines: f.lines,
          language: f.language,
          size: f.size,
        })),
        totalFiles: context.files.length,
        estimatedTokens: context.totalTokens,
      };
    } catch (error: any) {
      return { error: true, success: false, message: `Failed to get context: ${error.message}` };
    }
  }

  private async revertFile(
    messageId?: string,
    filePath?: string,
    snapshotIndex: number = -1,
    _backupIndex: number = 0,
  ): Promise<any> {
    if (typeof messageId === 'string') {
      try {
        const changedFiles = await fileHistoryRewind(
          this.updateFileHistoryState,
          messageId as UUID,
        );
        return {
          success: true,
          message: `Rewound tracked files to snapshot ${messageId}`,
          files_changed: changedFiles,
        };
      } catch (error: any) {
        return {
          error: true,
          success: false,
          message: `Failed to rewind to snapshot ${messageId}: ${error.message}`,
        };
      }
    }

    if (typeof filePath !== 'string') {
      return {
        error: true,
        success: false,
        message: 'revert_file requires message_id or path with snapshot_index',
      };
    }

    const fullPath = this.resolvePath(filePath);
    const restored = await fileHistoryRestore(this.fileHistoryState, fullPath, snapshotIndex);
    if (!restored) {
      return {
        error: true,
        success: false,
        message: `No file-history snapshot found for ${filePath} at index ${snapshotIndex}`,
      };
    }

    return {
      success: true,
      message: `Restored ${filePath} from snapshot index ${snapshotIndex}`,
    };
  }

  // ── Test Runner Methods ──

  private lastTestResult: any = null;

  private async runTests(customCommand?: string, cwd?: string): Promise<any> {
    if (this.isSandboxFullMode()) {
      const command = customCommand || this.testCommandOverride || 'pnpm test';
      const result = await this.runCommand(command, cwd, undefined, 300);
      this.lastTestResult = {
        success: result.success,
        exitCode: result.exitCode,
        output: result.stdout,
        errors: result.stderr,
        duration: undefined,
        runner: 'remote',
        command,
        packageManager: 'pnpm',
        testsRun: undefined,
        testsPassed: undefined,
        testsFailed: undefined,
        failures: [],
      };
      return {
        success: result.success,
        runner: 'remote',
        command,
        packageManager: 'pnpm',
        duration: undefined,
        testsRun: undefined,
        testsPassed: undefined,
        testsFailed: undefined,
        exitCode: result.exitCode,
        output: result.stdout,
        errors: result.stderr,
        failures: [],
      };
    }
    try {
      // Detect test runner and command
      const testInfo = await this.testRunner.detectTestRunner(
        customCommand || this.testCommandOverride
      );

      if (!testInfo.detected || !testInfo.command) {
        return {
          error: true,
          success: false,
          message: 'No test runner detected. Ensure package.json has a test script or specify a custom command.',
        };
      }

      const workDir = cwd ? this.resolvePath(cwd) : this.workingDir;
      const startTime = Date.now();

      // Run the test command
      const result = await this.runCommand(testInfo.command, cwd, undefined, 300);
      const duration = Date.now() - startTime;

      // Parse test output
      const parsed = this.testRunner.parseTestOutput(
        result.stdout + '\n' + result.stderr,
        testInfo.runner
      );

      const failures = result.success
        ? []
        : this.testRunner.extractFailures(result.stdout + '\n' + result.stderr);

      this.lastTestResult = {
        success: result.success,
        exitCode: result.exitCode,
        output: result.stdout,
        errors: result.stderr,
        duration,
        runner: testInfo.runner,
        command: testInfo.command,
        packageManager: testInfo.packageManager,
        ...parsed,
        failures,
      };

      return {
        success: result.success,
        runner: testInfo.runner,
        command: testInfo.command,
        packageManager: testInfo.packageManager,
        duration,
        testsRun: parsed.testsRun,
        testsPassed: parsed.testsPassed,
        testsFailed: parsed.testsFailed,
        exitCode: result.exitCode,
        output: result.stdout,
        errors: result.stderr,
        failures: failures.slice(0, 5), // Limit failures in response
      };
    } catch (error: any) {
      return {
        error: true,
        success: false,
        message: `Failed to run tests: ${error.message}`,
      };
    }
  }

  private async getTestStatus(): Promise<any> {
    if (!this.lastTestResult) {
      return {
        error: true,
        success: false,
        message: 'No test results available. Run tests first using run_tests.',
      };
    }

    return {
      success: true,
      lastRun: this.lastTestResult,
    };
  }

  // ── AI Test Generation Methods ──

  private testGenerator: TestGenerator | null = null;

  private getTestGenerator(): TestGenerator {
    if (!this.testGenerator) {
      this.testGenerator = new TestGenerator(this.workingDir);
    }
    return this.testGenerator;
  }

  private async generateTests(
    filePath: string,
    config: {
      framework?: 'vitest' | 'jest' | 'mocha' | 'pytest' | 'go';
      outputDir?: string;
      includeEdgeCases?: boolean;
      includeMocks?: boolean;
      maxTestsPerFunction?: number;
    },
    writeToFile: boolean = false
  ): Promise<any> {
    try {
      const generator = this.getTestGenerator();
      const absolutePath = this.resolvePath(filePath);

      // Analyze the file
      const analysis = await generator.analyzeFile(absolutePath);

      // Generate tests
      const generatedTest = await generator.generateTests(analysis, {
        framework: config.framework,
        outputDir: config.outputDir,
        includeEdgeCases: config.includeEdgeCases ?? true,
        includeMocks: config.includeMocks ?? true,
        maxTestsPerFunction: config.maxTestsPerFunction ?? 5,
      });

      // Optionally write to file
      if (writeToFile && !this.dryRun) {
        await writeTestFile(generatedTest);
      }

      return {
        success: true,
        sourceFile: filePath,
        testFilePath: generatedTest.testFilePath,
        framework: generatedTest.framework,
        testCasesGenerated: generatedTest.testCases.length,
        coverage: generatedTest.coverage,
        writtenToFile: writeToFile && !this.dryRun,
        dryRun: this.dryRun,
        content: generatedTest.content,
        testCases: generatedTest.testCases.map(tc => ({
          name: tc.name,
          type: tc.type,
          description: tc.description,
        })),
      };
    } catch (error: any) {
      return {
        error: true,
        success: false,
        message: `Failed to generate tests: ${error.message}`,
      };
    }
  }

  private async analyzeCodeForTests(filePath: string): Promise<any> {
    try {
      const generator = this.getTestGenerator();
      const absolutePath = this.resolvePath(filePath);

      const analysis = await generator.analyzeFile(absolutePath);

      return {
        success: true,
        filePath,
        language: analysis.language,
        functions: analysis.functions.map(f => ({
          name: f.name,
          params: f.params,
          returnType: f.returnType,
          isAsync: f.isAsync,
          isExported: f.isExported,
          complexity: f.complexity,
          dependencies: f.dependencies,
          sideEffects: f.sideEffects,
        })),
        classes: analysis.classes.map(c => ({
          name: c.name,
          isExported: c.isExported,
          methodCount: c.methods.length,
          propertyCount: c.properties.length,
          methods: c.methods.map(m => m.name),
        })),
        exports: analysis.exports,
        imports: analysis.imports,
        summary: {
          totalFunctions: analysis.functions.length,
          exportedFunctions: analysis.functions.filter(f => f.isExported).length,
          totalClasses: analysis.classes.length,
          exportedClasses: analysis.classes.filter(c => c.isExported).length,
          asyncFunctions: analysis.functions.filter(f => f.isAsync).length,
          highComplexityFunctions: analysis.functions.filter(f => f.complexity === 'high').length,
        },
      };
    } catch (error: any) {
      return {
        error: true,
        success: false,
        message: `Failed to analyze code: ${error.message}`,
      };
    }
  }

  // ── Git Methods ──

  private async getGitStatus(): Promise<any> {
    if (this.isSandboxFullMode()) {
      const result = await this.runCommand('git status --porcelain=v1 -b');
      if (!result.success) {
        return { error: true, success: false, message: `Failed to get git status: ${result.stderr || 'unknown error'}` };
      }
      const lines = String(result.stdout || '').split('\n').filter(Boolean);
      return {
        success: true,
        branch: lines[0] || '',
        raw: lines,
      };
    }
    try {
      const status = await this.gitUtils.getStatus();
      return {
        success: true,
        ...status,
      };
    } catch (error: any) {
      return {
        error: true,
        success: false,
        message: `Failed to get git status: ${error.message}`,
      };
    }
  }

  private async getGitDiffSummary(target?: string): Promise<any> {
    if (this.isSandboxFullMode()) {
      const cmd = target ? `git diff --stat ${target}` : 'git diff --stat';
      const result = await this.runCommand(cmd);
      if (!result.success) {
        return { error: true, success: false, message: `Failed to get diff summary: ${result.stderr || 'unknown error'}` };
      }
      return {
        success: true,
        summary: String(result.stdout || '').trim(),
      };
    }
    try {
      const summary = await this.gitUtils.getDiffSummary(target);
      return {
        success: true,
        ...summary,
      };
    } catch (error: any) {
      return {
        error: true,
        success: false,
        message: `Failed to get diff summary: ${error.message}`,
      };
    }
  }

  private async getGitChangedFiles(target?: string): Promise<any> {
    if (this.isSandboxFullMode()) {
      const cmd = target ? `git diff --name-only ${target}` : 'git diff --name-only';
      const result = await this.runCommand(cmd);
      if (!result.success) {
        return { error: true, success: false, message: `Failed to get changed files: ${result.stderr || 'unknown error'}` };
      }
      const files = String(result.stdout || '')
        .split('\n')
        .map((file) => file.trim())
        .filter(Boolean);
      return {
        success: true,
        files,
        count: files.length,
      };
    }
    try {
      const files = target
        ? await this.gitUtils.getChangedFilesSince(target)
        : await this.gitUtils.getChangedFiles();

      return {
        success: true,
        files,
        count: files.length,
      };
    } catch (error: any) {
      return {
        error: true,
        success: false,
        message: `Failed to get changed files: ${error.message}`,
      };
    }
  }

  private async gitCommit(message: string, agentName?: string): Promise<any> {
    if (this.dryRun) {
      return { success: true, dryRun: true, message: `[DRY RUN] Would commit: "${message}" (Agent: ${agentName})` };
    }
    return this.gitUtils.commit(message, agentName);
  }

  private async gitBlameAi(filePath: string): Promise<any> {
    const result = await this.gitUtils.getBlame(filePath);
    return { success: true, blame: result };
  }

  private async createGitCheckpoint(
    message: string,
    strategy?: 'stash' | 'commit'
  ): Promise<any> {
    if (this.dryRun) {
      return {
        success: true,
        dryRun: true,
        message: `[DRY RUN] Would create ${strategy || 'stash'} checkpoint: "${message}"`,
      };
    }

    try {
      const result = await this.gitUtils.createCheckpoint(message, strategy);

      if (!result.success) {
        return {
          error: true,
          success: false,
          message: result.error || 'Failed to create checkpoint',
        };
      }

      return {
        success: true,
        checkpoint: result.checkpoint,
        message: `Checkpoint created: ${result.checkpoint?.id}`,
      };
    } catch (error: any) {
      return {
        error: true,
        success: false,
        message: `Failed to create checkpoint: ${error.message}`,
      };
    }
  }

  private async revertToGitCheckpoint(
    checkpointId: string,
    checkpointType: 'stash' | 'commit',
    confirm: boolean
  ): Promise<any> {
    if (this.dryRun) {
      return {
        success: true,
        dryRun: true,
        message: `[DRY RUN] Would revert to ${checkpointType} checkpoint: ${checkpointId}`,
      };
    }

    if (!confirm) {
      return {
        error: true,
        success: false,
        message: 'Revert requires explicit confirmation. Set confirm: true',
      };
    }

    try {
      const checkpoint = {
        type: checkpointType,
        id: checkpointId,
        message: '',
        timestamp: new Date(),
      };

      const result = await this.gitUtils.revertToCheckpoint(checkpoint, confirm);

      if (!result.success) {
        return {
          error: true,
          success: false,
          message: result.error || 'Failed to revert',
        };
      }

      return {
        success: true,
        message: `Reverted to checkpoint: ${checkpointId}`,
      };
    } catch (error: any) {
      return {
        error: true,
        success: false,
        message: `Failed to revert: ${error.message}`,
      };
    }
  }

  private async gitShowDiff(filePath?: string, target?: string): Promise<any> {
    try {
      const diff = await this.gitUtils.getUnifiedDiff(filePath, target);
      return {
        success: true,
        diff,
        file: filePath,
        target: target || 'HEAD',
      };
    } catch (error: any) {
      return {
        error: true,
        success: false,
        message: `Failed to get diff: ${error.message}`,
      };
    }
  }

  private async mcpAuth(p: any): Promise<any> {
    const action = typeof p.action === 'string' ? p.action : 'start';
    const server = typeof p.server === 'string' ? p.server : null;
    if (!server) {
      return { error: true, success: false, message: 'Missing required parameter: server (string)' };
    }

    const { MCPServersFileManager } = await import('./utils/mcp-servers-file.js');
    const mcpFileManager = new MCPServersFileManager();
    const servers = await mcpFileManager.loadMCPServers();
    const serverConfig = servers[server];
    if (!serverConfig) {
      return { error: true, success: false, message: `Unknown MCP server: ${server}` };
    }
    if (!serverConfig.oauth) {
      return { error: true, success: false, message: `MCP server ${server} has no oauth config` };
    }

    if (action === 'start') {
      const started = await this.mcpOAuth.start(server, serverConfig);
      return {
        success: true,
        server,
        action,
        ...started,
      };
    }

    if (action === 'finish') {
      const callbackUrl = typeof p.callback_url === 'string' ? p.callback_url : typeof p.callbackUrl === 'string' ? p.callbackUrl : null;
      if (!callbackUrl) {
        return { error: true, success: false, message: 'Missing required parameter: callback_url (string) for action=finish' };
      }
      const finished = await this.mcpOAuth.finish(server, callbackUrl);
      return { success: finished.success, server, action, message: finished.message };
    }

    return { error: true, success: false, message: `Invalid action: ${action}. Use start|finish.` };
  }

  private async getMCPStatus(): Promise<any> {
    if (!this.mcpClientManager) {
      return {
        success: true,
        configured: 0,
        connected: 0,
        servers: [],
        tools: [],
      };
    }

    try {
      const connectedServers = this.mcpClientManager.getConnectedServers();
      const allTools = this.mcpClientManager.getAvailableTools();
      const allResources = this.mcpClientManager.getAvailableResources();
      const allPrompts = this.mcpClientManager.getAvailablePrompts();
      const states = this.mcpClientManager.getServerStates?.() || [];

      // Get configured servers from config
      const { MCPServersFileManager } = await import('./utils/mcp-servers-file.js');
      const mcpFileManager = new MCPServersFileManager();
      const configuredServers = await mcpFileManager.loadMCPServers();

      const servers = Object.entries(configuredServers).map(([serverName, serverConfig]: [string, MCPServerConfig]) => {
        const isConnected = connectedServers.includes(serverName);
        const serverTools = allTools.filter(t => t.serverName === serverName);
        const serverResources = allResources.filter(r => r.serverName === serverName);
        const serverPrompts = allPrompts.filter(p => p.serverName === serverName);
        const state = (states as any[]).find((s) => s.name === serverName);

        return {
          name: serverName,
          command: serverConfig.command,
          args: serverConfig.args || [],
          connected: isConnected,
          state: state?.state || (isConnected ? 'connected' : 'error'),
          lastError: state?.lastError,
          tools: serverTools.length,
          resources: serverResources.length,
          prompts: serverPrompts.length,
          toolNames: serverTools.map(t => t.name),
          error: isConnected ? null : 'Not connected (server executable may not be installed)',
        };
      });

      return {
        success: true,
        configured: Object.keys(configuredServers).length,
        connected: connectedServers.length,
        servers,
        totalTools: allTools.length,
        totalResources: allResources.length,
        totalPrompts: allPrompts.length,
      };
    } catch (error: any) {
      return {
        error: true,
        success: false,
        message: `Failed to get MCP status: ${error?.message || String(error)}`,
      };
    }
  }

  private async searchSkillsSh(query: string): Promise<any> {
    try {
      const results = await this.skillManager.searchSkillsSh(query);
      return {
        success: true,
        query,
        count: results.length,
        results: results.map(r => ({ id: r.id, url: r.url })),
      };
    } catch (error: any) {
      return { error: true, success: false, message: `Failed to search skills.sh: ${error.message}` };
    }
  }

  private async installSkillFromSkillsSh(skillId: string): Promise<any> {
    try {
      const result = await this.skillManager.installFromSkillsSh(skillId);
      if (result.success) {
        return {
          success: true,
          message: result.message || `Successfully installed skill: ${skillId}`,
          skill_id: skillId,
          filePath: result.filePath,
        };
      } else {
        return { error: true, success: false, message: `Failed to install skill: ${result.message}` };
      }
    } catch (error: any) {
      return { error: true, success: false, message: `Exception during installation: ${error.message}` };
    }
  }

  // ── grep_code: ripgrep / grep fallback ──────────────────────
  private async grepCode(
    pattern: string,
    searchPath: string = '.',
    ignoreCase: boolean = false,
    filePattern?: string,
    maxResults: number = 50
  ): Promise<any> {
    if (this.isSandboxFullMode() && this.remoteExecutionClient) {
      return this.grepCodeInSandbox(pattern, searchPath, ignoreCase, filePattern, maxResults);
    }
    const fullPath = this.resolvePath(searchPath);
    const caseFlag = ignoreCase ? '-i' : '';

    // Try ripgrep first, fallback to grep
    const tryRg = async (): Promise<string> => {
      const includeFlag = filePattern ? `--glob '${filePattern}'` : '';
      const cmd = `rg --no-heading --line-number --max-count ${maxResults} ${caseFlag} ${includeFlag} -- ${JSON.stringify(pattern)} ${JSON.stringify(fullPath)} 2>/dev/null`;
      const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024, timeout: 15000 });
      return stdout;
    };

    const tryGrep = async (): Promise<string> => {
      const includeFlag = filePattern ? `--include='${filePattern}'` : '';
      const cmd = `grep -rnI ${caseFlag} ${includeFlag} -- ${JSON.stringify(pattern)} ${JSON.stringify(fullPath)} 2>/dev/null | head -${maxResults}`;
      const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024, timeout: 15000 });
      return stdout;
    };

    try {
      let output: string;
      try {
        output = await tryRg();
      } catch {
        output = await tryGrep();
      }

      const lines = output.trim().split('\n').filter(Boolean);
      const matches = lines.map(line => {
        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (match) {
          return {
            file: path.relative(this.workingDir, match[1]),
            line: parseInt(match[2], 10),
            content: match[3].trim(),
          };
        }
        return { raw: line };
      });

      return {
        success: true,
        pattern,
        total: matches.length,
        matches,
      };
    } catch (error: any) {
      // grep returns exit code 1 when no matches found
      if (error.code === 1 || error.message?.includes('exit code 1')) {
        return { success: true, pattern, total: 0, matches: [], message: 'No matches found' };
      }
      return { error: true, success: false, message: `Grep failed: ${error.message}` };
    }
  }

  private async grepCodeInSandbox(
    pattern: string,
    searchPath: string = '.',
    ignoreCase: boolean = false,
    filePattern?: string,
    maxResults: number = 50
  ): Promise<any> {
    const client = this.remoteExecutionClient;
    if (!client) {
      return { error: true, success: false, message: 'Remote execution client not available' };
    }
    const root = client.getWorkspaceRoot();
    if (!root) {
      return { error: true, success: false, message: 'Remote workspace root unset' };
    }
    let subdir: string;
    try {
      subdir = this.assertSafeRemoteSearchPath(searchPath);
    } catch (e: any) {
      return { error: true, success: false, message: e.message || String(e) };
    }
    const caseFlag = ignoreCase ? '-i' : '';
    const safePattern = JSON.stringify(pattern);
    const safeSub = JSON.stringify(subdir);
    const includeGlob = filePattern ? ` --glob ${JSON.stringify(filePattern)}` : '';
    const rgCmd = `rg --no-heading --line-number --max-count ${maxResults} ${caseFlag}${includeGlob} -- ${safePattern} ${safeSub} 2>/dev/null`;
    let result = await client.runCommand({
      command: rgCmd,
      cwd: root,
      timeout: 90,
      maxOutputChars: 500_000,
    });
    let output = String(result.stdout ?? '');
    if (!output.trim()) {
      const includeFlag = filePattern ? `--include=${JSON.stringify(filePattern)}` : '';
      const grepCmd = `grep -rnI ${caseFlag} ${includeFlag} -- ${safePattern} ${safeSub} 2>/dev/null | head -${maxResults}`;
      result = await client.runCommand({
        command: grepCmd,
        cwd: root,
        timeout: 90,
        maxOutputChars: 500_000,
      });
      output = String(result.stdout ?? '');
    }
    const lines = output.trim().split('\n').filter(Boolean);
    if (lines.length === 0) {
      return { success: true, pattern, total: 0, matches: [], message: 'No matches found' };
    }
    const matches = lines.map((line) => {
      const m = line.match(/^(.+?):(\d+):(.*)$/);
      if (m) {
        return {
          file: m[1],
          line: parseInt(m[2], 10),
          content: m[3].trim(),
        };
      }
      return { raw: line };
    });
    return {
      success: true,
      pattern,
      total: matches.length,
      matches,
    };
  }

  // ── web_search: DuckDuckGo HTML ───────────────────────────
  private async webSearch(query: string, maxResults: number = 8): Promise<any> {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `q=${encodeURIComponent(query)}`,
      });

      if (!response.ok) {
        return { error: true, success: false, message: `Search failed: HTTP ${response.status}` };
      }

      const html = await response.text();

      // Parse results from DuckDuckGo HTML
      const results: Array<{ title: string; url: string; snippet: string }> = [];
      const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gi;

      let match;
      while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
        const rawUrl = match[1];
        const title = match[2].replace(/<[^>]*>/g, '').trim();
        const snippet = match[3].replace(/<[^>]*>/g, '').trim();

        // DuckDuckGo wraps URLs in redirect; extract actual URL
        let actualUrl = rawUrl;
        const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          actualUrl = decodeURIComponent(uddgMatch[1]);
        }

        if (title && actualUrl) {
          results.push({ title, url: actualUrl, snippet });
        }
      }

      // Fallback: try simpler pattern if regex didn't match
      if (results.length === 0) {
        const simpleLinkRegex = /<a[^>]*class="result__url"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
        while ((match = simpleLinkRegex.exec(html)) !== null && results.length < maxResults) {
          const url = match[1].trim();
          const title = match[2].replace(/<[^>]*>/g, '').trim();
          if (url && title) {
            results.push({ title, url, snippet: '' });
          }
        }
      }

      return {
        success: true,
        query,
        total: results.length,
        results,
      };
    } catch (error: any) {
      return { error: true, success: false, message: `Web search failed: ${error.message}` };
    }
  }

  // ── fetch_url: read any URL as text ────────────────────────
  private async fetchUrl(url: string, maxLength: number = 20000): Promise<any> {
    const urlResult = sanitizeUrl(url.trim());
    if (!urlResult.ok) {
      return { error: true, success: false, message: urlResult.message };
    }
    try {
      const response = await fetch(urlResult.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,text/plain,application/json',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return { error: true, success: false, message: `Fetch failed: HTTP ${response.status} ${response.statusText}` };
      }

      const contentType = response.headers.get('content-type') || '';
      const raw = await response.text();

      let text: string;
      if (contentType.includes('application/json')) {
        // Return JSON as-is
        text = raw;
      } else if (contentType.includes('text/plain')) {
        text = raw;
      } else {
        // Strip HTML to text
        text = raw
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<nav[\s\S]*?<\/nav>/gi, '')
          .replace(/<footer[\s\S]*?<\/footer>/gi, '')
          .replace(/<header[\s\S]*?<\/header>/gi, '')
          .replace(/<[^>]+>/g, '\n')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }

      // Truncate to maxLength
      const truncated = text.length > maxLength;
      const content = truncated ? text.slice(0, maxLength) + '\n... [truncated]' : text;

      return {
        success: true,
        url: urlResult.url,
        contentType: contentType.split(';')[0],
        length: text.length,
        truncated,
        content,
      };
    } catch (error: any) {
      return { error: true, success: false, message: `Fetch failed: ${error.message}` };
    }
  }

  // ── Learning loop tools ────────────────────────────────────
  private async curatedMemoryAction(p: any): Promise<any> {
    const {
      CuratedMemoryStore,
      isWriteApprovalEnabledAsync,
      stageWrite,
    } = await import('./learning-loop/index.js');
    const store = new CuratedMemoryStore();
    const action = String(p.action || '');
    const target = (p.target === 'user' ? 'user' : 'memory') as 'memory' | 'user';
    const operations = Array.isArray(p.operations) ? p.operations : null;
    const needsApproval = await isWriteApprovalEnabledAsync('memory');

    const isMutating =
      (operations && operations.length > 0) ||
      action === 'add' ||
      action === 'replace' ||
      action === 'remove';

    if (needsApproval && isMutating) {
      const summary = operations?.length
        ? `batch ${target} (${operations.length} ops)`
        : `${action} ${target}: ${String(p.content || p.old_text || '').slice(0, 80)}`;
      const staged = await stageWrite(
        'memory',
        summary,
        {
          action: operations?.length ? 'batch' : action,
          target,
          content: p.content,
          old_text: p.old_text,
          operations: operations || undefined,
        },
        'tool',
      );
      return {
        success: true,
        staged: true,
        done: false,
        id: staged.id,
        message: `Staged for approval (id=${staged.id}). Operator: xibecode memory approve ${staged.id}`,
      };
    }

    if (operations?.length) {
      return store.applyBatch(target, operations);
    }

    if (action === 'add') {
      if (!p.content) return { error: true, success: false, message: 'content required for add' };
      return store.add(target, String(p.content));
    }
    if (action === 'replace') {
      if (!p.old_text || !p.content) {
        return { error: true, success: false, message: 'old_text and content required for replace' };
      }
      return store.replace(target, String(p.old_text), String(p.content));
    }
    if (action === 'remove') {
      if (!p.old_text) return { error: true, success: false, message: 'old_text required for remove' };
      return store.remove(target, String(p.old_text));
    }
    return {
      error: true,
      success: false,
      message: 'Provide action (add|replace|remove) or an operations batch',
    };
  }

  private async sessionSearchAction(query: string, limit?: number): Promise<any> {
    const { searchSessions } = await import('./learning-loop/index.js');
    const hits = await searchSessions(query, { limit: limit ?? 8 });
    return {
      success: true,
      count: hits.length,
      hits: hits.map((h) => ({
        sessionId: h.sessionId,
        score: h.score,
        snippet: h.snippet,
        path: h.path,
        updated: h.updated,
      })),
    };
  }

  private async saveSkillAction(
    name: string,
    description: string | undefined,
    content: string,
    tags?: string[],
  ): Promise<any> {
    const {
      saveLearnedSkill,
      isWriteApprovalEnabledAsync,
      stageWrite,
    } = await import('./learning-loop/index.js');
    const slug = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    const draft = {
      name: slug,
      description: (description || name).slice(0, 120),
      content,
      tags: tags || ['learned'],
    };
    if (await isWriteApprovalEnabledAsync('skill')) {
      const staged = await stageWrite(
        'skill',
        `skill: ${slug}`,
        draft,
        'tool',
      );
      return {
        success: true,
        staged: true,
        id: staged.id,
        message: `Skill write staged (id=${staged.id}). Approve: xibecode memory approve ${staged.id}`,
      };
    }
    const result = await saveLearnedSkill(draft);
    return result.created
      ? { success: true, ...result }
      : { error: true, success: false, message: result.reason || 'failed to save skill' };
  }

  // ── update_memory: persist project knowledge ───────────────
  private async updateMemory(content: string, append: boolean = true): Promise<any> {
    const memoryDir = path.join(this.workingDir, '.xibecode');
    const memoryPath = path.join(memoryDir, 'memory.md');

    try {
      await fs.mkdir(memoryDir, { recursive: true });

      if (append) {
        let existing = '';
        try {
          existing = await fs.readFile(memoryPath, 'utf-8');
        } catch { /* file doesn't exist yet */ }
        const updated = existing ? `${existing.trimEnd()}\n\n${content}` : content;
        await fs.writeFile(memoryPath, updated, 'utf-8');
      } else {
        await fs.writeFile(memoryPath, content, 'utf-8');
      }

      const final = await fs.readFile(memoryPath, 'utf-8');
      return {
        success: true,
        done: true,
        path: '.xibecode/memory.md',
        lines: final.split('\n').length,
        message: append ? 'Memory updated (appended)' : 'Memory replaced',
        note: 'Write saved. This update is complete — do not repeat it.',
      };
    } catch (error: any) {
      return { error: true, success: false, message: `Failed to update memory: ${error.message}` };
    }
  }
}
