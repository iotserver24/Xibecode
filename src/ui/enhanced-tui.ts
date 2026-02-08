import chalk from 'chalk';
import ora, { Ora } from 'ora';
import stripAnsi from 'strip-ansi';

export interface ProgressState {
  step: number;
  totalSteps: number;
  currentTask: string;
  status: 'running' | 'success' | 'error' | 'warning';
}

export class EnhancedUI {
  private spinner: Ora | null = null;
  private verbose: boolean;
  private currentStep: number = 0;
  private totalSteps: number = 0;
  private startTime: number = 0;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  /**
   * Show app header
   */
  header(version: string = '1.0.0') {
    console.log('');
    console.log(chalk.cyan.bold('╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan.bold('║') + chalk.white.bold('                 XibeCode AI Agent                        ') + chalk.cyan.bold('║'));
    console.log(chalk.cyan.bold('║') + chalk.gray(`              Autonomous Coding Assistant v${version.padEnd(10)}      `) + chalk.cyan.bold('║'));
    console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════╝'));
    console.log('');
  }

  /**
   * Start session with task info
   */
  startSession(task: string, config: { model: string; maxIterations: number }) {
    this.startTime = Date.now();
    console.log(chalk.bold.white('📋 Task:'));
    console.log(chalk.white('  ' + task));
    console.log('');
    console.log(chalk.gray('⚙️  Configuration:'));
    console.log(chalk.gray(`   Model: ${config.model}`));
    console.log(chalk.gray(`   Max Iterations: ${config.maxIterations}`));
    console.log('');
    this.divider();
  }

  /**
   * Show iteration progress
   */
  iteration(current: number, total: number) {
    this.currentStep = current;
    this.totalSteps = total;
    
    const percentage = Math.floor((current / total) * 100);
    const barLength = 30;
    const filledLength = Math.floor((barLength * current) / total);
    const emptyLength = barLength - filledLength;
    
    const bar = chalk.cyan('█'.repeat(filledLength)) + chalk.gray('░'.repeat(emptyLength));
    const elapsed = this.getElapsed();
    
    console.log('');
    console.log(chalk.bold.white(`Iteration ${current}/${total}`) + chalk.gray(` (${percentage}%) - ${elapsed}`));
    console.log(bar);
  }

  /**
   * Show AI thinking with streaming text
   */
  thinking(message?: string) {
    if (this.spinner) {
      this.spinner.stop();
    }
    
    const text = message || 'AI is thinking...';
    this.spinner = ora({
      text: chalk.cyan(text),
      color: 'cyan',
      spinner: 'dots',
    }).start();
  }

  /**
   * Update thinking message (for streaming)
   */
  updateThinking(message: string) {
    if (this.spinner) {
      this.spinner.text = chalk.cyan(message);
    }
  }

  /**
   * Show tool execution
   */
  toolCall(toolName: string, input: any, index?: number) {
    this.stopSpinner();
    
    const icon = this.getToolIcon(toolName);
    const indexStr = index !== undefined ? chalk.gray(`[${index}] `) : '';
    
    console.log('');
    console.log(indexStr + icon + chalk.magenta.bold(` ${toolName}`));
    
    if (this.verbose) {
      const inputStr = JSON.stringify(input, null, 2);
      const lines = inputStr.split('\n');
      console.log(chalk.gray('┌─ Input:'));
      lines.forEach(line => {
        console.log(chalk.gray('│ ') + chalk.gray(line));
      });
      console.log(chalk.gray('└─'));
    } else {
      // Show condensed input
      const summary = this.summarizeInput(toolName, input);
      if (summary) {
        console.log(chalk.gray('  → ' + summary));
      }
    }
  }

  /**
   * Show tool result
   */
  toolResult(toolName: string, result: any, success: boolean = true) {
    const icon = success ? chalk.green('✓') : chalk.red('✗');
    const status = success ? chalk.green('Success') : chalk.red('Failed');
    
    console.log(icon + ' ' + status);
    
    if (this.verbose || !success) {
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      const lines = resultStr.split('\n');
      
      // Limit output for large results
      const maxLines = this.verbose ? 50 : 10;
      const displayLines = lines.slice(0, maxLines);
      const hasMore = lines.length > maxLines;
      
      console.log(chalk.gray('┌─ Result:'));
      displayLines.forEach(line => {
        console.log(chalk.gray('│ ') + (success ? chalk.white(line) : chalk.red(line)));
      });
      
      if (hasMore) {
        console.log(chalk.gray('│ ') + chalk.gray(`... (${lines.length - maxLines} more lines)`));
      }
      console.log(chalk.gray('└─'));
    } else {
      // Show condensed result
      const summary = this.summarizeResult(toolName, result);
      if (summary) {
        console.log(chalk.gray('  ← ' + summary));
      }
    }
  }

  /**
   * Show AI response/message
   */
  response(text: string, isStreaming: boolean = false) {
    this.stopSpinner();
    
    if (!isStreaming) {
      console.log('');
      console.log(chalk.cyan('💬 ') + chalk.bold.white('Assistant:'));
      console.log('');
    }
    
    // Format the text nicely
    const lines = text.split('\n');
    lines.forEach(line => {
      console.log(chalk.white('  ' + line));
    });
    
    if (!isStreaming) {
      console.log('');
    }
  }

  /**
   * Stream AI response character by character
   */
  streamResponse(chunk: string) {
    process.stdout.write(chalk.white(chunk));
  }

  /**
   * Show code diff
   */
  showDiff(diff: string, file: string) {
    console.log('');
    console.log(chalk.bold.white(`📝 Changes to ${file}:`));
    console.log('');
    
    const lines = diff.split('\n');
    lines.forEach(line => {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        console.log(chalk.green(line));
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        console.log(chalk.red(line));
      } else if (line.startsWith('@@')) {
        console.log(chalk.cyan(line));
      } else {
        console.log(chalk.gray(line));
      }
    });
    console.log('');
  }

  /**
   * Show file created/modified
   */
  fileChanged(action: 'created' | 'modified' | 'deleted', path: string, details?: string) {
    const icons = {
      created: chalk.green('✚'),
      modified: chalk.yellow('✎'),
      deleted: chalk.red('✖'),
    };
    
    const colors = {
      created: chalk.green,
      modified: chalk.yellow,
      deleted: chalk.red,
    };
    
    console.log(icons[action] + ' ' + colors[action](path) + (details ? chalk.gray(` (${details})`) : ''));
  }

  /**
   * Show error
   */
  error(message: string, error?: any) {
    this.stopSpinner(false);
    console.log('');
    console.log(chalk.red.bold('✗ Error: ') + chalk.red(message));
    
    if (error && this.verbose) {
      console.log('');
      console.log(chalk.gray(error.stack || error.message || error));
    }
    console.log('');
  }

  /**
   * Show warning
   */
  warning(message: string) {
    console.log(chalk.yellow('⚠ Warning: ') + chalk.yellow(message));
  }

  /**
   * Show info
   */
  info(message: string) {
    console.log(chalk.blue('ℹ ') + chalk.white(message));
  }

  /**
   * Show success
   */
  success(message: string) {
    console.log(chalk.green('✓ ') + chalk.white(message));
  }

  /**
   * Show completion summary
   */
  completionSummary(stats: {
    iterations: number;
    duration: number;
    filesChanged: number;
    toolCalls: number;
  }) {
    this.stopSpinner(true);
    
    console.log('');
    this.divider('═');
    console.log('');
    console.log(chalk.bold.green('✓ Task Completed Successfully!'));
    console.log('');
    
    const elapsed = this.formatDuration(stats.duration);
    const avgPerIteration = this.formatDuration(stats.duration / stats.iterations);
    
    console.log(chalk.white('📊 Summary:'));
    console.log('');
    console.log(chalk.gray('  Iterations:      ') + chalk.white(stats.iterations));
    console.log(chalk.gray('  Tool Calls:      ') + chalk.white(stats.toolCalls));
    console.log(chalk.gray('  Files Changed:   ') + chalk.white(stats.filesChanged));
    console.log(chalk.gray('  Total Time:      ') + chalk.white(elapsed));
    console.log(chalk.gray('  Avg/Iteration:   ') + chalk.white(avgPerIteration));
    console.log('');
    this.divider('═');
    console.log('');
  }

  /**
   * Show failure summary
   */
  failureSummary(error: string, stats: { iterations: number; duration: number }) {
    this.stopSpinner(false);
    
    console.log('');
    this.divider('═');
    console.log('');
    console.log(chalk.bold.red('✗ Task Failed'));
    console.log('');
    console.log(chalk.red('Error: ' + error));
    console.log('');
    console.log(chalk.gray('Iterations completed: ') + chalk.white(stats.iterations));
    console.log(chalk.gray('Time elapsed: ') + chalk.white(this.formatDuration(stats.duration)));
    console.log('');
    this.divider('═');
    console.log('');
  }

  /**
   * Stop spinner
   */
  stopSpinner(success?: boolean, text?: string) {
    if (this.spinner) {
      if (success !== undefined) {
        if (success) {
          this.spinner.succeed(text);
        } else {
          this.spinner.fail(text);
        }
      } else {
        this.spinner.stop();
      }
      this.spinner = null;
    }
  }

  /**
   * Divider line
   */
  divider(char: string = '─') {
    console.log(chalk.gray(char.repeat(60)));
  }

  /**
   * Clear screen
   */
  clear() {
    console.clear();
  }

  /**
   * Get tool icon
   */
  private getToolIcon(toolName: string): string {
    const icons: Record<string, string> = {
      read_file: '📖',
      write_file: '📝',
      edit_file: '✏️',
      edit_lines: '✂️',
      delete_file: '🗑️',
      run_command: '⚡',
      search_files: '🔍',
      list_directory: '📁',
      create_directory: '📂',
      move_file: '↔️',
      get_context: '🧠',
      revert_file: '↩️',
    };
    
    return icons[toolName] || '🔧';
  }

  /**
   * Summarize tool input for compact display
   */
  private summarizeInput(toolName: string, input: any): string | null {
    switch (toolName) {
      case 'read_file':
        return input.start_line 
          ? `${input.path} (lines ${input.start_line}-${input.end_line})`
          : input.path;
      case 'write_file':
      case 'edit_file':
        return `${input.path}`;
      case 'run_command':
        return input.command;
      case 'search_files':
        return input.pattern;
      default:
        return null;
    }
  }

  /**
   * Summarize tool result for compact display
   */
  private summarizeResult(toolName: string, result: any): string | null {
    if (result.success === false) {
      return chalk.red(result.message || 'Failed');
    }
    
    switch (toolName) {
      case 'read_file':
        return `${result.lines} lines`;
      case 'write_file':
        return `${result.lines} lines written`;
      case 'edit_file':
        return result.linesChanged ? `${result.linesChanged} lines changed` : 'Edited';
      case 'run_command':
        return result.success ? 'Command executed' : chalk.red('Command failed');
      case 'search_files':
        return `${result.count} files found`;
      case 'list_directory':
        return `${result.count} items`;
      default:
        return null;
    }
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(ms: number): string {
    const seconds = ms / 1000;
    if (seconds < 60) {
      return `${seconds.toFixed(2)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
  }

  /**
   * Get elapsed time since session start
   */
  private getElapsed(): string {
    if (!this.startTime) return '0s';
    return this.formatDuration(Date.now() - this.startTime);
  }
}
