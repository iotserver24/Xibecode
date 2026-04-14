import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { formatRunSwarmDetailLines, formatToolOutcome } from '../utils/tool-display.js';
import { getTheme, type ThemeName, type ThemeTokens } from './themes.js';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { version: VERSION } = require('../../package.json');

const W = 62; // box width

// ─── Helpers ────────────────────────────────────────────────────
function pad(str: string, len: number): string {
  const raw = str.replace(/\u001b\[[0-9;]*m/g, ''); // strip ANSI
  return str + ' '.repeat(Math.max(0, len - raw.length));
}

// ─── UI Class ───────────────────────────────────────────────────
export class EnhancedUI {
  private spinner: Ora | null = null;
  private verbose: boolean;
  private showDetails: boolean;
  private showThinking: boolean;
  private condensedUI: boolean;
  private themeName: ThemeName;
  private T: ThemeTokens;
  private startTime: number = 0;
  private isStreaming = false;
  private streamLineLen = 0;
  private toolCount = 0;

  constructor(verbose: boolean = false, themeName: ThemeName = 'default') {
    this.verbose = verbose;
    this.showDetails = verbose;
    this.showThinking = true;
    // Keep current behavior by default; chat can toggle this at runtime.
    this.condensedUI = false;
    this.themeName = themeName;
    this.T = getTheme(themeName);
  }

  setCondensedUI(condensed: boolean) {
    this.condensedUI = condensed;
    if (condensed) this.stopSpinner();
  }

  getCondensedUI(): boolean {
    return this.condensedUI;
  }

  setTheme(themeName: ThemeName) {
    this.themeName = themeName;
    this.T = getTheme(themeName);
  }

  getThemeName(): ThemeName {
    return this.themeName;
  }

  setShowDetails(show: boolean) {
    this.showDetails = show;
  }

  getShowDetails(): boolean {
    return this.showDetails;
  }

  setShowThinking(show: boolean) {
    this.showThinking = show;
    if (!show) this.stopSpinner();
  }

  getShowThinking(): boolean {
    return this.showThinking;
  }

  // ─── Status bar ─────────────────────────────────────────

  renderStatusBar(info: {
    model: string;
    sessionTitle?: string;
    cwd?: string;
    toolsEnabled?: boolean;
    themeName?: string;
    mode?: string;
    activeSkill?: string | null;
  }) {
    const left = info.cwd ? this.T.muted(info.cwd) : '';
    const session = info.sessionTitle ? `session: ${info.sessionTitle}` : '';
    const model = `model: ${info.model}`;
    const tools = info.toolsEnabled === undefined ? '' : `tools: ${info.toolsEnabled ? 'on' : 'off'}`;
    const theme = info.themeName ? `theme: ${info.themeName}` : '';
    const mode = info.mode ? `mode: ${info.mode}` : '';
    const skill = info.activeSkill ? `skill: ${info.activeSkill}` : '';

    const line1Parts = [model, mode, skill, session].filter(Boolean);
    const line2Parts = [tools, theme].filter(Boolean);

    console.log('  ' + this.line('─'));
    if (left) {
      console.log('  ' + left);
    }
    if (line1Parts.length) {
      console.log('  ' + this.T.dim(line1Parts.join('  |  ')));
    }
    if (line2Parts.length) {
      console.log('  ' + this.T.dim(line2Parts.join('  |  ')));
    }
    console.log('');
  }

  private line(ch = '─') { return this.T.border(ch.repeat(W)); }
  private thinLine() { return this.T.muted('·'.repeat(W)); }

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
    console.log('  ' + this.T.dim('AI-powered autonomous coding assistant') + this.T.muted(`  ·  v${v}`));
    console.log('');
  }

  // ─── Model / endpoint info ────────────────────────────
  modelInfo(model: string, endpoint?: string) {
    const host = endpoint ? endpoint.replace(/^https?:\/\//, '') : 'api.anthropic.com';
    console.log('  ' + this.T.dim('  model') + '     ' + this.T.text(model));
    console.log('  ' + this.T.dim('  endpoint') + '  ' + this.T.text(host));
    console.log('  ' + this.T.dim('  version') + '   ' + this.T.muted(`v${VERSION}`));
    console.log('');
  }

  // ─── Chat banner (tips + input bar + status) ─────────
  chatBanner(cwd: string, model: string, endpoint?: string) {
    console.log('  ' + this.T.bold('Tips for getting started:'));
    console.log('  ' + this.T.text('1. Ask questions, edit files, or run commands.'));
    console.log('  ' + this.T.text('2. Be specific for the best results.'));
    console.log('  ' + this.T.text('3. Use ') + this.T.code('@path/to/file') + this.T.text(' to send files.'));
    console.log('  ' + this.T.text('4. Type ') + this.T.code('/help') + this.T.text(' for more information.'));
    console.log('');

    const label = '> Type your message or @path/to/file';
    const boxWidth = Math.max(label.length + 2, 56);
    const innerPad = boxWidth - label.length - 1;

    console.log('  ' + this.T.border('┌' + '─'.repeat(boxWidth) + '┐'));
    console.log('  ' + this.T.border('│') + ' ' + this.T.text(label) + ' '.repeat(innerPad) + this.T.border('│'));
    console.log('  ' + this.T.border('└' + '─'.repeat(boxWidth) + '┘'));
    console.log('');

    const host = endpoint ? endpoint.replace(/^https?:\/\//, '') : 'no sandbox (see /docs)';
    const left = this.T.muted(cwd || '~');
    const mid = this.T.muted('no sandbox (see /docs)');
    const right = this.T.muted(model);

    console.log('  ' + left);
    console.log('  ' + mid + '    ' + right);
    console.log('');
  }

  // ─── Session info (run mode) ──────────────────────────
  startSession(task: string, config: { model: string; maxIterations: number; dryRun?: boolean; gitStatus?: any }) {
    this.startTime = Date.now();
    console.log('  ' + this.T.dimBold('TASK'));
    const taskLines = this.wrapText(task, W - 6);
    taskLines.forEach(l => console.log('  ' + this.T.text('  ' + l)));
    console.log('');
    console.log('  ' + this.T.dim('  model') + '       ' + this.T.text(config.model));
    console.log('  ' + this.T.dim('  iterations') + '  ' + this.T.text(isFinite(config.maxIterations) ? String(config.maxIterations) : 'unlimited'));

    if (config.dryRun) {
      console.log('  ' + this.T.dim('  mode') + '        ' + this.T.info('DRY RUN (no changes will be made)'));
    }

    if (config.gitStatus && config.gitStatus.isGitRepo) {
      this.gitStatus(config.gitStatus);
    }

    console.log('');
    console.log('  ' + this.line());
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
      console.log('  ' + this.T.muted(`── ${label} · ${elapsed} ──`));
    }
  }

  // ─── Thinking spinner ────────────────────────────────
  thinking(message?: string) {
    if (!this.showThinking) return;
    if (this.spinner) this.spinner.stop();
    this.spinner = ora({
      text: this.T.brandDim(message || 'Thinking...'),
      color: 'cyan',
      spinner: 'dots12',
      prefixText: '  ',
    }).start();
  }

  updateThinking(message: string) {
    if (!this.showThinking) return;
    if (this.spinner) this.spinner.text = this.T.brandDim(message);
  }

  // ─── Streaming ────────────────────────────────────────
  startAssistantResponse(persona?: { name: string; color: string }) {
    this.stopSpinner();
    this.isStreaming = true;
    this.streamLineLen = 0;

    if (persona) {
      const tagColor = persona.color || '#00D4FF';
      process.stdout.write('  ' + chalk.bgHex(tagColor).black(` ${persona.name} `) + ' ');
      console.log(chalk.hex(tagColor)('◆'));
    } else {
      console.log('  ' + this.T.assistant('◆ XibeCode'));
    }
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
      process.stdout.write(this.T.text(lines[i]));
      this.streamLineLen += lines[i].length;
    }
  }

  endAssistantResponse() {
    if (this.isStreaming) {
      process.stdout.write('\n');
    }
    this.isStreaming = false;
    this.streamLineLen = 0;
  }

  // ─── Non-streaming response ───────────────────────────
  response(text: string, persona?: { name: string; color: string }) {
    this.stopSpinner();

    if (persona) {
      const tagColor = persona.color || '#00D4FF';
      process.stdout.write('  ' + chalk.bgHex(tagColor).black(` ${persona.name} `) + ' ');
      console.log(chalk.hex(tagColor)('◆'));
    } else {
      console.log('  ' + this.T.assistant('◆ XibeCode'));
    }

    const lines = text.split('\n');
    lines.forEach(line => {
      console.log('    ' + this.T.text(line));
    });
  }

  // ─── Tool call ────────────────────────────────────────
  toolCall(toolName: string, input: any, _index?: number) {
    if (this.condensedUI) {
      // Even in condensed mode, stop the spinner so it doesn't keep spinning
      // while tools run.
      this.stopSpinner();
      return;
    }
    this.stopSpinner();
    this.toolCount++;

    const icon = this.getToolIcon(toolName);
    const summary = this.summarizeInput(toolName, input);
    const label = this.T.tool(toolName);
    const detail = summary ? ' ' + this.T.code(summary) : '';

    console.log('    ' + this.T.border('╭─') + ' ' + icon + '  ' + label + detail);

    if (this.showDetails && input) {
      const inputStr = JSON.stringify(input, null, 2);
      const lines = inputStr.split('\n').slice(0, 20);
      lines.forEach(line => {
        console.log('    ' + this.T.border('│') + '  ' + this.T.dim(line));
      });
    }
  }

  // ─── Tool result ──────────────────────────────────────
  toolResult(toolName: string, result: any, success: boolean = true) {
    if (this.condensedUI && success) {
      // Tools already ran; in condensed mode we suppress success spam but
      // keep UI cleanup consistent.
      this.stopSpinner();
      return;
    }
    const icon = success ? this.T.success('✔') : this.T.error('✘');
    const summary = this.summarizeResult(toolName, result);
    const summaryStr = summary ? '  ' + this.T.dim(summary) : '';
    const elapsed = this.getElapsed();

    console.log('    ' + this.T.border('╰─') + ' ' + icon + summaryStr + this.T.muted('  ' + elapsed));

    if (success && toolName === 'run_swarm' && result && typeof result === 'object') {
      for (const line of formatRunSwarmDetailLines(result)) {
        console.log('    ' + this.T.border('│') + '  ' + this.T.dim(line));
      }
    }

    if (!success && result) {
      const msg = typeof result === 'string' ? result : (result.message || JSON.stringify(result));
      const lines = msg.split('\n').slice(0, 5);
      lines.forEach((line: string) => {
        console.log('       ' + this.T.error(line));
      });
    }

    if (this.showDetails && success && result) {
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      const lines = resultStr.split('\n');
      const maxLines = 30;
      const display = lines.slice(0, maxLines);
      display.forEach(line => {
        console.log('       ' + this.T.dim(line));
      });
      if (lines.length > maxLines) {
        console.log('       ' + this.T.dim(`... ${lines.length - maxLines} more lines`));
      }
    }
  }

  // ─── Diff ─────────────────────────────────────────────
  showDiff(
    diff: string,
    file: string,
    opts?: { maxLines?: number; maxHunks?: number }
  ) {
    const rawLines = diff.split('\n');

    // Simple summary from the diff excerpt.
    const insertions = rawLines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
    const deletions = rawLines.filter(l => l.startsWith('-') && !l.startsWith('---')).length;
    const hunks = rawLines.filter(l => l.startsWith('@@')).length;

    const maxHunks = opts?.maxHunks ?? (this.condensedUI ? 2 : 4);
    const maxLines = opts?.maxLines ?? (this.condensedUI ? 35 : 70);

    console.log('    ' + this.T.bold(`changes: ${file}`) + this.T.dim(`  (+${insertions} -${deletions})  hunks:${hunks}`));

    let hunksRendered = 0;
    let renderedLines = 0;
    let truncated = false;

    for (const line of rawLines) {
      // Stop once we rendered enough hunks/lines; keep output readable.
      if (hunksRendered >= maxHunks || renderedLines >= maxLines) {
        truncated = true;
        break;
      }

      if (line.startsWith('@@')) hunksRendered++;

      // Skip noisy diff headers; still keep context and change markers.
      if (line.startsWith('diff --git') || line.startsWith('index ') || line === '\\ No newline at end of file') {
        continue;
      }

      renderedLines++;

      if (line.startsWith('+') && !line.startsWith('+++')) {
        console.log('    ' + this.T.success(line));
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        console.log('    ' + this.T.error(line));
      } else if (line.startsWith('@@')) {
        console.log('    ' + this.T.info(line));
      } else {
        console.log('    ' + this.T.dim(line));
      }
    }

    if (truncated) {
      console.log('    ' + this.T.dim(`... truncated (showing first ${renderedLines} lines)`));
    }
  }

  // ─── File change ──────────────────────────────────────
  fileChanged(action: 'created' | 'modified' | 'deleted', filePath: string, details?: string) {
    const icons = { created: this.T.success('+ new'), modified: this.T.warn('~ mod'), deleted: this.T.error('- del') };
    const colors = { created: this.T.success, modified: this.T.warn, deleted: this.T.error };
    console.log('       ' + icons[action] + ' ' + colors[action](filePath) + (details ? this.T.dim(` (${details})`) : ''));
  }

  // ─── Status messages ─────────────────────────────────
  error(message: string, error?: any) {
    this.stopSpinner();
    console.log('  ' + this.T.error('  ✘ ') + chalk.redBright.bold('Error: ') + this.T.text(message));
    if (error && this.showDetails) {
      console.log('    ' + this.T.dim(error.stack || error.message || error));
    }
  }

  warning(message: string) {
    console.log('  ' + this.T.warn('  ⚠ ') + this.T.text(message));
  }

  info(message: string) {
    console.log('  ' + this.T.info('  ℹ ') + this.T.text(message));
  }

  success(message: string) {
    console.log('  ' + this.T.success('  ✔ ') + this.T.text(message));
  }

  // ─── Safety & Risk ────────────────────────────────────
  safetyWarning(level: 'low' | 'medium' | 'high', message: string, warnings: string[] = []) {
    const icons = {
      low: this.T.info('  ℹ '),
      medium: this.T.warn('  ⚠ '),
      high: this.T.error('  ⚠ '),
    };
    const labels = {
      low: this.T.info('Low Risk'),
      medium: this.T.warn('Medium Risk'),
      high: this.T.error('HIGH RISK'),
    };

    console.log('  ' + icons[level] + labels[level] + ': ' + this.T.text(message));

    if (warnings.length > 0) {
      warnings.forEach(w => {
        console.log('       ' + this.T.dim('• ' + w));
      });
    }
  }

  dryRunIndicator(message: string) {
    console.log('       ' + this.T.info('[DRY RUN]') + ' ' + this.T.dim(message));
  }

  // ─── Improved Diff Summary ────────────────────────────
  diffSummary(files: Array<{ path: string; insertions: number; deletions: number }>) {
    if (files.length === 0) return;

    const totalInsertions = files.reduce((sum, f) => sum + f.insertions, 0);
    const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

    console.log('    ' + this.T.bold(`Changes: ${files.length} file(s)`));
    console.log('       ' + this.T.success(`+${totalInsertions}`) + ' ' + this.T.error(`-${totalDeletions}`));

    if (this.showDetails) {
      files.slice(0, 10).forEach(f => {
        const stats = this.T.success(`+${f.insertions}`) + ' ' + this.T.error(`-${f.deletions}`);
        console.log('       ' + stats + ' ' + this.T.text(f.path));
      });

      if (files.length > 10) {
        console.log('       ' + this.T.dim(`... and ${files.length - 10} more files`));
      }
    }
  }

  // ─── Git Status ───────────────────────────────────────
  gitStatus(status: {
    branch?: string;
    isClean?: boolean;
    staged?: string[];
    unstaged?: string[];
    untracked?: string[];
  }) {
    const parts: string[] = [];

    if (status.branch) {
      parts.push(this.T.info(`branch: ${status.branch}`));
    }

    if (status.isClean) {
      parts.push(this.T.success('clean'));
    } else {
      const counts = [];
      if (status.staged && status.staged.length > 0) {
        counts.push(this.T.success(`${status.staged.length} staged`));
      }
      if (status.unstaged && status.unstaged.length > 0) {
        counts.push(this.T.warn(`${status.unstaged.length} unstaged`));
      }
      if (status.untracked && status.untracked.length > 0) {
        counts.push(this.T.dim(`${status.untracked.length} untracked`));
      }
      if (counts.length > 0) {
        parts.push(counts.join(', '));
      }
    }

    if (parts.length > 0) {
      console.log('    ' + this.T.dim('git: ') + parts.join(' | '));
    }
  }

  // ─── Test Results ─────────────────────────────────────
  testResults(results: {
    success: boolean;
    runner?: string;
    testsRun?: number;
    testsPassed?: number;
    testsFailed?: number;
    duration?: number;
  }) {
    const icon = results.success ? this.T.success('✔') : this.T.error('✘');
    const status = results.success ? this.T.success('PASS') : this.T.error('FAIL');

    console.log('    ' + icon + ' ' + status);

    if (results.runner) {
      console.log('       ' + this.T.dim(`runner: ${results.runner}`));
    }

    if (results.testsRun !== undefined) {
      const passed = results.testsPassed || 0;
      const failed = results.testsFailed || 0;
      console.log('       ' + this.T.success(`${passed} passed`) + ' ' + (failed > 0 ? this.T.error(`${failed} failed`) : ''));
    }

    if (results.duration) {
      const seconds = (results.duration / 1000).toFixed(2);
      console.log('       ' + this.T.dim(`duration: ${seconds}s`));
    }
  }

  // ─── Completion summary ───────────────────────────────
  completionSummary(stats: {
    iterations: number;
    duration: number;
    filesChanged: number;
    toolCalls: number;
    costLabel?: string;
  }) {
    this.stopSpinner();
    const elapsed = this.formatDuration(stats.duration);
    const costLabel = stats.costLabel ? `cost ${stats.costLabel}` : undefined;

    console.log('  ' + this.T.border('╭' + '─'.repeat(W) + '╮'));
    console.log('  ' + this.T.border('│') + pad('  ' + chalk.greenBright.bold('✔ Task Complete'), W) + this.T.border('│'));
    console.log('  ' + this.T.border('│') + '                                                              ' + this.T.border('│'));
    console.log('  ' + this.T.border('│') + pad(
      '  ' + this.T.dim('iterations ') + this.T.text(String(stats.iterations)) +
      this.T.dim('  ·  tools ') + this.T.text(String(stats.toolCalls)) +
      this.T.dim('  ·  files ') + this.T.text(String(stats.filesChanged)) +
      this.T.dim('  ·  ') + this.T.text(elapsed), W
    ) + this.T.border('│'));
    if (costLabel) {
      console.log('  ' + this.T.border('│') + pad('  ' + this.T.dim(costLabel), W) + this.T.border('│'));
    }
    console.log('  ' + this.T.border('│') + '                                                              ' + this.T.border('│'));
    console.log('  ' + this.T.border('╰' + '─'.repeat(W) + '╯'));
  }

  failureSummary(errorMsg: string, stats: { iterations: number; duration: number }) {
    this.stopSpinner();
    console.log('  ' + this.T.border('╭' + '─'.repeat(W) + '╮'));
    console.log('  ' + this.T.border('│') + pad('  ' + chalk.redBright.bold('✘ Task Failed'), W) + this.T.border('│'));
    console.log('  ' + this.T.border('│') + pad('  ' + this.T.dim(errorMsg.slice(0, W - 4)), W) + this.T.border('│'));
    console.log('  ' + this.T.border('│') + pad(
      '  ' + this.T.dim('iterations ') + this.T.text(String(stats.iterations)) +
      this.T.dim('  ·  ') + this.T.text(this.formatDuration(stats.duration)), W
    ) + this.T.border('│'));
    console.log('  ' + this.T.border('╰' + '─'.repeat(W) + '╯'));
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
    console.log('  ' + this.line());
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
      verified_edit: '✅',
      grep_code: '🔍',
      web_search: '🌐',
      fetch_url: '📄',
      update_memory: '🧠',
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
      case 'grep_code':
        return input.pattern ? `"${input.pattern}"${input.path ? ` in ${input.path}` : ''}` : null;
      case 'web_search':
        return input.query ? `"${input.query}"` : null;
      case 'fetch_url':
        return input.url ? (input.url.length > 50 ? input.url.slice(0, 47) + '...' : input.url) : null;
      case 'update_memory':
        return 'saving to memory';
      case 'verified_edit':
        return input.path || null;
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
      case 'grep_code':
        return result.match_count !== undefined ? `${result.match_count} match${result.match_count === 1 ? '' : 'es'}` : 'done';
      case 'web_search':
        return result.results ? `${result.results.length} result${result.results.length === 1 ? '' : 's'}` : 'done';
      case 'fetch_url':
        return result.content ? `${(result.content.length / 1024).toFixed(1)}KB` : 'fetched';
      case 'update_memory':
        return 'saved';
      case 'verified_edit':
        return result.linesChanged ? `${result.linesChanged} lines changed` : 'edited';
      case 'run_swarm':
        return formatToolOutcome(
          'run_swarm',
          result,
          !result.error && result.success !== false,
        );
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
