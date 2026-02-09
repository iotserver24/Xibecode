import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitUtils } from '../src/utils/git.js';
import { exec } from 'child_process';

vi.mock('child_process');

describe('GitUtils', () => {
  let gitUtils: GitUtils;

  beforeEach(() => {
    gitUtils = new GitUtils('/test/dir');
    vi.clearAllMocks();
  });

  describe('isGitRepository', () => {
    it('should return true when in a git repository', async () => {
      vi.mocked(exec).mockImplementation(((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '.git\n', stderr: '' });
      }) as any);

      const result = await gitUtils.isGitRepository();
      expect(result).toBe(true);
    });

    it('should return false when not in a git repository', async () => {
      vi.mocked(exec).mockImplementation(((cmd: string, opts: any, callback: any) => {
        callback(new Error('Not a git repository'));
      }) as any);

      const result = await gitUtils.isGitRepository();
      expect(result).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return git status with all information', async () => {
      vi.mocked(exec).mockImplementation(((cmd: string, opts: any, callback: any) => {
        if (cmd.includes('rev-parse')) {
          callback(null, { stdout: '.git\n', stderr: '' });
        } else if (cmd.includes('branch --show-current')) {
          callback(null, { stdout: 'main\n', stderr: '' });
        } else if (cmd.includes('status --porcelain')) {
          callback(null, { stdout: 'M  file1.ts\n A file2.ts\n?? file3.ts\n', stderr: '' });
        } else if (cmd.includes('rev-list')) {
          callback(null, { stdout: '2\t1\n', stderr: '' });
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
      }) as any);

      const result = await gitUtils.getStatus();
      
      expect(result.isGitRepo).toBe(true);
      expect(result.branch).toBe('main');
      expect(result.isClean).toBe(false);
      expect(result.ahead).toBe(2);
      expect(result.behind).toBe(1);
    });

    it('should return not a repo when check fails', async () => {
      vi.mocked(exec).mockImplementation(((cmd: string, opts: any, callback: any) => {
        callback(new Error('Not a git repository'));
      }) as any);

      const result = await gitUtils.getStatus();
      expect(result.isGitRepo).toBe(false);
    });
  });

  describe('getChangedFiles', () => {
    it('should return list of changed files', async () => {
      vi.mocked(exec).mockImplementation(((cmd: string, opts: any, callback: any) => {
        if (cmd.includes('rev-parse')) {
          callback(null, { stdout: '.git\n', stderr: '' });
        } else if (cmd.includes('branch --show-current')) {
          callback(null, { stdout: 'main\n', stderr: '' });
        } else if (cmd.includes('status --porcelain')) {
          callback(null, { stdout: 'M  src/index.ts\n A src/new.ts\n', stderr: '' });
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
      }) as any);

      const result = await gitUtils.getChangedFiles();
      expect(result).toContain('src/index.ts');
      expect(result).toContain('src/new.ts');
    });

    it('should return empty array when not a git repo', async () => {
      vi.mocked(exec).mockImplementation(((cmd: string, opts: any, callback: any) => {
        callback(new Error('Not a git repository'));
      }) as any);

      const result = await gitUtils.getChangedFiles();
      expect(result).toEqual([]);
    });
  });

  describe('getDiffSummary', () => {
    it('should parse diff summary correctly', async () => {
      vi.mocked(exec).mockImplementation(((cmd: string, opts: any, callback: any) => {
        if (cmd.includes('rev-parse')) {
          callback(null, { stdout: '.git\n', stderr: '' });
        } else if (cmd.includes('diff --numstat')) {
          callback(null, { 
            stdout: '10\t5\tsrc/index.ts\n20\t3\tsrc/utils.ts\n', 
            stderr: '' 
          });
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
      }) as any);

      const result = await gitUtils.getDiffSummary();
      
      expect(result.totalFiles).toBe(2);
      expect(result.totalInsertions).toBe(30);
      expect(result.totalDeletions).toBe(8);
      expect(result.files[0]).toEqual({
        path: 'src/index.ts',
        insertions: 10,
        deletions: 5,
        changes: 15,
      });
    });

    it('should return empty summary when not a git repo', async () => {
      vi.mocked(exec).mockImplementation(((cmd: string, opts: any, callback: any) => {
        callback(new Error('Not a git repository'));
      }) as any);

      const result = await gitUtils.getDiffSummary();
      expect(result.totalFiles).toBe(0);
      expect(result.files).toEqual([]);
    });
  });

  describe('createCheckpoint', () => {
    it('should create stash checkpoint successfully', async () => {
      vi.mocked(exec).mockImplementation(((cmd: string, opts: any, callback: any) => {
        if (cmd.includes('rev-parse')) {
          callback(null, { stdout: '.git\n', stderr: '' });
        } else if (cmd.includes('stash push')) {
          callback(null, { stdout: 'Saved working directory\n', stderr: '' });
        } else if (cmd.includes('stash list')) {
          callback(null, { stdout: 'stash@{0}: xibecode checkpoint: test\n', stderr: '' });
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
      }) as any);

      const result = await gitUtils.createCheckpoint('test', 'stash');
      
      expect(result.success).toBe(true);
      expect(result.checkpoint?.type).toBe('stash');
      expect(result.checkpoint?.id).toBe('stash@{0}');
    });

    it('should create commit checkpoint successfully', async () => {
      vi.mocked(exec).mockImplementation(((cmd: string, opts: any, callback: any) => {
        if (cmd.includes('rev-parse --git-dir')) {
          callback(null, { stdout: '.git\n', stderr: '' });
        } else if (cmd.includes('add -A')) {
          callback(null, { stdout: '', stderr: '' });
        } else if (cmd.includes('commit')) {
          callback(null, { stdout: '[main abc123] checkpoint\n', stderr: '' });
        } else if (cmd.includes('rev-parse HEAD')) {
          callback(null, { stdout: 'abc123def456\n', stderr: '' });
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
      }) as any);

      const result = await gitUtils.createCheckpoint('test', 'commit');
      
      expect(result.success).toBe(true);
      expect(result.checkpoint?.type).toBe('commit');
    });

    it('should return error when not a git repo', async () => {
      vi.mocked(exec).mockImplementation(((cmd: string, opts: any, callback: any) => {
        callback(new Error('Not a git repository'));
      }) as any);

      const result = await gitUtils.createCheckpoint('test');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not a git repository');
    });
  });

  describe('revertToCheckpoint', () => {
    it('should require confirmation', async () => {
      const checkpoint = {
        type: 'stash' as const,
        id: 'stash@{0}',
        message: 'test',
        timestamp: new Date(),
      };

      const result = await gitUtils.revertToCheckpoint(checkpoint, false);
      expect(result.success).toBe(false);
      expect(result.error).toContain('confirmation');
    });

    it('should revert stash checkpoint with confirmation', async () => {
      vi.mocked(exec).mockImplementation(((cmd: string, opts: any, callback: any) => {
        if (cmd.includes('rev-parse')) {
          callback(null, { stdout: '.git\n', stderr: '' });
        } else if (cmd.includes('stash apply')) {
          callback(null, { stdout: 'Applied stash\n', stderr: '' });
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
      }) as any);

      const checkpoint = {
        type: 'stash' as const,
        id: 'stash@{0}',
        message: 'test',
        timestamp: new Date(),
      };

      const result = await gitUtils.revertToCheckpoint(checkpoint, true);
      expect(result.success).toBe(true);
    });
  });
});
