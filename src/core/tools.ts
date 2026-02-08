import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { ContextManager } from './context.js';
import { FileEditor } from './editor.js';
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
  private platform: string;

  constructor(workingDir: string = process.cwd()) {
    this.workingDir = workingDir;
    this.contextManager = new ContextManager(workingDir);
    this.fileEditor = new FileEditor(workingDir);
    this.platform = os.platform();
  }

  async execute(toolName: string, input: any): Promise<any> {
    switch (toolName) {
      case 'read_file':
        return this.readFile(input.path, input.start_line, input.end_line);
      
      case 'read_multiple_files':
        return this.readMultipleFiles(input.paths);
      
      case 'write_file':
        return this.writeFile(input.path, input.content);
      
      case 'edit_file':
        return this.editFile(input.path, input.search, input.replace, input.all);
      
      case 'edit_lines':
        return this.editLines(input.path, input.start_line, input.end_line, input.new_content);
      
      case 'insert_at_line':
        return this.insertAtLine(input.path, input.line, input.content);
      
      case 'list_directory':
        return this.listDirectory(input.path || '.');
      
      case 'search_files':
        return this.searchFiles(input.pattern, input.path);
      
      case 'run_command':
        return this.runCommand(input.command, input.cwd);
      
      case 'create_directory':
        return this.createDirectory(input.path);
      
      case 'delete_file':
        return this.deleteFile(input.path);
      
      case 'move_file':
        return this.moveFile(input.source, input.destination);
      
      case 'get_context':
        return this.getContext(input.files);
      
      case 'revert_file':
        return this.revertFile(input.path, input.backup_index);
      
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  getTools(): Tool[] {
    return [
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
        description: `Execute shell command. Platform: ${this.platform}. Use appropriate commands for this OS.`,
        input_schema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Command to execute',
            },
            cwd: {
              type: 'string',
              description: 'Working directory (optional)',
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
    ];
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
      throw new Error(`Failed to read ${filePath}: ${error.message}`);
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
      throw new Error(`Failed to write ${filePath}: ${error.message}`);
    }
  }

  private async editFile(filePath: string, search: string, replace: string, all?: boolean): Promise<any> {
    const result = await this.fileEditor.smartEdit(filePath, { search, replace, all });
    return result;
  }

  private async editLines(filePath: string, startLine: number, endLine: number, newContent: string): Promise<any> {
    const result = await this.fileEditor.editLineRange(filePath, { startLine, endLine, newContent });
    return result;
  }

  private async insertAtLine(filePath: string, line: number, content: string): Promise<any> {
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
          const stats = await fs.stat(entryPath);
          return {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            modified: stats.mtime,
          };
        })
      );
      return { path: dirPath, entries: results, count: results.length };
    } catch (error: any) {
      throw new Error(`Failed to list directory ${dirPath}: ${error.message}`);
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
      throw new Error(`Failed to search files: ${error.message}`);
    }
  }

  private async runCommand(command: string, cwd?: string): Promise<any> {
    const workDir = cwd ? this.resolvePath(cwd) : this.workingDir;
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workDir,
        maxBuffer: 1024 * 1024 * 10,
        shell: this.platform === 'win32' ? 'powershell.exe' : undefined,
      });
      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        success: true,
        platform: this.platform,
      };
    } catch (error: any) {
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
      throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
    }
  }

  private async deleteFile(filePath: string): Promise<any> {
    const fullPath = this.resolvePath(filePath);
    try {
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);
      }
      return { success: true, path: filePath };
    } catch (error: any) {
      throw new Error(`Failed to delete ${filePath}: ${error.message}`);
    }
  }

  private async moveFile(source: string, destination: string): Promise<any> {
    const sourcePath = this.resolvePath(source);
    const destPath = this.resolvePath(destination);
    try {
      await fs.rename(sourcePath, destPath);
      return { success: true, source, destination };
    } catch (error: any) {
      throw new Error(`Failed to move ${source}: ${error.message}`);
    }
  }

  private async getContext(files: string[]): Promise<any> {
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
  }

  private async revertFile(filePath: string, backupIndex: number = 0): Promise<any> {
    const result = await this.fileEditor.revertToBackup(filePath, backupIndex);
    return result;
  }
}
