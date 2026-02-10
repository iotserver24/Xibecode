import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileEditor, SearchReplaceEdit, LineRangeEdit } from '../src/core/editor.js';
import * as fs from 'fs/promises';
import * as diff from 'diff';

vi.mock('fs/promises');
vi.mock('diff');

describe('FileEditor', () => {
  let fileEditor: FileEditor;
  const mockContent = `function greet(name) {
  console.log("Hello, " + name);
}

function farewell(name) {
  console.log("Goodbye, " + name);
}`;

  beforeEach(() => {
    fileEditor = new FileEditor('/test/working/dir');
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with working directory', () => {
      expect(fileEditor).toBeDefined();
    });
  });

  describe('smartEdit', () => {
    beforeEach(() => {
      vi.mocked(fs.readFile).mockResolvedValue(mockContent);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(diff.createPatch).mockReturnValue('--- original\n+++ modified\n+change');
    });

    it('should successfully edit file with unique search string', async () => {
      const edit: SearchReplaceEdit = {
        search: 'function greet(name) {',
        replace: 'function greetUser(name) {',
      };

      const result = await fileEditor.smartEdit('test.js', edit);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully edited');
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should fail when search string not found', async () => {
      const edit: SearchReplaceEdit = {
        search: 'function nonexistent() {',
        replace: 'function newFunc() {',
      };

      const result = await fileEditor.smartEdit('test.js', edit);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Search string not found');
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should fail when search string appears multiple times without all flag', async () => {
      const edit: SearchReplaceEdit = {
        // This string appears twice in mockContent
        search: 'console.log(',
        replace: 'console.log("Hi, " + name);',
        // all: false by default
      };

      const result = await fileEditor.smartEdit('test.js', edit);

      expect(result.success).toBe(false);
      expect(result.message).toContain('appears 2 times');
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should replace all occurrences when all flag is true', async () => {
      const edit: SearchReplaceEdit = {
        search: 'console.log("Hello, " + name);',
        replace: 'console.log("Hi, " + name);',
        all: true,
      };

      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await fileEditor.smartEdit('test.js', edit);

      expect(result.success).toBe(true);
      expect(result.linesChanged).toBeGreaterThan(0);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should create backup before editing', async () => {
      const edit: SearchReplaceEdit = {
        search: 'function greet(name) {',
        replace: 'function greetUser(name) {',
      };

      await fileEditor.smartEdit('test.js', edit);

      expect(fs.mkdir).toHaveBeenCalledWith('/test/working/dir/.xibecode_backups', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('editLineRange', () => {
    beforeEach(() => {
      vi.mocked(fs.readFile).mockResolvedValue(mockContent);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(diff.createPatch).mockReturnValue('--- original\n+++ modified\n+change');
    });

    it('should edit specific line range', async () => {
      const edit: LineRangeEdit = {
        startLine: 2,
        endLine: 3,
        newContent: '  // This is a comment',
      };

      const result = await fileEditor.editLineRange('test.js', edit);

      expect(result.success).toBe(true);
      expect(result.message).toContain('lines 2-3');
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should fail with invalid line range', async () => {
      const edit: LineRangeEdit = {
        startLine: 10,
        endLine: 20,
        newContent: 'new content',
      };

      // Mock file with only 6 lines
      vi.mocked(fs.readFile).mockResolvedValue('line1\nline2\nline3\nline4\nline5\nline6');

      const result = await fileEditor.editLineRange('test.js', edit);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid line range');
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('insertAtLine', () => {
    beforeEach(() => {
      vi.mocked(fs.readFile).mockResolvedValue('line1\nline2\nline3');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    });

    it('should insert content at specified line', async () => {
      const result = await fileEditor.insertAtLine('test.js', 2, 'inserted line');

      expect(result.success).toBe(true);
      expect(result.message).toContain('line 2');
      expect(result.linesChanged).toBe(1);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should handle insertion at end of file', async () => {
      const result = await fileEditor.insertAtLine('test.js', 4, 'last line');

      expect(result.success).toBe(true);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should fail with invalid line number', async () => {
      const result = await fileEditor.insertAtLine('test.js', 0, 'content');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid line number');
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('revertToBackup', () => {
    beforeEach(() => {
      vi.mocked(fs.readdir).mockResolvedValue([
        'test.js.1234567890.backup',
        'test.js.1234567000.backup',
        'test.js.1234568000.backup',
      ]);
      vi.mocked(fs.readFile).mockResolvedValue('backup content');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    });

    it('should revert to most recent backup by default', async () => {
      const result = await fileEditor.revertToBackup('test.js');

      expect(result.success).toBe(true);
      expect(result.message).toContain('backup 0'); // Most recent
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should revert to specific backup index', async () => {
      const result = await fileEditor.revertToBackup('test.js', 2);

      expect(result.success).toBe(true);
      expect(result.message).toContain('backup 2');
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should fail when no backups exist', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('No such directory'));

      const result = await fileEditor.revertToBackup('nonexistent.js');

      expect(result.success).toBe(false);
      expect(result.message).toContain('No backups found');
    });

    it('should fail when backup index is out of range', async () => {
      const result = await fileEditor.revertToBackup('test.js', 5);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Backup index 5 not found');
    });
  });

  describe('createBackup', () => {
    it('should create backup directory and file', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await (fileEditor as any).createBackup('test.js', 'original content');

      expect(fs.mkdir).toHaveBeenCalledWith('/test/working/dir/.xibecode_backups', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('getFileInfo', () => {
    beforeEach(() => {
      vi.mocked(fs.stat).mockResolvedValue({ size: 150, mtime: new Date() } as any);
      vi.mocked(fs.readFile).mockResolvedValue('line1\nline2\nline3');
    });

    it('should get file info for existing file', async () => {
      const result = await fileEditor.getFileInfo('test.js');

      expect(result.exists).toBe(true);
      expect(result.lines).toBe(3);
      expect(result.size).toBe(150);
      expect(result.preview).toContain('line1');
    });

    it('should return exists: false for non-existent file', async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error('File not found'));

      const result = await fileEditor.getFileInfo('nonexistent.js');

      expect(result.exists).toBe(false);
    });
  });

  describe('escapeRegex', () => {
    it('should escape special regex characters', () => {
      const editor = new FileEditor('/test');
      const escaped = (editor as any).escapeRegex('function (name) {');

      expect(escaped).toBe('function \\(name\\) \\{');
    });
  });
});