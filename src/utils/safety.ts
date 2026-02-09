/**
 * Safety utilities for classifying and managing risky operations
 */

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskAssessment {
  level: RiskLevel;
  reasons: string[];
  warnings: string[];
}

export class SafetyChecker {
  /**
   * Assess the risk level of a tool operation
   */
  assessToolRisk(toolName: string, params: any): RiskAssessment {
    const reasons: string[] = [];
    const warnings: string[] = [];
    let level: RiskLevel = 'low';

    switch (toolName) {
      case 'delete_file':
        level = 'high';
        reasons.push('Deletes files/directories permanently');
        warnings.push('Ensure backups exist before deletion');
        
        // Check if deleting important directories
        if (params.path) {
          const dangerousPaths = [
            'node_modules',
            '.git',
            'dist',
            'build',
            'src',
            '/',
            '~',
          ];
          
          for (const dangerous of dangerousPaths) {
            if (params.path.includes(dangerous)) {
              level = 'high';
              warnings.push(`Deleting ${dangerous} directory - HIGH RISK`);
            }
          }
        }
        break;

      case 'write_file':
        // Writing is generally safe but can overwrite
        if (params.path) {
          // Check for important files
          const importantFiles = [
            'package.json',
            'tsconfig.json',
            '.gitignore',
            'README.md',
            '.env',
          ];

          if (importantFiles.some(f => params.path.endsWith(f))) {
            level = 'medium';
            reasons.push('Modifying important configuration file');
            warnings.push('Verify changes to avoid breaking the project');
          }
        }
        break;

      case 'edit_file':
      case 'edit_lines':
      case 'insert_at_line':
        level = 'low';
        reasons.push('File edits are backed up automatically');
        break;

      case 'move_file':
        level = 'medium';
        reasons.push('Moving files can break imports and references');
        warnings.push('Update imports after moving files');
        break;

      case 'run_command':
        level = this.assessCommandRisk(params.command);
        
        if (level === 'high') {
          reasons.push('Command can make irreversible changes');
        }
        break;

      case 'create_git_checkpoint':
        level = 'low';
        reasons.push('Creates a safe restore point');
        break;

      case 'revert_to_git_checkpoint':
        level = 'high';
        reasons.push('Reverts code changes');
        warnings.push('Ensure correct checkpoint before reverting');
        
        if (!params.confirm) {
          warnings.push('Requires explicit confirmation');
        }
        break;

      case 'revert_file':
        level = 'medium';
        reasons.push('Reverts file to previous version');
        warnings.push('Verify backup index before reverting');
        break;

      default:
        level = 'low';
    }

    return { level, reasons, warnings };
  }

  /**
   * Assess the risk level of a shell command
   */
  assessCommandRisk(command: string): RiskLevel {
    const cmd = command.toLowerCase().trim();

    // High-risk commands
    const highRiskPatterns = [
      /rm\s+-rf/,
      /git\s+reset\s+--hard/,
      /git\s+push\s+--force/,
      /git\s+push\s+-f/,
      /dd\s+if=/,
      /mkfs/,
      /format/,
      /:\(\)\{.*\}/,  // Fork bomb pattern
      /chmod\s+777/,
      /chown\s+-R/,
      /sudo\s+rm/,
      /> \/dev\//,
      /curl.*\|\s*(bash|sh)/,
      /wget.*\|\s*(bash|sh)/,
    ];

    for (const pattern of highRiskPatterns) {
      if (pattern.test(cmd)) {
        return 'high';
      }
    }

    // Medium-risk commands
    const mediumRiskPatterns = [
      /git\s+push/,
      /npm\s+publish/,
      /rm\s+/,
      /git\s+reset/,
      /git\s+rebase/,
      /git\s+merge/,
      /docker\s+rm/,
      /docker\s+rmi/,
      /kill\s+-9/,
      /pkill/,
    ];

    for (const pattern of mediumRiskPatterns) {
      if (pattern.test(cmd)) {
        return 'medium';
      }
    }

    return 'low';
  }

  /**
   * Check if a command should be blocked entirely
   */
  isCommandBlocked(command: string): { blocked: boolean; reason?: string } {
    const cmd = command.toLowerCase().trim();

    // Block extremely dangerous commands
    const blockedPatterns = [
      { pattern: /:\(\)\{.*\}/, reason: 'Fork bomb detected' },
      { pattern: /rm\s+-rf\s+\/($|\s)/, reason: 'Attempting to delete root directory' },
      { pattern: /rm\s+-rf\s+~($|\s)/, reason: 'Attempting to delete home directory' },
      { pattern: /> \/dev\/sda/, reason: 'Attempting to write directly to disk' },
      { pattern: /mkfs/, reason: 'Attempting to format filesystem' },
    ];

    for (const { pattern, reason } of blockedPatterns) {
      if (pattern.test(cmd)) {
        return { blocked: true, reason };
      }
    }

    return { blocked: false };
  }

  /**
   * Suggest safer alternatives for risky commands
   */
  suggestSaferAlternative(command: string): string | null {
    const cmd = command.toLowerCase().trim();

    if (cmd.includes('git reset --hard')) {
      return 'Use "git stash" to save changes, then "git stash drop" if you really want to discard them';
    }

    if (cmd.includes('git push --force') || cmd.includes('git push -f')) {
      return 'Use "git push --force-with-lease" to avoid overwriting others\' work';
    }

    if (cmd.match(/rm\s+-rf/)) {
      return 'Consider using "mv" to move files to a temporary location first';
    }

    if (cmd.includes('npm install') && !cmd.includes('-g')) {
      return 'Consider using "pnpm install" or "bun install" for faster, more efficient installs';
    }

    return null;
  }

  /**
   * Check if a file path is sensitive
   */
  isSensitivePath(filepath: string): boolean {
    const sensitive = [
      '.env',
      '.env.local',
      '.env.production',
      'credentials.json',
      'secrets.yaml',
      'private.key',
      '.ssh/',
      'id_rsa',
      'id_ed25519',
    ];

    return sensitive.some(pattern => filepath.includes(pattern));
  }

  /**
   * Validate dry-run compatibility for a tool
   */
  canDryRun(toolName: string): boolean {
    const dryRunnable = [
      'write_file',
      'edit_file',
      'edit_lines',
      'insert_at_line',
      'delete_file',
      'move_file',
      'create_directory',
      'create_git_checkpoint',
      'revert_to_git_checkpoint',
      'revert_file',
    ];

    return dryRunnable.includes(toolName);
  }
}
