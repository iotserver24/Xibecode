import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

export interface GitStatus {
  isGitRepo: boolean;
  branch?: string;
  isClean?: boolean;
  staged?: string[];
  unstaged?: string[];
  untracked?: string[];
  ahead?: number;
  behind?: number;
}

export interface GitDiffSummary {
  files: Array<{
    path: string;
    insertions: number;
    deletions: number;
    changes: number;
  }>;
  totalInsertions: number;
  totalDeletions: number;
  totalFiles: number;
}

export interface GitCheckpoint {
  type: 'stash' | 'commit';
  id: string;
  message: string;
  timestamp: Date;
}

export class GitUtils {
  private workingDir: string;

  constructor(workingDir: string = process.cwd()) {
    this.workingDir = workingDir;
  }

  /**
   * Check if the current directory is inside a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('git rev-parse --git-dir', {
        cwd: this.workingDir,
        timeout: 5000,
      });
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get current git status with detailed information
   */
  async getStatus(): Promise<GitStatus> {
    const isRepo = await this.isGitRepository();
    if (!isRepo) {
      return { isGitRepo: false };
    }

    try {
      // Get branch name
      const branchResult = await execAsync('git branch --show-current', {
        cwd: this.workingDir,
        timeout: 5000,
      });
      const branch = branchResult.stdout.trim();

      // Get status porcelain for parsing
      const statusResult = await execAsync('git status --porcelain', {
        cwd: this.workingDir,
        timeout: 5000,
      });

      const staged: string[] = [];
      const unstaged: string[] = [];
      const untracked: string[] = [];

      const lines = statusResult.stdout.trim().split('\n').filter(l => l);
      for (const line of lines) {
        const status = line.substring(0, 2);
        const file = line.substring(3);

        if (status[0] !== ' ' && status[0] !== '?') {
          staged.push(file);
        }
        if (status[1] !== ' ' && status[1] !== '?') {
          unstaged.push(file);
        }
        if (status === '??') {
          untracked.push(file);
        }
      }

      const isClean = lines.length === 0;

      // Get ahead/behind info
      let ahead = 0;
      let behind = 0;
      try {
        const revListResult = await execAsync('git rev-list --left-right --count HEAD...@{upstream}', {
          cwd: this.workingDir,
          timeout: 5000,
        });
        const [aheadStr, behindStr] = revListResult.stdout.trim().split('\t');
        ahead = parseInt(aheadStr, 10) || 0;
        behind = parseInt(behindStr, 10) || 0;
      } catch {
        // No upstream or other error, ignore
      }

      return {
        isGitRepo: true,
        branch,
        isClean,
        staged,
        unstaged,
        untracked,
        ahead,
        behind,
      };
    } catch (error: any) {
      return {
        isGitRepo: true,
        branch: undefined,
      };
    }
  }

  /**
   * Get list of changed files (staged + unstaged)
   */
  async getChangedFiles(): Promise<string[]> {
    const status = await this.getStatus();
    if (!status.isGitRepo) return [];

    const changed = new Set<string>();
    status.staged?.forEach(f => changed.add(f));
    status.unstaged?.forEach(f => changed.add(f));

    return Array.from(changed);
  }

  /**
   * Get diff summary with line count statistics
   */
  async getDiffSummary(target: string = 'HEAD'): Promise<GitDiffSummary> {
    const isRepo = await this.isGitRepository();
    if (!isRepo) {
      return { files: [], totalInsertions: 0, totalDeletions: 0, totalFiles: 0 };
    }

    try {
      const { stdout } = await execAsync(`git diff --numstat ${target}`, {
        cwd: this.workingDir,
        timeout: 10000,
      });

      const files: GitDiffSummary['files'] = [];
      let totalInsertions = 0;
      let totalDeletions = 0;

      const lines = stdout.trim().split('\n').filter(l => l);
      for (const line of lines) {
        const [insertions, deletions, filepath] = line.split('\t');
        const ins = parseInt(insertions, 10) || 0;
        const del = parseInt(deletions, 10) || 0;

        files.push({
          path: filepath,
          insertions: ins,
          deletions: del,
          changes: ins + del,
        });

        totalInsertions += ins;
        totalDeletions += del;
      }

      return {
        files,
        totalInsertions,
        totalDeletions,
        totalFiles: files.length,
      };
    } catch (error: any) {
      return { files: [], totalInsertions: 0, totalDeletions: 0, totalFiles: 0 };
    }
  }

