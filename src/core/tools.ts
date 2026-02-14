import * as fs from 'fs/promises';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { ContextManager } from './context.js';
import { AgentMode, MODE_CONFIG, isToolAllowed } from './modes.js';
import { FileEditor } from './editor.js';
import { GitUtils } from '../utils/git.js';
import { TestRunnerDetector } from '../utils/testRunner.js';
import { SafetyChecker } from '../utils/safety.js';
import { PluginManager } from './plugins.js';
import { MCPClientManager } from './mcp-client.js';
import { NeuralMemory } from './memory.js';
import { BrowserManager } from '../tools/browser.js';
import * as os from 'os';
import { SkillManager } from './skills.js';

const execAsync = promisify(exec);

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
 * - Browser Operations: web automation with Puppeteer
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
  private browserManager: BrowserManager;
  private skillManager: SkillManager;
  private platform: string;
  private dryRun: boolean;
  private testCommandOverride?: string;

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
    }
  ) {
    this.workingDir = workingDir;
    this.contextManager = new ContextManager(workingDir);
    this.fileEditor = new FileEditor(workingDir);
    this.gitUtils = new GitUtils(workingDir);
    this.testRunner = new TestRunnerDetector(workingDir);
    this.safetyChecker = new SafetyChecker();
    this.pluginManager = options?.pluginManager || new PluginManager();
    this.mcpClientManager = options?.mcpClientManager;
    this.memory = options?.memory;
    this.browserManager = new BrowserManager();
    // Initialize skill manager if provided, otherwise create a default one
    this.skillManager = options?.skillManager || new SkillManager(workingDir);
    this.platform = os.platform();
    this.dryRun = options?.dryRun || false;
    this.testCommandOverride = options?.testCommandOverride;
  }

  private currentMode: AgentMode = 'agent';

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
    // Check tool permissions first
    const permission = isToolAllowed(this.currentMode, toolName);

    if (!permission.allowed) {
      return {
        error: true,
        success: false,
        message: `PERMISSION DENIED: ${permission.reason}. Please delegate this task to the appropriate agent using [[REQUEST_MODE: <mode> | reason=...]].`,
        blocked: true
      };
    }

    const p = this.parseInput(input);

    // Check if it's an MCP tool (format: serverName::toolName)
    if (this.mcpClientManager && toolName.includes('::')) {
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
        return this.runCommand(p.command, p.cwd, p.input, p.timeout);
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
        if (!p.path || typeof p.path !== 'string') {
          return { error: true, success: false, message: 'Missing required parameter: path (string)' };
        }
        return this.revertFile(p.path, p.backup_index);
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
        return { success: true, message: 'Lesson learned and saved to neural memory.' };
      }

      case 'take_screenshot': {
        if (!p.url || typeof p.url !== 'string') return { error: true, success: false, message: 'Missing url' };
        if (!p.path || typeof p.path !== 'string') return { error: true, success: false, message: 'Missing path' };
        return this.browserManager.takeScreenshot(p.url, p.path, p.fullPage !== false);
      }

      case 'get_console_logs': {
        if (!p.url || typeof p.url !== 'string') return { error: true, success: false, message: 'Missing url' };
        return this.browserManager.getConsoleLogs(p.url);
      }

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

      default:
        return { error: true, success: false, message: `Unknown tool: ${toolName}. Available tools: read_file, read_multiple_files, write_file, edit_file, edit_lines, insert_at_line, verified_edit, list_directory, search_files, run_command, create_directory, delete_file, move_file, get_context, revert_file, run_tests, get_test_status, get_git_status, get_git_diff_summary, get_git_changed_files, create_git_checkpoint, revert_to_git_checkpoint, git_show_diff, get_mcp_status, grep_code, web_search, fetch_url, remember_lesson, take_screenshot, get_console_logs, search_skills_sh, install_skill_from_skills_sh` };
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
  getTools(): Tool[] {
    const coreTools: Tool[] = [
      {
        name: 'read_file',
        description: 'Read file contents. For large files, can read specific line ranges to avoid token limits. Always use this before editing files.',
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
              description: 'End line number (1-indexed, inclusive) of the content to replace',
            },
            old_content: {
              type: 'string',
              description: 'The exact content currently at lines start_line through end_line. This MUST match the actual file content or the edit will be rejected. Copy this directly from read_file output.',
            },
            new_content: {
              type: 'string',
              description: 'The new content to replace the old content with',
            },
          },
          required: ['path', 'start_line', 'end_line', 'old_content', 'new_content'],
        },
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
        description: `Execute shell command. Platform: ${this.platform}. Commands have a timeout (default 120s). IMPORTANT: Always use non-interactive flags when available (e.g. --yes, --default, -y). For interactive prompts, use the "input" parameter to send stdin (newline-separated answers). Example: npx create-next-app@latest myapp --yes --typescript --tailwind --app --use-pnpm`,
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
              description: 'Timeout in seconds (default: 120). Increase for long-running commands like installs.',
            },
          },
          required: ['command'],
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
        description: 'Revert a file to a previous backup. Backups are created automatically on edits.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path to revert',
            },
            backup_index: {
              type: 'number',
              description: 'Backup index (0 = most recent, default: 0)',
            },
          },
          required: ['path'],
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
        name: 'take_screenshot',
        description: 'Take a screenshot of a web page. Useful for verifying UI appearance or capturing the state of a web app.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to visit (e.g., http://localhost:3000)' },
            path: { type: 'string', description: 'Output path for the screenshot (e.g., screenshot.png)' },
            fullPage: { type: 'boolean', description: 'Capture full page? Default: true' }
          },
          required: ['url', 'path']
        }
      },
      {
        name: 'get_console_logs',
        description: 'Get browser console logs (and errors) from a URL. Useful for debugging frontend issues.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to visit' }
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
    return [...coreTools, ...mcpTools, ...pluginTools];
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
    return path.resolve(this.workingDir, filePath);
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
    const fullPath = this.resolvePath(filePath);
    try {
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
    const results = await Promise.allSettled(
      paths.map(async (p) => {
        const content = await this.readFile(p);
        return { path: p, ...content };
      })
    );

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
    const fullPath = this.resolvePath(dirPath);
    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const results = await Promise.all(
        entries.map(async (entry) => {
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
      return { path: dirPath, entries: results, count: results.length };
    } catch (error: any) {
      return { error: true, success: false, message: `Failed to list directory ${dirPath}: ${error.message}` };
    }
  }

  private async searchFiles(pattern: string, searchPath: string = '.'): Promise<any> {
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
  private async runCommand(command: string, cwd?: string, input?: string, timeout?: number): Promise<any> {
    const workDir = cwd ? this.resolvePath(cwd) : this.workingDir;
    const timeoutMs = (timeout || 120) * 1000;
    const shell = this.platform === 'win32' ? 'powershell.exe' : '/bin/sh';

    // ── Use spawn when stdin input is provided ──
    if (input) {
      return new Promise((resolve) => {
        const child = spawn(shell, this.platform === 'win32' ? ['-Command', command] : ['-c', command], {
          cwd: workDir,
          env: { ...process.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        let killed = false;

        const timer = setTimeout(() => {
          killed = true;
          child.kill('SIGTERM');
        }, timeoutMs);

        child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
        child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

        // Pipe stdin input (supports \n for multiple answers)
        const stdinData = input.replace(/\\n/g, '\n');
        child.stdin.write(stdinData);
        child.stdin.end();

        child.on('close', (code: number | null) => {
          clearTimeout(timer);
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            success: !killed && code === 0,
            exitCode: code,
            timedOut: killed,
            platform: this.platform,
          });
        });

        child.on('error', (err: Error) => {
          clearTimeout(timer);
          resolve({
            stdout: stdout.trim(),
            stderr: err.message,
            success: false,
            platform: this.platform,
          });
        });
      });
    }

    // ── Regular exec with timeout ──
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workDir,
        maxBuffer: 1024 * 1024 * 10,
        timeout: timeoutMs,
        shell: this.platform === 'win32' ? 'powershell.exe' : undefined,
      });
      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        success: true,
        platform: this.platform,
      };
    } catch (error: any) {
      if (error.killed) {
        return {
          stdout: error.stdout?.trim() || '',
          stderr: 'Command timed out after ' + (timeout || 120) + 's. Try increasing the timeout parameter, or use non-interactive flags like --yes to avoid prompts.',
          success: false,
          timedOut: true,
          platform: this.platform,
        };
      }
      return {
        stdout: error.stdout?.trim() || '',
        stderr: error.stderr?.trim() || error.message,
        success: false,
        exitCode: error.code,
        platform: this.platform,
      };
    }
  }

  private async createDirectory(dirPath: string): Promise<any> {
    const fullPath = this.resolvePath(dirPath);
    try {
      await fs.mkdir(fullPath, { recursive: true });
      return { success: true, path: dirPath };
    } catch (error: any) {
      return { error: true, success: false, message: `Failed to create directory ${dirPath}: ${error.message}` };
    }
  }

  private async deleteFile(filePath: string): Promise<any> {
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
      await fs.rename(sourcePath, destPath);
      return { success: true, source, destination };
    } catch (error: any) {
      return { error: true, success: false, message: `Failed to move ${source}: ${error.message}` };
    }
  }

  private async getContext(files: string[]): Promise<any> {
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

  private async revertFile(filePath: string, backupIndex: number = 0): Promise<any> {
    const result = await this.fileEditor.revertToBackup(filePath, backupIndex);
    return result;
  }

  // ── Test Runner Methods ──

  private lastTestResult: any = null;

  private async runTests(customCommand?: string, cwd?: string): Promise<any> {
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

  // ── Git Methods ──

  private async getGitStatus(): Promise<any> {
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

      // Get configured servers from config
      const { ConfigManager } = await import('../utils/config.js');
      const config = new ConfigManager();
      const configuredServers = await config.getMCPServers();

      const servers = Object.entries(configuredServers).map(([serverName, serverConfig]) => {
        const isConnected = connectedServers.includes(serverName);
        const serverTools = allTools.filter(t => t.serverName === serverName);
        const serverResources = allResources.filter(r => r.serverName === serverName);
        const serverPrompts = allPrompts.filter(p => p.serverName === serverName);

        return {
          name: serverName,
          command: serverConfig.command,
          args: serverConfig.args || [],
          connected: isConnected,
          tools: serverTools.length,
          resources: serverResources.length,
          prompts: serverPrompts.length,
          toolNames: serverTools.map(t => t.name),
          error: isConnected ? null : 'Not connected (server executable may not be installed)',
        };
      });

      return {
        success: true,
        configured: configuredServers.length,
        connected: connectedServers.length,
        servers,
        totalTools: allTools.length,
        totalResources: allResources.length,
        totalPrompts: allPrompts.length,
      };
    } catch (error: any) {
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
          skill_id: skillId
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
    try {
      const response = await fetch(url, {
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
        url,
        contentType: contentType.split(';')[0],
        length: text.length,
        truncated,
        content,
      };
    } catch (error: any) {
      return { error: true, success: false, message: `Fetch failed: ${error.message}` };
    }
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
        path: '.xibecode/memory.md',
        lines: final.split('\n').length,
        message: append ? 'Memory updated (appended)' : 'Memory replaced',
      };
    } catch (error: any) {
      return { error: true, success: false, message: `Failed to update memory: ${error.message}` };
    }
  }
}
