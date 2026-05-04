import * as fs from 'fs/promises';
import * as path from 'path';
import * as diff from 'diff';
import type { UUID } from 'crypto';
import { sanitizePath } from './utils/safety.js';
import {
  createBackup as fhCreateBackup,
  restoreBackup as fhRestoreBackup,
  getBackupFileName,
  resolveBackupPath,
} from './file-history.js';
import { generateUuid } from './transcript-types.js';

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
}

export interface VerifiedEdit {
  startLine: number;
  endLine: number;
  oldContent: string;   // Must match what's actually in the file at these lines
  newContent: string;
}

export class FileEditor {
  private workingDir: string;
  /** Tracks the next backup version number per file path. */
  private fileVersions = new Map<string, number>();

  constructor(workingDir: string) {
    this.workingDir = workingDir;
  }

  /**
   * Resolve filePath under workingDir (same rules as read_file / write_file).
   * Rejects absolute paths outside the working directory (e.g. hallucinated /workspace/...).
   */
  private resolveSafePath(filePath: string): { ok: true; fullPath: string } | { ok: false; message: string } {
    const r = sanitizePath(this.workingDir, filePath);
    if (!r.ok) {
      return {
        ok: false,
        message: `${r.message} Use paths relative to the repository root (e.g. package.json, src/foo.ts), not absolute paths like /workspace or /app.`,
      };
    }
    return { ok: true, fullPath: r.path };
  }

  /**
   * Smart edit - searches for unique section and replaces it
   * This is the most reliable way to edit files
   */
  async smartEdit(filePath: string, edit: SearchReplaceEdit): Promise<EditResult> {
    const resolved = this.resolveSafePath(filePath);
    if (!resolved.ok) {
      return { success: false, message: resolved.message };
    }
    const fullPath = resolved.fullPath;

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
   * Edit specific line range - good for large files
   */
  async editLineRange(filePath: string, edit: LineRangeEdit): Promise<EditResult> {
    const resolved = this.resolveSafePath(filePath);
    if (!resolved.ok) {
      return { success: false, message: resolved.message };
    }
    const fullPath = resolved.fullPath;

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');

      if (edit.startLine < 1 || edit.endLine > lines.length) {
        return {
          success: false,
          message: `Invalid line range: ${edit.startLine}-${edit.endLine} (file has ${lines.length} lines)`,
        };
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
   * Verified edit - requires old content to match before replacing.
   * This is the most reliable editing method as it prevents hallucinated edits.
   * If the old content doesn't match, returns the actual content so the AI can self-correct.
   */
  async verifiedEdit(filePath: string, edit: VerifiedEdit): Promise<EditResult & { actual_content?: string }> {
    const resolved = this.resolveSafePath(filePath);
    if (!resolved.ok) {
      return { success: false, message: resolved.message };
    }
    const fullPath = resolved.fullPath;

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');

      // Validate line range
      if (edit.startLine < 1 || edit.endLine > lines.length) {
        return {
          success: false,
          message: `Invalid line range: ${edit.startLine}-${edit.endLine} (file has ${lines.length} lines)`,
        };
      }

      if (edit.startLine > edit.endLine) {
        return {
          success: false,
          message: `Invalid line range: start_line (${edit.startLine}) must be <= end_line (${edit.endLine})`,
        };
      }

      // Extract actual content at the specified lines
      const actualLines = lines.slice(edit.startLine - 1, edit.endLine);
      const actualContent = actualLines.join('\n');

      // Normalize for comparison: trim trailing whitespace per line, then compare
      const normalize = (s: string) => s.split('\n').map(l => l.trimEnd()).join('\n').trim();
      const normalizedActual = normalize(actualContent);
      const normalizedExpected = normalize(edit.oldContent);

      if (normalizedActual !== normalizedExpected) {
        return {
          success: false,
          message: `Content mismatch at lines ${edit.startLine}-${edit.endLine}. The old_content you provided does not match the actual file content. Re-read the file and try again.`,
          actual_content: actualContent,
        };
      }

      // Content verified — proceed with edit
      await this.createBackup(filePath, content);

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
        message: `Successfully verified and edited lines ${edit.startLine}-${edit.endLine} in ${filePath}`,
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
    const resolved = this.resolveSafePath(filePath);
    if (!resolved.ok) {
      return { success: false, message: resolved.message };
    }
    const fullPath = resolved.fullPath;

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
    const resolved = this.resolveSafePath(filePath);
    if (!resolved.ok) {
      return { success: false, message: resolved.message };
    }
    const fullPath = resolved.fullPath;

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
   * Revert file to backup using the file-history checkpoint system.
   */
  async revertToBackup(filePath: string, backupIndex: number = 0): Promise<EditResult> {
    const resolved = this.resolveSafePath(filePath);
    if (!resolved.ok) {
      return { success: false, message: resolved.message };
    }

    const fullPath = resolved.fullPath;
    const version = this.fileVersions.get(fullPath) ?? 1;

    // Walk backward from current version to find the requested backup
    const targetVersion = version - backupIndex;
    if (targetVersion < 1) {
      return {
        success: false,
        message: `Backup index ${backupIndex} not found (have ${version - 1} backups)`,
      };
    }

    const backupFileName = getBackupFileName(fullPath, targetVersion);
    const restored = await fhRestoreBackup(fullPath, backupFileName);

    if (!restored) {
      return {
        success: false,
        message: `No backup found for ${filePath} at version ${targetVersion}`,
      };
    }

    return {
      success: true,
      message: `Successfully reverted ${filePath} to backup version ${targetVersion}`,
    };
  }

  /**
   * Create backup of file using the file-history checkpoint system.
   * Uses copyFile for efficient kernel-level copy without reading into JS heap.
   */
  private async createBackup(filePath: string, content: string): Promise<void> {
    const resolved = this.resolveSafePath(filePath);
    if (!resolved.ok) return;

    const fullPath = resolved.fullPath;
    const currentVersion = this.fileVersions.get(fullPath) ?? 0;
    const nextVersion = currentVersion + 1;

    // Create backup via file-history system (copyFile-based)
    await fhCreateBackup(fullPath, nextVersion);
    this.fileVersions.set(fullPath, nextVersion);
  }

  /**
   * List backups for a file from the file-history system.
   */
  private async listBackups(filePath: string): Promise<string[]> {
    const resolved = this.resolveSafePath(filePath);
    if (!resolved.ok) return [];

    const fullPath = resolved.fullPath;
    const version = this.fileVersions.get(fullPath) ?? 0;
    const backupPaths: string[] = [];

    // List backup files from newest to oldest
    for (let v = version; v >= 1; v--) {
      const backupFileName = getBackupFileName(fullPath, v);
      const backupPath = resolveBackupPath(backupFileName);
      try {
        await fs.access(backupPath);
        backupPaths.push(backupPath);
      } catch {
        // Backup doesn't exist — skip
      }
    }

    return backupPaths;
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
    const resolved = this.resolveSafePath(filePath);
    if (!resolved.ok) {
      return { exists: false };
    }
    const fullPath = resolved.fullPath;

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
