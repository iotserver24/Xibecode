import chalk from 'chalk';
import ora, { Ora } from 'ora';

// ─── Version ────────────────────────────────────────────────────
const VERSION = '1.0.0';

// ─── Theme (Gemini CLI / OpenCode inspired) ─────────────────────
const T = {
  // Brand
  brand:    chalk.hex('#00D4FF').bold, // bright cyan brand
  brandDim: chalk.hex('#0099BB'),
  // UI chrome
  border:   chalk.hex('#3A3A4A'),      // subtle dark border
  panel:    chalk.hex('#555577'),       // panel accents
  // Content
  text:     chalk.white,
  dim:      chalk.hex('#6B6B7B'),
  dimBold:  chalk.hex('#8888AA').bold,
  muted:    chalk.hex('#4A4A5A'),
  // Semantic
  success:  chalk.hex('#00E676'),       // vivid green
  error:    chalk.hex('#FF5252'),       // vivid red
  warn:     chalk.hex('#FFD740'),       // amber
  info:     chalk.hex('#40C4FF'),       // light blue
  // Roles
  tool:     chalk.hex('#BB86FC'),       // purple (material)
  toolDim:  chalk.hex('#7B5EA7'),
  user:     chalk.hex('#00E676').bold,
  assistant: chalk.hex('#00D4FF').bold,
  // Emphasis
  bold:     chalk.bold.white,
  code:     chalk.hex('#CE93D8'),       // light purple for paths
};

const W = 62; // box width

