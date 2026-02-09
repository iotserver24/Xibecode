import chalk from 'chalk';
import ora, { Ora } from 'ora';

// ─── Theme ──────────────────────────────────────────────────────
const T = {
  primary:  chalk.cyan,
  accent:   chalk.hex('#7C3AED'),   // purple accent
  text:     chalk.white,
  dim:      chalk.gray,
  dimBold:  chalk.gray.bold,
  success:  chalk.green,
  error:    chalk.red,
  warn:     chalk.yellow,
  tool:     chalk.magenta,
  user:     chalk.green.bold,
  assistant: chalk.cyan.bold,
  bold:     chalk.bold.white,
  border:   chalk.gray,
};

const BOX_WIDTH = 58;

// ─── UI Class ───────────────────────────────────────────────────
export class EnhancedUI {
  private spinner: Ora | null = null;
  private verbose: boolean;
  private startTime: number = 0;
  private isStreaming = false;
  private streamLineLen = 0;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  // ─── Header ───────────────────────────────────────────
  header(version: string = '1.0.0') {
    console.log('');
    const title = '  ✦  XibeCode';
    const ver = `v${version}  `;
    const pad = BOX_WIDTH - title.length - ver.length;
    const subtitle = '     AI-Powered Coding Assistant';
    const subPad = BOX_WIDTH - subtitle.length;

    console.log(T.primary('  ╭' + '─'.repeat(BOX_WIDTH) + '╮'));
    console.log(T.primary('  │') + T.bold(title) + ' '.repeat(Math.max(pad, 1)) + T.dim(ver) + T.primary('│'));
    console.log(T.primary('  │') + T.dim(subtitle) + ' '.repeat(Math.max(subPad, 1)) + T.primary('│'));
    console.log(T.primary('  ╰' + '─'.repeat(BOX_WIDTH) + '╯'));
    console.log('');
  }

