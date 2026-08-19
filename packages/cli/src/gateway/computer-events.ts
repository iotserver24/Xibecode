/**
 * Structured Computer pane events (view-only terminal + agent-browser).
 * Parse tool name/input into a tab + overlay the Flutter app can render
 * without re-parsing command strings.
 */

import { redactSecrets } from '../utils/xibecode-home.js';

export const COMPUTER_COMMAND_MAX = 400;
export const COMPUTER_STDOUT_MAX = 4000;

export type ComputerTab = 'terminal' | 'browser';
export type ComputerKind = 'shell' | 'browser' | 'file' | 'other' | 'focus';
export type ComputerAction =
  | 'open'
  | 'click'
  | 'fill'
  | 'type'
  | 'screenshot'
  | 'snapshot'
  | 'scroll'
  | 'press'
  | 'hover'
  | 'wait'
  | 'close'
  | 'show'
  | 'other';

export type ComputerPayload = {
  tab: ComputerTab;
  kind: ComputerKind;
  name: string;
  state: 'start' | 'done';
  command?: string;
  action?: ComputerAction;
  target?: string;
  url?: string;
  label: string;
  stdout?: string;
  exitCode?: number;
  success?: boolean;
  /** When true the app switches the Computer pane to `tab`. */
  focus?: boolean;
};

const FILE_TOOLS = new Set([
  'read_file',
  'write_file',
  'edit_file',
  'str_replace',
  'list_directory',
  'list_dir',
  'search_files',
  'grep_code',
  'glob_search',
]);

const SHELL_TOOLS = new Set(['run_command', 'shell_command']);

const BROWSER_TOOLS = new Set(['take_screenshot', 'preview_app', 'preview_url']);

const BROWSER_ACTIONS = new Set<ComputerAction>([
  'open',
  'click',
  'fill',
  'type',
  'screenshot',
  'snapshot',
  'scroll',
  'press',
  'hover',
  'wait',
  'close',
  'show',
]);

export function capText(value: string, max: number): string {
  const t = value.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)) + '…';
}

export function extractCommand(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const rec = input as Record<string, unknown>;
  const raw = rec.command ?? rec.cmd;
  if (typeof raw !== 'string') return undefined;
  const cleaned = redactSecrets(raw.replace(/\n/g, ' ')).trim();
  if (!cleaned) return undefined;
  return capText(cleaned, COMPUTER_COMMAND_MAX);
}

/** Strip common wrappers so `pnpm exec agent-browser click @e2` still parses. */
export function unwrapBrowserCli(command: string): string | null {
  const trimmed = command.trim();
  const m =
    /(?:^|[;&|]\s*)(?:(?:sudo|env)\s+(?:[A-Z_][A-Z0-9_]*=\S+\s+)*)?(?:(?:pnpm|npm|npx|bunx|yarn)\s+(?:dlx\s+|exec\s+)?)?(?:agent-browser)\b(.*)$/i.exec(
      trimmed,
    );
  if (!m) return null;
  return `agent-browser${m[1] || ''}`;
}

function unquote(token: string): string {
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return token.slice(1, -1);
  }
  return token;
}

function tokenize(rest: string): string[] {
  const out: string[] = [];
  const re = /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest))) {
    out.push(unquote(m[0]));
  }
  return out;
}

function hostLabel(url: string): string {
  try {
    const u = new URL(url.includes('://') ? url : `https://${url}`);
    return u.host + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    return url;
  }
}

export function parseAgentBrowserCommand(command: string): {
  action: ComputerAction;
  target?: string;
  url?: string;
  label: string;
} | null {
  const unwrapped = unwrapBrowserCli(command);
  if (!unwrapped) return null;
  const rest = unwrapped.replace(/^agent-browser\s*/i, '').trim();
  const tokens = tokenize(rest).filter((t) => t && !t.startsWith('-'));
  const verb = (tokens[0] || 'open').toLowerCase();
  const action: ComputerAction = BROWSER_ACTIONS.has(verb as ComputerAction)
    ? (verb as ComputerAction)
    : verb === 'goto' || verb === 'navigate'
      ? 'open'
      : verb === 'key' || verb === 'keydown'
        ? 'press'
        : 'other';
  const arg1 = tokens[1];
  const arg2 = tokens[2];
  let target: string | undefined;
  let url: string | undefined;
  let label: string;

  if (action === 'open') {
    url = arg1;
    target = arg1;
    label = arg1 ? `Open ${hostLabel(arg1)}` : 'Open browser';
  } else if (action === 'click') {
    target = arg1;
    label = arg1 ? `Click ${arg1}` : 'Click';
  } else if (action === 'fill' || action === 'type') {
    target = arg1;
    const snippet = arg2 ? capText(arg2, 40) : '';
    label = target
      ? snippet
        ? `Type in ${target}`
        : `Fill ${target}`
      : 'Type';
  } else if (action === 'screenshot') {
    target = arg1;
    label = 'Screenshot';
  } else if (action === 'snapshot') {
    label = 'Snapshot page';
  } else if (action === 'scroll') {
    target = arg1;
    label = arg1 ? `Scroll ${arg1}` : 'Scroll';
  } else if (action === 'press') {
    target = arg1;
    label = arg1 ? `Press ${arg1}` : 'Press key';
  } else if (action === 'hover') {
    target = arg1;
    label = arg1 ? `Hover ${arg1}` : 'Hover';
  } else if (action === 'wait') {
    target = arg1;
    label = arg1 ? `Wait ${arg1}` : 'Wait';
  } else if (action === 'close') {
    label = 'Close browser';
  } else {
    target = arg1;
    label = verb ? `Browser ${verb}` : 'Browser';
  }

  return { action, target, url, label };
}

