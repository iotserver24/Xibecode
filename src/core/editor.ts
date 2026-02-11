import * as fs from 'fs/promises';
import * as path from 'path';
import * as diff from 'diff';

export interface EditResult {
  success: boolean;
  message: string;
  diff?: string;
  linesChanged?: number;
}

export interface SearchReplaceEdit {
  search: string;
  replace: string;
  all?: boolean; // Replace all occurrences or just first
}

export interface LineRangeEdit {
  startLine: number;
  endLine: number;
  newContent: string;
  /** If provided, the edit only runs when the current lines in the range exactly match this string. Use to avoid overwriting if the file changed. */
  expectedContent?: string;
}

export class FileEditor {
  private workingDir: string;
  private backupDir: string;

  constructor(workingDir: string) {
    this.workingDir = workingDir;
    this.backupDir = path.join(workingDir, '.xibecode_backups');
  }

  /**
   * Smart edit - searches for unique section and replaces it
   * This is the most reliable way to edit files
   */
  async smartEdit(filePath: string, edit: SearchReplaceEdit): Promise<EditResult> {
    const fullPath = path.resolve(this.workingDir, filePath);
    
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      
      // Count occurrences
      const occurrences = (content.match(new RegExp(this.escapeRegex(edit.search), 'g')) || []).length;
      
      if (occurrences === 0) {
        return {
          success: false,
          message: `Search string not found in ${filePath}`,
        };
      }

      if (occurrences > 1 && !edit.all) {
        return {
          success: false,
          message: `Search string appears ${occurrences} times. Please be more specific or use all:true`,
        };
      }

      // Perform replacement
      const newContent = edit.all 
        ? content.replaceAll(edit.search, edit.replace)
        : content.replace(edit.search, edit.replace);

      // Create backup
      await this.createBackup(filePath, content);

      // Write new content
      await fs.writeFile(fullPath, newContent, 'utf-8');

      // Generate diff
      const patches = diff.createPatch(filePath, content, newContent);
      const linesChanged = this.countChangedLines(patches);

      return {
        success: true,
        message: `Successfully edited ${filePath}`,
        diff: patches,
        linesChanged,
      };

    } catch (error: any) {
      return {
        success: false,
        message: `Failed to edit ${filePath}: ${error.message}`,
      };
    }
  }

  /**
   * Normalize string for line-range comparison (trim trailing newline, consistent line endings).
   */
  private normalizeLineRangeText(s: string): string {
    return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n+$/, '');
  }

  /**
   * Edit specific line range - good for large files.
   * Optionally pass expectedContent: if the current lines don't match, the edit is aborted (safe "replace only when this is there").
   */
  async editLineRange(filePath: string, edit: LineRangeEdit): Promise<EditResult> {
    const fullPath = path.resolve(this.workingDir, filePath);
    
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');

      if (edit.startLine < 1 || edit.endLine > lines.length) {
        return {
          success: false,
          message: `Invalid line range: ${edit.startLine}-${edit.endLine} (file has ${lines.length} lines)`,
        };
      }

      const currentSlice = lines.slice(edit.startLine - 1, edit.endLine).join('\n');
      if (edit.expectedContent !== undefined) {
        const expected = this.normalizeLineRangeText(edit.expectedContent);
        const actual = this.normalizeLineRangeText(currentSlice);
        if (expected !== actual) {
          return {
            success: false,
            message: `Content at lines ${edit.startLine}-${edit.endLine} does not match expected. Refusing to replace. Re-read the file and try again with the current content.`,
            linesChanged: 0,
          };
        }
      }

      // Create backup
      await this.createBackup(filePath, content);

      // Replace lines
      const newLines = [
        ...lines.slice(0, edit.startLine - 1),
        ...edit.newContent.split('\n'),
        ...lines.slice(edit.endLine),
      ];

      const newContent = newLines.join('\n');
      await fs.writeFile(fullPath, newContent, 'utf-8');

      // Generate diff
      const patches = diff.createPatch(filePath, content, newContent);
      const linesChanged = this.countChangedLines(patches);

      return {
        success: true,
        message: `Successfully edited lines ${edit.startLine}-${edit.endLine} in ${filePath}`,
        diff: patches,
        linesChanged,
      };

    } catch (error: any) {
      return {
        success: false,
        message: `Failed to edit ${filePath}: ${error.message}`,
      };
    }
  }

  /**
   * Insert content at specific line
   */
  async insertAtLine(filePath: string, line: number, content: string): Promise<EditResult> {
    const fullPath = path.resolve(this.workingDir, filePath);
    
    try {
      const originalContent = await fs.readFile(fullPath, 'utf-8');
      const lines = originalContent.split('\n');

      if (line < 1 || line > lines.length + 1) {
        return {
          success: false,
          message: `Invalid line number: ${line} (file has ${lines.length} lines)`,
        };
      }

      // Create backup
      await this.createBackup(filePath, originalContent);

      // Insert content
      lines.splice(line - 1, 0, content);
      const newContent = lines.join('\n');

      await fs.writeFile(fullPath, newContent, 'utf-8');

      return {
        success: true,
        message: `Successfully inserted content at line ${line} in ${filePath}`,
        linesChanged: content.split('\n').length,
      };

    } catch (error: any) {
      return {
        success: false,
        message: `Failed to insert in ${filePath}: ${error.message}`,
      };
    }
  }

  /**
   * Apply unified diff patch
   */
  async applyPatch(filePath: string, patch: string): Promise<EditResult> {
    const fullPath = path.resolve(this.workingDir, filePath);
    
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      
      // Create backup
      await this.createBackup(filePath, content);

      // Apply patch
      const patches = diff.parsePatch(patch);
      if (patches.length === 0) {
        return {
          success: false,
          message: 'Invalid patch format',
        };
      }

      const result = diff.applyPatch(content, patches[0]);
      
      if (result === false) {
        return {
          success: false,
          message: 'Patch could not be applied (content may have changed)',
        };
      }

      await fs.writeFile(fullPath, result as string, 'utf-8');

      return {
        success: true,
        message: `Successfully applied patch to ${filePath}`,
        diff: patch,
      };

    } catch (error: any) {
      return {
        success: false,
        message: `Failed to apply patch to ${filePath}: ${error.message}`,
      };
    }
  }

  /**
   * Revert file to backup
   */
  async revertToBackup(filePath: string, backupIndex: number = 0): Promise<EditResult> {
    const backups = await this.listBackups(filePath);
    
    if (backups.length === 0) {
      return {
        success: false,
        message: `No backups found for ${filePath}`,
      };
    }

    if (backupIndex >= backups.length) {
      return {
        success: false,
        message: `Backup index ${backupIndex} not found (have ${backups.length} backups)`,
      };
    }

    const backupPath = backups[backupIndex];
    const fullPath = path.resolve(this.workingDir, filePath);

    try {
      const backupContent = await fs.readFile(backupPath, 'utf-8');
      await fs.writeFile(fullPath, backupContent, 'utf-8');

      return {
        success: true,
        message: `Successfully reverted ${filePath} to backup ${backupIndex}`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to revert: ${error.message}`,
      };
    }
  }

  /**
   * Create backup of file
   */
  private async createBackup(filePath: string, content: string): Promise<void> {
    await fs.mkdir(this.backupDir, { recursive: true });
    
    const timestamp = Date.now();
    const backupName = `${filePath.replace(/[\/\\]/g, '_')}.${timestamp}.backup`;
    const backupPath = path.join(this.backupDir, backupName);

    await fs.writeFile(backupPath, content, 'utf-8');
  }

  /**
   * List backups for a file
   */
  private async listBackups(filePath: string): Promise<string[]> {
    try {
      const backupPrefix = filePath.replace(/[\/\\]/g, '_');
      const files = await fs.readdir(this.backupDir);
      
      const backups = files
        .filter(f => f.startsWith(backupPrefix) && f.endsWith('.backup'))
        .sort((a, b) => {
          const timeA = parseInt(a.split('.')[1]);
          const timeB = parseInt(b.split('.')[1]);
          return timeB - timeA; // Most recent first
        })
        .map(f => path.join(this.backupDir, f));

      return backups;
    } catch {
      return [];
    }
  }

  /**
   * Count changed lines in diff
   */
  private countChangedLines(patch: string): number {
    const lines = patch.split('\n');
    return lines.filter(l => l.startsWith('+') || l.startsWith('-')).length;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get file info for display
   */
  async getFileInfo(filePath: string): Promise<{
    exists: boolean;
    lines?: number;
    size?: number;
    preview?: string;
  }> {
    const fullPath = path.resolve(this.workingDir, filePath);
    
    try {
      const stats = await fs.stat(fullPath);
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');
      
      // Get first 10 lines as preview
      const preview = lines.slice(0, 10).join('\n');

      return {
        exists: true,
        lines: lines.length,
        size: stats.size,
        preview,
      };
    } catch {
      return { exists: false };
    }
  }
}