// ─── Helpers ────────────────────────────────────────────────────
function pad(str: string, len: number): string {
  const raw = str.replace(/\u001b\[[0-9;]*m/g, ''); // strip ANSI
  return str + ' '.repeat(Math.max(0, len - raw.length));
}

function line(ch = '─') { return T.border(ch.repeat(W)); }
function thinLine() { return T.muted('·'.repeat(W)); }

// ─── UI Class ───────────────────────────────────────────────────
export class EnhancedUI {
  private spinner: Ora | null = null;
  private verbose: boolean;
  private startTime: number = 0;
  private isStreaming = false;
  private streamLineLen = 0;
  private toolCount = 0;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  // ─── Header (XibeCode hero) ───────────────────────────
  header(_version: string = VERSION) {
    const v = VERSION;
    console.log('');

    // Gemini-style gradient logo (user-provided)
    const logoLines = [
      '██╗  ██╗██╗██████╗ ███████╗ ██████╗ ██████╗ ██████╗ ███████╗',
      '╚██╗██╔╝██║██╔══██╗██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔════╝',
      ' ╚███╔╝ ██║██████╔╝█████╗  ██║     ██║   ██║██║  ██║█████╗  ',
      ' ██╔██╗ ██║██╔══██╗██╔══╝  ██║     ██║   ██║██╔══██╗██╔══╝  ',
      '██╔╝ ██╗██║██████╔╝███████╗╚██████╗╚██████╔╝██████╔╝███████╗',
      '╚═╝  ╚═╝╚═╝╚═════╝ ╚══════╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝',
    ];

    function printGradient(lines: string[]) {
      // Gemini colors: Blue (89, 149, 235) to Pink (224, 108, 117)
      const start = { r: 89, g: 149, b: 235 };
      const end = { r: 224, g: 108, b: 117 };

      lines.forEach(line => {
        let coloredLine = '';
        const len = line.length;

        for (let i = 0; i < len; i++) {
          const ratio = i / len;
          const r = Math.floor(start.r + (end.r - start.r) * ratio);
          const g = Math.floor(start.g + (end.g - start.g) * ratio);
          const b = Math.floor(start.b + (end.b - start.b) * ratio);

          coloredLine += `\x1b[38;2;${r};${g};${b}m${line[i]}`;
        }
        console.log('  ' + coloredLine + '\x1b[0m');
      });
    }

    printGradient(logoLines);

    console.log('');
    console.log('  ' + chalk.hex('#00D4FF').bold('XibeCode'));
    console.log('  ' + T.dim('AI-powered autonomous coding assistant') + T.muted(`  ·  v${v}`));
    console.log('');
  }

  // ─── Model / endpoint info ────────────────────────────
  modelInfo(model: string, endpoint?: string) {
    const host = endpoint ? endpoint.replace(/^https?:\/\//, '') : 'api.anthropic.com';
    console.log('  ' + T.dim('  model') + '     ' + T.text(model));
    console.log('  ' + T.dim('  endpoint') + '  ' + T.text(host));
    console.log('  ' + T.dim('  version') + '   ' + T.muted(`v${VERSION}`));
    console.log('');
  }

  // ─── Chat banner (tips + input bar + status) ─────────
  chatBanner(cwd: string, model: string, endpoint?: string) {
    console.log('  ' + T.bold('Tips for getting started:'));
    console.log('  ' + T.text('1. Ask questions, edit files, or run commands.'));
    console.log('  ' + T.text('2. Be specific for the best results.'));
    console.log('  ' + T.text('3. Use ') + T.code('@path/to/file') + T.text(' to send files.'));
    console.log('  ' + T.text('4. Type ') + T.code('/help') + T.text(' for more information.'));
    console.log('');

    const label = '> Type your message or @path/to/file';
    const boxWidth = Math.max(label.length + 2, 56);
    const innerPad = boxWidth - label.length - 1;

    console.log('  ' + T.border('┌' + '─'.repeat(boxWidth) + '┐'));
    console.log('  ' + T.border('│') + ' ' + T.text(label) + ' '.repeat(innerPad) + T.border('│'));
    console.log('  ' + T.border('└' + '─'.repeat(boxWidth) + '┘'));
    console.log('');

    const host = endpoint ? endpoint.replace(/^https?:\/\//, '') : 'no sandbox (see /docs)';
    const left = T.muted(cwd || '~');
    const mid = T.muted('no sandbox (see /docs)');
    const right = T.muted(model);

    console.log('  ' + left);
    console.log('  ' + mid + '    ' + right);
    console.log('');
  }

  // ─── Session info (run mode) ──────────────────────────
  startSession(task: string, config: { model: string; maxIterations: number }) {
    this.startTime = Date.now();
    console.log('  ' + T.dimBold('TASK'));
    const taskLines = this.wrapText(task, W - 6);
    taskLines.forEach(l => console.log('  ' + T.text('  ' + l)));
    console.log('');
    console.log('  ' + T.dim('  model') + '       ' + T.text(config.model));
    console.log('  ' + T.dim('  iterations') + '  ' + T.text(isFinite(config.maxIterations) ? String(config.maxIterations) : 'unlimited'));
    console.log('');
    console.log('  ' + line());
    console.log('');
  }

  // ─── Iteration ────────────────────────────────────────
  iteration(current: number, total: number) {
    if (this.verbose) {
      const elapsed = this.getElapsed();
      const label = isFinite(total)
        ? `step ${current}/${total}`
        : `step ${current}`;
      console.log('');
      console.log('  ' + T.muted(`── ${label} · ${elapsed} ──`));
    }
  }

  // ─── Thinking spinner ────────────────────────────────
  thinking(message?: string) {
    if (this.spinner) this.spinner.stop();
    this.spinner = ora({
      text: T.brandDim(message || 'Thinking...'),
      color: 'cyan',
      spinner: 'dots12',
      prefixText: '  ',
    }).start();
  }

  updateThinking(message: string) {
    if (this.spinner) this.spinner.text = T.brandDim(message);
  }

  // ─── Streaming ────────────────────────────────────────
  startAssistantResponse() {
    this.stopSpinner();
    this.isStreaming = true;
    this.streamLineLen = 0;
    console.log('');
    console.log('  ' + T.assistant('◆ XibeCode'));
    console.log('');
  }

  streamText(text: string) {
    if (this.streamLineLen === 0) {
      process.stdout.write('    ');
    }
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        process.stdout.write('\n    ');
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
    console.log('  ' + T.assistant('◆ XibeCode'));
    console.log('');
    const lines = text.split('\n');
    lines.forEach(line => {
      console.log('    ' + T.text(line));
    });
    console.log('');
  }

  // ─── Tool call ────────────────────────────────────────
  toolCall(toolName: string, input: any, _index?: number) {
    this.stopSpinner();
    this.toolCount++;

    const icon = this.getToolIcon(toolName);
    const summary = this.summarizeInput(toolName, input);
    const label = T.tool(toolName);
    const detail = summary ? ' ' + T.code(summary) : '';

    console.log('');
    console.log('    ' + T.border('╭─') + ' ' + icon + '  ' + label + detail);

    if (this.verbose && input) {
      const inputStr = JSON.stringify(input, null, 2);
      const lines = inputStr.split('\n').slice(0, 20);
      lines.forEach(line => {
        console.log('    ' + T.border('│') + '  ' + T.dim(line));
      });
    }
  }

  // ─── Tool result ──────────────────────────────────────
  toolResult(toolName: string, result: any, success: boolean = true) {
    const icon = success ? T.success('✔') : T.error('✘');
    const summary = this.summarizeResult(toolName, result);
    const summaryStr = summary ? '  ' + T.dim(summary) : '';
    const elapsed = this.getElapsed();

    console.log('    ' + T.border('╰─') + ' ' + icon + summaryStr + T.muted('  ' + elapsed));

    if (!success && result) {
      const msg = typeof result === 'string' ? result : (result.message || JSON.stringify(result));
      const lines = msg.split('\n').slice(0, 5);
      lines.forEach((line: string) => {
        console.log('       ' + T.error(line));
      });
    }

    if (this.verbose && success && result) {
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      const lines = resultStr.split('\n');
      const maxLines = 30;
      const display = lines.slice(0, maxLines);
      display.forEach(line => {
        console.log('       ' + T.dim(line));
      });
      if (lines.length > maxLines) {
        console.log('       ' + T.dim(`... ${lines.length - maxLines} more lines`));
      }
    }
  }

  // ─── Diff ─────────────────────────────────────────────
  showDiff(diff: string, file: string) {
    if (!this.verbose) return;
    console.log('');
    console.log('    ' + T.bold(`changes: ${file}`));
    const lines = diff.split('\n').slice(0, 40);
    lines.forEach(line => {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        console.log('    ' + T.success(line));
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        console.log('    ' + T.error(line));
      } else if (line.startsWith('@@')) {
        console.log('    ' + T.info(line));
      } else {
        console.log('    ' + T.dim(line));
      }
    });
  }

  // ─── File change ──────────────────────────────────────
  fileChanged(action: 'created' | 'modified' | 'deleted', filePath: string, details?: string) {
    const icons = { created: T.success('+ new'), modified: T.warn('~ mod'), deleted: T.error('- del') };
    const colors = { created: T.success, modified: T.warn, deleted: T.error };
    console.log('       ' + icons[action] + ' ' + colors[action](filePath) + (details ? T.dim(` (${details})`) : ''));
  }

  // ─── Status messages ─────────────────────────────────
  error(message: string, error?: any) {
    this.stopSpinner();
    console.log('');
    console.log('  ' + T.error('  ✘ ') + T.error.bold('Error: ') + T.text(message));
    if (error && this.verbose) {
      console.log('    ' + T.dim(error.stack || error.message || error));
    }
    console.log('');
  }

  warning(message: string) {
    console.log('  ' + T.warn('  ⚠ ') + T.text(message));
  }

  info(message: string) {
    console.log('  ' + T.info('  ℹ ') + T.text(message));
  }

  success(message: string) {
    console.log('  ' + T.success('  ✔ ') + T.text(message));
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
    console.log('  ' + T.border('╭' + '─'.repeat(W) + '╮'));
    console.log('  ' + T.border('│') + pad('  ' + T.success.bold('✔ Task Complete'), W) + T.border('│'));
    console.log('  ' + T.border('│') + '                                                              ' + T.border('│'));
    console.log('  ' + T.border('│') + pad(
      '  ' + T.dim('iterations ') + T.text(String(stats.iterations)) +
      T.dim('  ·  tools ') + T.text(String(stats.toolCalls)) +
      T.dim('  ·  files ') + T.text(String(stats.filesChanged)) +
      T.dim('  ·  ') + T.text(elapsed), W
    ) + T.border('│'));
    console.log('  ' + T.border('│') + '                                                              ' + T.border('│'));
    console.log('  ' + T.border('╰' + '─'.repeat(W) + '╯'));
    console.log('');
  }

  failureSummary(errorMsg: string, stats: { iterations: number; duration: number }) {
    this.stopSpinner();
    console.log('');
    console.log('  ' + T.border('╭' + '─'.repeat(W) + '╮'));
    console.log('  ' + T.border('│') + pad('  ' + T.error.bold('✘ Task Failed'), W) + T.border('│'));
    console.log('  ' + T.border('│') + pad('  ' + T.dim(errorMsg.slice(0, W - 4)), W) + T.border('│'));
    console.log('  ' + T.border('│') + pad(
      '  ' + T.dim('iterations ') + T.text(String(stats.iterations)) +
      T.dim('  ·  ') + T.text(this.formatDuration(stats.duration)), W
    ) + T.border('│'));
    console.log('  ' + T.border('╰' + '─'.repeat(W) + '╯'));
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
    console.log('  ' + line());
    console.log('');
  }

  clear() {
    console.clear();
  }

  // ─── Private helpers ──────────────────────────────────
  private getToolIcon(toolName: string): string {
    const icons: Record<string, string> = {
      read_file: '📄',
      read_multiple_files: '📚',
      write_file: '✍️ ',
      edit_file: '✏️ ',
      edit_lines: '🔧',
      delete_file: '🗑️ ',
      run_command: '⚡',
      search_files: '🔎',
      list_directory: '📂',
      create_directory: '📁',
      move_file: '📦',
      get_context: '🧠',
      revert_file: '↩️ ',
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
        return input.command ? (input.command.length > 45 ? input.command.slice(0, 42) + '...' : input.command) : null;
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
      return result.message || 'failed';
    }
    switch (toolName) {
      case 'read_file':
        return result.lines !== undefined ? `${result.lines} lines` : null;
      case 'read_multiple_files':
        return result.files ? `${result.files.length} files read` : null;
      case 'write_file':
        return result.lines ? `${result.lines} lines written` : 'written';
      case 'edit_file':
        return result.linesChanged ? `${result.linesChanged} lines changed` : 'edited';
      case 'run_command':
        return result.success ? 'ok' : 'failed';
      case 'search_files':
        return `${result.count ?? 0} matches`;
      case 'list_directory':
        return `${result.count ?? 0} items`;
      default:
        return 'ok';
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