/**
 * Agent-chosen Computer pane. The app does not flip tabs on every shell
 * command — only when the model writes one of these lines.
 *
 *   Computer: browser
 *   Computer: terminal
 *   [computer:browser]
 */
export function parseComputerShow(text: string): ComputerTab | null {
  if (!text) return null;
  let last: ComputerTab | null = null;
  const re =
    /(?:^|\n)\s*(?:computer|show|watch)\s*[:\-]\s*(browser|terminal)\b|\[\s*computer\s*:\s*(browser|terminal)\s*\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = (m[1] || m[2] || '').toLowerCase();
    if (raw === 'browser' || raw === 'terminal') last = raw;
  }
  return last;
}

export function buildComputerFocusPayload(tab: ComputerTab): ComputerPayload {
  return {
    tab,
    kind: 'focus',
    name: 'show',
    state: 'start',
    action: 'show',
    label: tab === 'browser' ? 'Show browser' : 'Show terminal',
    focus: true,
  };
}

export function classifyToolKind(name: string, input?: unknown): ComputerKind {
  const n = String(name || '').toLowerCase();
  if (BROWSER_TOOLS.has(n)) return 'browser';
  if (FILE_TOOLS.has(n)) return 'file';
  if (SHELL_TOOLS.has(n)) {
    const cmd = extractCommand(input);
    if (cmd && unwrapBrowserCli(cmd)) return 'browser';
    return 'shell';
  }
  if (n.includes('screenshot') || n.includes('browser')) return 'browser';
  return 'other';
}

export function extractStdout(result: unknown): string | undefined {
  if (result == null) return undefined;
  if (typeof result === 'string') {
    const t = redactSecrets(result);
    return t.trim() ? capText(t, COMPUTER_STDOUT_MAX) : undefined;
  }
  if (typeof result !== 'object') return undefined;
  const rec = result as Record<string, unknown>;
  const raw =
    (typeof rec.stdout === 'string' && rec.stdout) ||
    (typeof rec.output === 'string' && rec.output) ||
    (typeof rec.message === 'string' && rec.message) ||
    (typeof rec.stderr === 'string' && rec.stderr) ||
    '';
  if (!raw.trim()) return undefined;
  return capText(redactSecrets(raw), COMPUTER_STDOUT_MAX);
}

export function extractExitCode(result: unknown): number | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const rec = result as Record<string, unknown>;
  const n = rec.exitCode ?? rec.exit_code ?? rec.code;
  if (typeof n === 'number' && Number.isFinite(n)) return n;
  if (typeof n === 'string' && n.trim() !== '' && Number.isFinite(Number(n))) {
    return Number(n);
  }
  return undefined;
}

export function buildComputerPayload(opts: {
  name: string;
  state: 'start' | 'done';
  input?: unknown;
  result?: unknown;
  success?: boolean;
}): ComputerPayload {
  const name = String(opts.name || 'tool');
  const kind = classifyToolKind(name, opts.input);
  const command = extractCommand(opts.input);
  const parsed = command ? parseAgentBrowserCommand(command) : null;
  const browserTool = kind === 'browser';
  const tab: ComputerTab = browserTool ? 'browser' : 'terminal';

  let action = parsed?.action;
  let target = parsed?.target;
  let url = parsed?.url;
  let label = parsed?.label;

  if (!label) {
    if (browserTool && /screenshot/i.test(name)) {
      action = action || 'screenshot';
      label = 'Screenshot';
    } else if (command) {
      label = capText(command, 80);
    } else {
      label = name.replace(/_/g, ' ');
    }
  }

  const stdout =
    opts.state === 'done' ? extractStdout(opts.result) : undefined;
  const exitCode =
    opts.state === 'done' ? extractExitCode(opts.result) : undefined;
  // Opening a page is the agent saying "watch the browser". Later clicks
  // and every shell command leave the current tab alone.
  const focus = Boolean(browserTool && parsed?.action === 'open' && opts.state === 'start');

  return {
    tab,
    kind,
    name,
    state: opts.state,
    command,
    action,
    target,
    url,
    label,
    stdout,
    exitCode,
    success: opts.state === 'done' ? opts.success !== false : undefined,
    focus,
  };
}