  // ─── Model / endpoint info ────────────────────────────
  modelInfo(model: string, endpoint?: string) {
    console.log(T.dim('  Model     ') + T.text(model));
    if (endpoint) {
      const host = endpoint.replace(/^https?:\/\//, '');
      console.log(T.dim('  Endpoint  ') + T.text(host));
    }
    console.log('');
  }

  // ─── Chat banner ─────────────────────────────────────
  chatBanner() {
    console.log(T.dim('  Commands: ') + T.text('exit') + T.dim(' · ') + T.text('clear') + T.dim(' · ') + T.text('tools on/off'));
    console.log('');
    this.divider();
  }

  // ─── Session info (run mode) ──────────────────────────
  startSession(task: string, config: { model: string; maxIterations: number }) {
    this.startTime = Date.now();
    console.log(T.bold('  Task'));
    const taskLines = this.wrapText(task, BOX_WIDTH - 4);
    taskLines.forEach(l => console.log(T.text('  ' + l)));
    console.log('');
    console.log(T.dim('  Model        ') + T.text(config.model));
    console.log(T.dim('  Iterations   ') + T.text(String(config.maxIterations)));
    console.log('');
    this.divider();
  }

  // ─── Iteration ────────────────────────────────────────
  iteration(current: number, total: number) {
    if (this.verbose) {
      const pct = Math.floor((current / total) * 100);
      const elapsed = this.getElapsed();
      console.log('');
      console.log(T.dim(`  ── Iteration ${current}/${total} (${pct}%) · ${elapsed}`));
    }
  }

  // ─── Thinking spinner ────────────────────────────────
  thinking(message?: string) {
    if (this.spinner) this.spinner.stop();
    // Big, obvious \"AI is working\" indicator using an animated spinner.
    this.spinner = ora({
      text: T.dim(message || 'Thinking...'),
      color: 'cyan',
      spinner: 'dots',
      prefixText: ' ',
    }).start();
  }

  updateThinking(message: string) {
    if (this.spinner) this.spinner.text = T.dim(message);
  }

  // ─── Streaming ────────────────────────────────────────
  startAssistantResponse() {
    this.stopSpinner();
    this.isStreaming = true;
    this.streamLineLen = 0;
    console.log('');
    console.log('  ' + T.assistant('◆ Assistant'));
  }

  streamText(text: string) {
    // Indent first line if this is the beginning
    if (this.streamLineLen === 0) {
      process.stdout.write('    ');
    }

    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        process.stdout.write('\n    '); // indent continuation lines
        this.streamLineLen = 0;
      }
      process.stdout.write(T.text(lines[i]));
      this.streamLineLen += lines[i].length;
    }
  }

  endAssistantResponse() {
    if (this.isStreaming) {
      process.stdout.write('\n');
      console.log('');
    }
    this.isStreaming = false;
    this.streamLineLen = 0;
  }

  // ─── Non-streaming response ───────────────────────────
  response(text: string) {
    this.stopSpinner();
    console.log('');
    console.log('  ' + T.assistant('◆ Assistant'));

    const lines = text.split('\n');
    lines.forEach(line => {
      console.log('    ' + T.text(line));
    });
    console.log('');
  }

  // ─── Tool call ────────────────────────────────────────
  toolCall(toolName: string, input: any, _index?: number) {
    this.stopSpinner();

    const icon = this.getToolIcon(toolName);
    const summary = this.summarizeInput(toolName, input);
    const summaryStr = summary ? T.dim(' ' + summary) : '';

    console.log('    ' + T.dim('┌ ') + icon + ' ' + T.tool(toolName) + summaryStr);

    if (this.verbose && input) {
      const inputStr = JSON.stringify(input, null, 2);
      const lines = inputStr.split('\n').slice(0, 20);
      lines.forEach(line => {
        console.log('    ' + T.dim('│ ') + T.dim(line));
      });
    }
  }

  // ─── Tool result ──────────────────────────────────────
  toolResult(toolName: string, result: any, success: boolean = true) {
    const icon = success ? T.success('✓') : T.error('✗');
    const summary = this.summarizeResult(toolName, result);
    const summaryStr = summary ? ' ' + summary : '';

    console.log('    ' + T.dim('└ ') + icon + T.dim(summaryStr));

    if (!success && result) {
      const msg = typeof result === 'string' ? result : (result.message || JSON.stringify(result));
      const lines = msg.split('\n').slice(0, 5);
      lines.forEach((line: string) => {
        console.log('      ' + T.error(line));
      });
    }

    if (this.verbose && success && result) {
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      const lines = resultStr.split('\n');
      const maxLines = 30;
      const display = lines.slice(0, maxLines);
      display.forEach(line => {
        console.log('      ' + T.dim(line));
      });
      if (lines.length > maxLines) {
        console.log('      ' + T.dim(`... ${lines.length - maxLines} more lines`));
      }
    }
  }

  // ─── Diff ─────────────────────────────────────────────
  showDiff(diff: string, file: string) {
    if (!this.verbose) return;
    console.log('');
    console.log('    ' + T.bold(`Changes: ${file}`));
    const lines = diff.split('\n').slice(0, 40);
    lines.forEach(line => {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        console.log('    ' + T.success(line));
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        console.log('    ' + T.error(line));
      } else if (line.startsWith('@@')) {
        console.log('    ' + T.primary(line));
      } else {
        console.log('    ' + T.dim(line));
      }
    });
  }

  // ─── File change ──────────────────────────────────────
  fileChanged(action: 'created' | 'modified' | 'deleted', filePath: string, details?: string) {
    const icons = { created: T.success('+'), modified: T.warn('~'), deleted: T.error('-') };
    const colors = { created: T.success, modified: T.warn, deleted: T.error };
    console.log('    ' + icons[action] + ' ' + colors[action](filePath) + (details ? T.dim(` (${details})`) : ''));
  }

  // ─── Status messages ─────────────────────────────────
  error(message: string, error?: any) {
    this.stopSpinner();
    console.log('');
    console.log('  ' + T.error('✗ Error: ') + T.error(message));
    if (error && this.verbose) {
      console.log('    ' + T.dim(error.stack || error.message || error));
    }
    console.log('');
  }

  warning(message: string) {
    console.log('  ' + T.warn('⚠ ') + T.warn(message));
  }

  info(message: string) {
    console.log('  ' + T.primary('ℹ ') + T.text(message));
  }

  success(message: string) {
    console.log('  ' + T.success('✓ ') + T.text(message));
  }

  // ─── Completion summary ───────────────────────────────
  completionSummary(stats: {
    iterations: number;
    duration: number;
    filesChanged: number;
    toolCalls: number;
  }) {
    this.stopSpinner();

    const elapsed = this.formatDuration(stats.duration);

    console.log('');
    console.log('  ' + T.dim('═'.repeat(BOX_WIDTH)));
    console.log('');
    console.log('  ' + T.success.bold('✓ Done'));
    console.log('');
    console.log(
      '  ' + T.dim('Iterations ') + T.text(String(stats.iterations)) +
      T.dim(' · Tools ') + T.text(String(stats.toolCalls)) +
      T.dim(' · Files ') + T.text(String(stats.filesChanged)) +
      T.dim(' · ') + T.text(elapsed)
    );
    console.log('');
    console.log('  ' + T.dim('═'.repeat(BOX_WIDTH)));
    console.log('');
  }

  failureSummary(errorMsg: string, stats: { iterations: number; duration: number }) {
    this.stopSpinner();

    console.log('');
    console.log('  ' + T.dim('═'.repeat(BOX_WIDTH)));
    console.log('');
    console.log('  ' + T.error.bold('✗ Failed'));
    console.log('  ' + T.error(errorMsg));
    console.log('');
    console.log(
      '  ' + T.dim('Iterations ') + T.text(String(stats.iterations)) +
      T.dim(' · ') + T.text(this.formatDuration(stats.duration))
    );
    console.log('');
    console.log('  ' + T.dim('═'.repeat(BOX_WIDTH)));
    console.log('');
  }

  // ─── Utilities ────────────────────────────────────────
  stopSpinner(success?: boolean, text?: string) {
    if (!this.spinner) return;
    if (success !== undefined) {
      success ? this.spinner.succeed(text) : this.spinner.fail(text);
    } else {
      this.spinner.stop();
    }
    this.spinner = null;
  }

  divider() {
    console.log('  ' + T.dim('─'.repeat(BOX_WIDTH)));
    console.log('');
  }

  clear() {
    console.clear();
  }

  // ─── Private helpers ──────────────────────────────────
  private getToolIcon(toolName: string): string {
    const icons: Record<string, string> = {
      read_file: '📖',
      read_multiple_files: '📚',
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
      insert_at_line: '➕',
    };
    return icons[toolName] || '🔧';
  }

  private summarizeInput(toolName: string, input: any): string | null {
    if (!input) return null;
    switch (toolName) {
      case 'read_file':
        return input.start_line
          ? `${input.path} (${input.start_line}-${input.end_line})`
          : input.path || null;
      case 'read_multiple_files':
        return Array.isArray(input.paths) ? `${input.paths.length} files` : null;
      case 'write_file':
      case 'edit_file':
      case 'edit_lines':
        return input.path || null;
      case 'run_command':
        return input.command ? (input.command.length > 50 ? input.command.slice(0, 47) + '...' : input.command) : null;
      case 'search_files':
        return input.pattern || null;
      case 'list_directory':
        return input.path || '.';
      default:
        return null;
    }
  }

  private summarizeResult(toolName: string, result: any): string | null {
    if (!result) return null;
    if (result.error || result.success === false) {
      return result.message || 'Failed';
    }
    switch (toolName) {
      case 'read_file':
        return result.lines !== undefined ? `${result.lines} lines` : null;
      case 'read_multiple_files':
        return result.files ? `${result.files.length} files read` : null;
      case 'write_file':
        return result.lines ? `${result.lines} lines written` : 'Written';
      case 'edit_file':
        return result.linesChanged ? `${result.linesChanged} lines changed` : 'Edited';
      case 'run_command':
        return result.success ? 'OK' : 'Failed';
      case 'search_files':
        return `${result.count ?? 0} matches`;
      case 'list_directory':
        return `${result.count ?? 0} items`;
      default:
        return 'OK';
    }
  }

  private formatDuration(ms: number): string {
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `${m}m ${rs.toFixed(0)}s`;
  }

  private getElapsed(): string {
    if (!this.startTime) return '0s';
    return this.formatDuration(Date.now() - this.startTime);
  }

  private wrapText(text: string, width: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      if (current.length + word.length + 1 > width) {
        lines.push(current);
        current = word;
      } else {
        current = current ? current + ' ' + word : word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }
}
