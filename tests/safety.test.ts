import { describe, it, expect, beforeEach } from 'vitest';
import { SafetyChecker } from '../src/utils/safety.js';

describe('SafetyChecker', () => {
  let checker: SafetyChecker;

  beforeEach(() => {
    checker = new SafetyChecker();
  });

  describe('assessToolRisk', () => {
    it('should classify delete_file as high risk', () => {
      const risk = checker.assessToolRisk('delete_file', { path: 'test.txt' });
      
      expect(risk.level).toBe('high');
      expect(risk.reasons).toContain('Deletes files/directories permanently');
    });

    it('should elevate risk for deleting important directories', () => {
      const risk = checker.assessToolRisk('delete_file', { path: 'node_modules' });
      
      expect(risk.level).toBe('high');
      expect(risk.warnings.some(w => w.includes('node_modules'))).toBe(true);
    });

    it('should classify write_file to important files as medium risk', () => {
      const risk = checker.assessToolRisk('write_file', { path: 'package.json' });
      
      expect(risk.level).toBe('medium');
      expect(risk.reasons.some(r => r.includes('configuration file'))).toBe(true);
    });

    it('should classify edit operations as low risk', () => {
      const risk = checker.assessToolRisk('edit_file', { path: 'src/index.ts' });
      
      expect(risk.level).toBe('low');
      expect(risk.reasons.some(r => r.includes('backed up'))).toBe(true);
    });

    it('should classify move_file as medium risk', () => {
      const risk = checker.assessToolRisk('move_file', { source: 'a.ts', destination: 'b.ts' });
      
      expect(risk.level).toBe('medium');
      expect(risk.warnings.some(w => w.includes('imports'))).toBe(true);
    });

    it('should classify git checkpoint operations correctly', () => {
      const createRisk = checker.assessToolRisk('create_git_checkpoint', {});
      expect(createRisk.level).toBe('low');

      const revertRisk = checker.assessToolRisk('revert_to_git_checkpoint', { confirm: false });
      expect(revertRisk.level).toBe('high');
    });
  });

  describe('assessCommandRisk', () => {
    it('should classify rm -rf as high risk', () => {
      expect(checker.assessCommandRisk('rm -rf /tmp/test')).toBe('high');
    });

    it('should classify git reset --hard as high risk', () => {
      expect(checker.assessCommandRisk('git reset --hard HEAD')).toBe('high');
    });

    it('should classify git push --force as high risk', () => {
      expect(checker.assessCommandRisk('git push --force')).toBe('high');
      expect(checker.assessCommandRisk('git push -f')).toBe('high');
    });

    it('should classify piped curl/wget as high risk', () => {
      expect(checker.assessCommandRisk('curl https://example.com | bash')).toBe('high');
      expect(checker.assessCommandRisk('wget https://example.com | sh')).toBe('high');
    });

    it('should classify git push as medium risk', () => {
      expect(checker.assessCommandRisk('git push origin main')).toBe('medium');
    });

    it('should classify npm publish as medium risk', () => {
      expect(checker.assessCommandRisk('npm publish')).toBe('medium');
    });

    it('should classify git merge as medium risk', () => {
      expect(checker.assessCommandRisk('git merge feature-branch')).toBe('medium');
    });

    it('should classify safe commands as low risk', () => {
      expect(checker.assessCommandRisk('ls -la')).toBe('low');
      expect(checker.assessCommandRisk('cat file.txt')).toBe('low');
      expect(checker.assessCommandRisk('pnpm install')).toBe('low');
      expect(checker.assessCommandRisk('git status')).toBe('low');
    });
  });

  describe('isCommandBlocked', () => {
    it('should block fork bomb', () => {
      const result = checker.isCommandBlocked(':(){ :|:& };:');
      
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('Fork bomb');
    });

    it('should block deletion of root directory', () => {
      const result = checker.isCommandBlocked('rm -rf /');
      
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('root directory');
    });

    it('should block deletion of home directory', () => {
      const result = checker.isCommandBlocked('rm -rf ~');
      
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('home directory');
    });

    it('should block direct disk writes', () => {
      const result = checker.isCommandBlocked('echo "data" > /dev/sda');
      
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('disk');
    });

    it('should not block safe commands', () => {
      expect(checker.isCommandBlocked('ls -la').blocked).toBe(false);
      expect(checker.isCommandBlocked('rm -rf /tmp/safe').blocked).toBe(false);
      expect(checker.isCommandBlocked('pnpm test').blocked).toBe(false);
    });
  });

  describe('suggestSaferAlternative', () => {
    it('should suggest git stash instead of reset --hard', () => {
      const suggestion = checker.suggestSaferAlternative('git reset --hard');
      
      expect(suggestion).toContain('git stash');
    });

    it('should suggest --force-with-lease instead of --force', () => {
      const suggestion = checker.suggestSaferAlternative('git push --force');
      
      expect(suggestion).toContain('--force-with-lease');
    });

    it('should suggest mv instead of rm -rf', () => {
      const suggestion = checker.suggestSaferAlternative('rm -rf /tmp/test');
      
      expect(suggestion).toContain('mv');
    });

    it('should suggest pnpm/bun for npm install', () => {
      const suggestion = checker.suggestSaferAlternative('npm install express');
      
      expect(suggestion).toContain('pnpm');
    });

    it('should return null for safe commands', () => {
      expect(checker.suggestSaferAlternative('ls -la')).toBeNull();
      expect(checker.suggestSaferAlternative('pnpm install')).toBeNull();
    });
  });

  describe('isSensitivePath', () => {
    it('should identify .env files as sensitive', () => {
      expect(checker.isSensitivePath('.env')).toBe(true);
      expect(checker.isSensitivePath('.env.local')).toBe(true);
      expect(checker.isSensitivePath('.env.production')).toBe(true);
    });

    it('should identify credentials files as sensitive', () => {
      expect(checker.isSensitivePath('credentials.json')).toBe(true);
      expect(checker.isSensitivePath('secrets.yaml')).toBe(true);
    });

    it('should identify SSH keys as sensitive', () => {
      expect(checker.isSensitivePath('.ssh/id_rsa')).toBe(true);
      expect(checker.isSensitivePath('id_ed25519')).toBe(true);
    });

    it('should not identify normal files as sensitive', () => {
      expect(checker.isSensitivePath('package.json')).toBe(false);
      expect(checker.isSensitivePath('src/index.ts')).toBe(false);
    });
  });

  describe('canDryRun', () => {
    it('should allow dry-run for file operations', () => {
      expect(checker.canDryRun('write_file')).toBe(true);
      expect(checker.canDryRun('edit_file')).toBe(true);
      expect(checker.canDryRun('delete_file')).toBe(true);
      expect(checker.canDryRun('move_file')).toBe(true);
    });

    it('should allow dry-run for git operations', () => {
      expect(checker.canDryRun('create_git_checkpoint')).toBe(true);
      expect(checker.canDryRun('revert_to_git_checkpoint')).toBe(true);
    });

    it('should not allow dry-run for read-only operations', () => {
      expect(checker.canDryRun('read_file')).toBe(false);
      expect(checker.canDryRun('list_directory')).toBe(false);
      expect(checker.canDryRun('get_git_status')).toBe(false);
    });
  });
});
