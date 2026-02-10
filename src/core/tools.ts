import * as fs from 'fs/promises';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { ContextManager } from './context.js';
import { FileEditor } from './editor.js';
import { GitUtils } from '../utils/git.js';
import { TestRunnerDetector } from '../utils/testRunner.js';
import { SafetyChecker } from '../utils/safety.js';
import { PluginManager } from './plugins.js';
import { MCPClientManager } from './mcp-client.js';
import * as os from 'os';

const execAsync = promisify(exec);

export interface ToolExecutor {
  execute(toolName: string, input: any): Promise<any>;
  getTools(): Tool[];
}

export class CodingToolExecutor implements ToolExecutor {
  private workingDir: string;
  private contextManager: ContextManager;
  private fileEditor: FileEditor;
  private gitUtils: GitUtils;
  private testRunner: TestRunnerDetector;
  private safetyChecker: SafetyChecker;
  private pluginManager: PluginManager;
  private mcpClientManager?: MCPClientManager;
  private platform: string;
  private dryRun: boolean;
  private testCommandOverride?: string;

  constructor(
    workingDir: string = process.cwd(),
    options?: { 
      dryRun?: boolean; 
      testCommandOverride?: string;
      pluginManager?: PluginManager;
      mcpClientManager?: MCPClientManager;
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
    this.platform = os.platform();
    this.dryRun = options?.dryRun || false;
    this.testCommandOverride = options?.testCommandOverride;
  }

  /**
   * Safely parse tool input - handles string JSON, null, undefined
   */
  private parseInput(input: any): Record<string, any> {
    if (!input) return {};
    if (typeof input === 'string') {
      try { return JSON.parse(input); } catch { return {}; }
    }
    if (typeof input === 'object') return input;
    return {};
  }

  async execute(toolName: string, input: any): Promise<any> {
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

      default:
        return { error: true, success: false, message: `Unknown tool: ${toolName}. Available tools: read_file, read_multiple_files, write_file, edit_file, edit_lines, insert_at_line, list_directory, search_files, run_command, create_directory, delete_file, move_file, get_context, revert_file, run_tests, get_test_status, get_git_status, get_git_diff_summary, get_git_changed_files, create_git_checkpoint, revert_to_git_checkpoint, git_show_diff, get_mcp_status` };
    }
  }

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

  private resolvePath(filePath: string): string {
    return path.resolve(this.workingDir, filePath);
  }

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
      return {
        error: true,
        success: false,
        message: `Failed to get MCP status: ${error.message}`,
      };
    }
  }
}