  /**
   * Get unified diff for a file or entire repo
   */
  async getUnifiedDiff(filePath?: string, target: string = 'HEAD'): Promise<string> {
    const isRepo = await this.isGitRepository();
    if (!isRepo) return '';

    try {
      const command = filePath
        ? `git diff ${target} -- ${filePath}`
        : `git diff ${target}`;

      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        timeout: 10000,
        maxBuffer: 1024 * 1024 * 10,
      });

      return stdout;
    } catch (error: any) {
      return '';
    }
  }

  /**
   * Create a git checkpoint (stash or commit)
   */
  async createCheckpoint(
    message: string,
    strategy: 'stash' | 'commit' = 'stash'
  ): Promise<{ success: boolean; checkpoint?: GitCheckpoint; error?: string }> {
    const isRepo = await this.isGitRepository();
    if (!isRepo) {
      return { success: false, error: 'Not a git repository' };
    }

    try {
      const timestamp = new Date();
      const fullMessage = `xibecode checkpoint: ${message}`;

      if (strategy === 'stash') {
        // Create a stash with keep-index to preserve staged files
        const { stdout } = await execAsync(`git stash push -u -m "${fullMessage}"`, {
          cwd: this.workingDir,
          timeout: 30000,
        });

        // Check if stash was created (git stash says "No local changes" if nothing to stash)
        if (stdout.includes('No local changes')) {
          return { success: false, error: 'No changes to checkpoint' };
        }

        // Get the stash id
        const stashList = await execAsync('git stash list', {
          cwd: this.workingDir,
          timeout: 5000,
        });
        const stashId = stashList.stdout.split('\n')[0]?.split(':')[0] || 'stash@{0}';

        return {
          success: true,
          checkpoint: {
            type: 'stash',
            id: stashId,
            message: fullMessage,
            timestamp,
          },
        };
      } else {
        // Create a commit with --no-verify to skip hooks
        // First add all changes
        await execAsync('git add -A', {
          cwd: this.workingDir,
          timeout: 10000,
        });

        const { stdout } = await execAsync(`git commit --no-verify -m "${fullMessage}"`, {
          cwd: this.workingDir,
          timeout: 30000,
        });

        // Get the commit hash
        const hashResult = await execAsync('git rev-parse HEAD', {
          cwd: this.workingDir,
          timeout: 5000,
        });
        const commitHash = hashResult.stdout.trim();

        return {
          success: true,
          checkpoint: {
            type: 'commit',
            id: commitHash,
            message: fullMessage,
            timestamp,
          },
        };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Revert to a git checkpoint
   */
  async revertToCheckpoint(
    checkpoint: GitCheckpoint,
    confirm: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    if (!confirm) {
      return { success: false, error: 'Revert requires explicit confirmation. Set confirm: true' };
    }

    const isRepo = await this.isGitRepository();
    if (!isRepo) {
      return { success: false, error: 'Not a git repository' };
    }

    try {
      if (checkpoint.type === 'stash') {
        // Apply the stash
        await execAsync(`git stash apply ${checkpoint.id}`, {
          cwd: this.workingDir,
          timeout: 30000,
        });

        return { success: true };
      } else {
        // Reset to commit (soft reset to preserve changes as uncommitted)
        await execAsync(`git reset --soft ${checkpoint.id}`, {
          cwd: this.workingDir,
          timeout: 10000,
        });

        return { success: true };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * List recent checkpoints created by XibeCode
   */
  async listCheckpoints(limit: number = 10): Promise<GitCheckpoint[]> {
    const isRepo = await this.isGitRepository();
    if (!isRepo) return [];

    const checkpoints: GitCheckpoint[] = [];

    try {
      // Get stashes
      const { stdout: stashList } = await execAsync('git stash list', {
        cwd: this.workingDir,
        timeout: 5000,
      });

      const stashLines = stashList.trim().split('\n').filter(l => l);
      for (const line of stashLines) {
        if (line.includes('xibecode checkpoint')) {
          const match = line.match(/^(stash@\{(\d+)\}): (.+): (.+)$/);
          if (match) {
            const [, id, , , message] = match;
            checkpoints.push({
              type: 'stash',
              id,
              message,
              timestamp: new Date(), // Git stash doesn't expose timestamp easily
            });
          }
        }
      }

      // Get commits
      const { stdout: commitList } = await execAsync(
        `git log -${limit} --pretty=format:"%H|%s|%cd" --date=iso`,
        {
          cwd: this.workingDir,
          timeout: 5000,
        }
      );

      const commitLines = commitList.trim().split('\n').filter(l => l);
      for (const line of commitLines) {
        const [hash, message, dateStr] = line.split('|');
        if (message.includes('xibecode checkpoint')) {
          checkpoints.push({
            type: 'commit',
            id: hash,
            message,
            timestamp: new Date(dateStr),
          });
        }
      }
    } catch {
      // Ignore errors
    }

    return checkpoints.slice(0, limit);
  }

  /**
   * Get files changed compared to a specific branch or commit
   */
  async getChangedFilesSince(target: string): Promise<string[]> {
    const isRepo = await this.isGitRepository();
    if (!isRepo) return [];

    try {
      const { stdout } = await execAsync(`git diff --name-only ${target}`, {
        cwd: this.workingDir,
        timeout: 10000,
      });

      return stdout.trim().split('\n').filter(l => l);
    } catch {
      return [];
    }
  }

  /**
   * Commit staged changes with optional AI attribution trailer
   */
  async commit(message: string, agentName?: string): Promise<{ success: boolean; hash?: string; error?: string }> {
    try {
      // Escape double quotes for shell safety
      const escapedMessage = message.replace(/"/g, '\\"');
      let command = `git commit -m "${escapedMessage}"`;

      if (agentName) {
        // Add trailer
        command += ` --trailer "X-AI-Agent: ${agentName.replace(/"/g, '\\"')}"`;
      }

      await execAsync(command, { cwd: this.workingDir });

      const hashResult = await execAsync('git rev-parse HEAD', { cwd: this.workingDir });
      return { success: true, hash: hashResult.stdout.trim() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get blame with AI attribution
   * Returns a map of line number -> { author, agent, commit }
   * simpler string output for now
   */
  async getBlame(filePath: string): Promise<string> {
    try {
      // Use --porcelain for easy parsing (not line-porcelain, standard porcelain is enough for hash+line)
      // Actually standard porcelain is weird. --line-porcelain gives full commit info per line.
      // Let's stick to --line-porcelain but ignore the commit info since it lacks trailers.
      // Or just git blame -l -s (hash only)? No we need line numbers.
      // Let's use --porcelain which is:
      // hash orig_line final_line group_lines
      // author ...
      // HEADER fields...
      // TAB content

      const { stdout } = await execAsync(`git blame --line-porcelain "${filePath}"`, {
        cwd: this.workingDir,
        maxBuffer: 1024 * 1024 * 50 // 50MB buffer
      });

      const lines = stdout.split('\n');
      const blkLines: { hash: string; lineNum: number; code: string; author: string }[] = [];
      const uniqueHashes = new Set<string>();

      let currentHash = '';
      let currentLineNum = 0;
      let currentAuthor = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^[0-9a-f]{40} \d+ \d+/.test(line)) {
          const parts = line.split(' ');
          currentHash = parts[0];
          currentLineNum = parseInt(parts[2], 10);
          uniqueHashes.add(currentHash);
        } else if (line.startsWith('author ')) {
          currentAuthor = line.substring(7);
        } else if (line.startsWith('\t')) {
          blkLines.push({
            hash: currentHash,
            lineNum: currentLineNum,
            code: line.substring(1),
            author: currentAuthor
          });
        }
      }

      // Fetch trailers for all hashes
      const hashes = Array.from(uniqueHashes);
      const agentMap = new Map<string, string>();

      if (hashes.length > 0) {
        // Limit to reasonable batch size if needed, but git log can handle many args
        // Format: Hash %x09 AgentName
        // %(trailers:key=X-AI-Agent,valueonly=true)
        const cmd = `git log --no-walk --format="%H%x09%(trailers:key=X-AI-Agent,valueonly=true)" ${hashes.join(' ')}`;
        try {
          const { stdout: logOut } = await execAsync(cmd, { cwd: this.workingDir });
          const logLines = logOut.split('\n');
          for (const logLine of logLines) {
            const [hash, agent] = logLine.split('\t');
            if (hash && agent && agent.trim()) {
              agentMap.set(hash, agent.trim());
            }
          }
        } catch (e) {
          // If git log fails (e.g. too many args), we just don't show agents
          console.error('Failed to fetch trailers:', e);
        }
      }

      let output = '';
      for (const item of blkLines) {
        const agent = agentMap.get(item.hash);
        const authorLabel = agent ? `🤖 ${agent}` : item.author;
        output += `${item.lineNum.toString().padEnd(4)} ${item.hash.substring(0, 7)} (${authorLabel}) ${item.code}\n`;
      }

      return output;
    } catch (error: any) {
      return `Error running blame: ${error.message}`;
    }
  }
}

