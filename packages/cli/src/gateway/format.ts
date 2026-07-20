/**
 * Formatting helpers for coding-oriented chat replies.
 * Progress + approval copy is messaging-friendly (Telegram / Discord / Slack).
 */

import type { DangerousApprovalRequest } from 'xibecode-core';

/** Split long text for platform limits, preferring breaks at newlines / code fences. */
export function chunkForChat(text: string, max = 3900): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let rest = text;
  let part = 0;
  const totalHint = Math.ceil(text.length / max);
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.4) cut = rest.lastIndexOf(' ', max);
    if (cut < max * 0.4) cut = max;
    // Prefer not to split mid-fence
    const fence = rest.lastIndexOf('```', max);
    if (fence > max * 0.5 && fence > cut - 200) {
      const close = rest.indexOf('```', fence + 3);
      if (close > 0 && close < max + 200) cut = Math.min(close + 3, rest.length);
    }
    let piece = rest.slice(0, cut);
    // Hermes: never leave chunk marker on a fence line
    if (/```\s*$/.test(piece)) {
      piece = piece.replace(/\s*$/, '') + '\n';
    }
    part += 1;
    if (totalHint > 1) {
      piece = piece.replace(/\s*$/, '') + `\n(${part}/~${totalHint})`;
    }
    // If marker landed after fence, move it
    piece = piece.replace(/```\s*(\(\d+\/~\d+\))\s*$/m, '```\n$1');
    chunks.push(piece);
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  if (rest) {
    part += 1;
    let last = rest;
    if (totalHint > 1 && part > 1) {
      last = last.replace(/\s*$/, '') + `\n(${part}/~${totalHint})`;
    }
    last = last.replace(/```\s*(\(\d+\/~\d+\))\s*$/m, '```\n$1');
    chunks.push(last);
  }
  return chunks;
}

const TOOL_EMOJI: Record<string, string> = {
  run_command: '💻',
  read_file: '📖',
  read_multiple_files: '📚',
  write_file: '✍️',
  edit_file: '✏️',
  edit_lines: '✏️',
  insert_at_line: '✏️',
  verified_edit: '✏️',
  list_directory: '📂',
  search_files: '🔎',
  grep_code: '🔎',
  delete_file: '🗑️',
  move_file: '📦',
  create_directory: '📁',
  run_tests: '🧪',
  get_test_status: '🧪',
  get_git_status: '🌿',
  get_git_diff_summary: '🌿',
  get_git_changed_files: '🌿',
  create_git_checkpoint: '🔖',
  revert_to_git_checkpoint: '⏪',
  git_show_diff: '🌿',
  web_search: '🌐',
  fetch_url: '🌐',
  take_screenshot: '📸',
  preview_app: '📸',
  remember_lesson: '🧠',
  update_memory: '🧠',
  list_skills: '🧩',
  view_skill: '🧩',
  save_skill: '🧩',
  search_skills_sh: '🧩',
  install_skill_from_skills_sh: '🧩',
  delegate_subtask: '🐝',
  run_swarm: '🐝',
};

/**
 * Hermes-style short status lines (gateway/assets/status_phrases.yaml generic).
 * Plain text, no markdown — works the same on Telegram/Discord/Slack.
 */
const STATUS_PHRASES_GENERIC = [
  'on it',
  'one sec',
  'checking that now',
  'give me a sec',
  'looking into it',
  'working through it',
  'checking',
  'one moment',
  'taking a look',
  'got it, checking',
  'looking now',
  'sorting it',
  'one sec, working on it',
  'taking a proper look',
  'checking the details',
];

/** Long-running heartbeat (Hermes "status" surface). */
const STATUS_PHRASES_LONG = [
  'still on it',
  'still working through it',
  'still checking',
  'still making progress',
  'waiting for the result',
  'still processing this',
  'one sec, this is still going',
  'still here, checking',
  'still going, not frozen',
];

export function statusPhrase(seed = Date.now()): string {
  return STATUS_PHRASES_GENERIC[Math.abs(seed) % STATUS_PHRASES_GENERIC.length];
}

export function longRunningStatusPhrase(seed = Date.now()): string {
  return STATUS_PHRASES_LONG[Math.abs(seed) % STATUS_PHRASES_LONG.length];
}

/**
 * Hermes busy ack: short phrase only — no workdir, no checkmarks, no "Got it —".
 * workdirBasename kept for API compat; intentionally unused in the message.
 */
export function formatBusyAck(_workdirBasename?: string): string {
  return statusPhrase();
}

/** Progress bubble header (Hermes: phrase only, not "💻 Coding… dir · rigor"). */
export function formatProgressHeader(_workdirBasename?: string, _rigor?: string): string {
  return statusPhrase();
}

/** Compact tool call for progress lines (Hermes-style emoji + short preview). */
export function formatToolProgress(name: string, input?: any): string {
  const emoji = TOOL_EMOJI[name] || '⚙️';
  const detail = summarizeToolInput(name, input);
  if (name === 'run_command' && detail) {
    return `${emoji} running ${detail}`;
  }
  if (detail) return `${emoji} ${friendlyToolName(name)} ${detail}`;
  return `${emoji} ${friendlyToolName(name)}…`;
}

export function formatToolResult(name: string, success: boolean, preview?: string): string {
  const mark = success ? '✓' : '✗';
  const short = preview
    ? preview.replace(/\s+/g, ' ').slice(0, 80)
    : friendlyToolName(name);
  return success ? `${mark} ${short}` : `${mark} ${friendlyToolName(name)} failed${preview ? `: ${short}` : ''}`;
}

function friendlyToolName(name: string): string {
  return name.replace(/_/g, ' ');
}

function summarizeToolInput(name: string, input: any): string {
  if (!input || typeof input !== 'object') return '';
  const path =
    input.path ||
    input.file_path ||
    input.filePath ||
    input.target ||
    input.directory ||
    input.cwd;
  const cmd = input.command || input.cmd;
  if (typeof cmd === 'string') {
    const short = cmd.length > 100 ? cmd.slice(0, 97) + '…' : cmd;
    return `\`${short.replace(/\n/g, ' ')}\``;
  }
  if (typeof path === 'string') {
    const short = path.length > 100 ? '…' + path.slice(-97) : path;
    return `\`${short}\``;
  }
  if ((name.includes('search') || name === 'grep_code') && input.pattern) {
    return `\`${String(input.pattern).slice(0, 60)}\``;
  }
  return '';
}

/** Message body for dangerous-command approval (text fallback + buttons on Telegram). */
export function formatApprovalPrompt(req: DangerousApprovalRequest): string {
  const subject =
    typeof req.command === 'string'
      ? req.command
      : typeof req.path === 'string'
        ? `${req.toolName} ${req.path}`
        : req.toolName;
  const preview =
    subject.length > 1500 ? subject.slice(0, 1497) + '…' : subject;
  const lines = [
    '⚠️ **Approval required**',
    '',
    '```',
    preview,
    '```',
    '',
    `Reason: ${req.reason}`,
  ];
  if (req.warnings?.length) {
    lines.push('', ...req.warnings.slice(0, 3).map((w) => `• ${w}`));
  }
  lines.push(
    '',
    'Reply with one of:',
    '`/once` — allow this time',
    '`/session` — allow for this chat session',
    '`/always` — allow this pattern until restart',
    '`/deny` — block and continue',
    '',
    '_Or use the buttons below (Telegram)._',
  );
  return lines.join('\n');
}

/** Parse free-text / slash approval replies. */
export function parseApprovalReply(
  text: string,
): 'once' | 'session' | 'always' | 'deny' | null {
  const t = text.trim().toLowerCase();
  const bare = t.startsWith('/') ? t.slice(1) : t;
  const first = bare.split(/\s+/)[0] || '';

  if (
    first === 'once' ||
    first === 'approve' ||
    first === 'yes' ||
    first === 'y' ||
    first === 'allow' ||
    bare === 'approve once' ||
    bare === 'allow once'
  ) {
    return 'once';
  }
  if (first === 'session' || bare === 'approve session' || bare === 'allow session') {
    return 'session';
  }
  if (
    first === 'always' ||
    bare === 'approve always' ||
    bare === 'allow always' ||
    bare === 'always approve'
  ) {
    return 'always';
  }
  if (
    first === 'deny' ||
    first === 'no' ||
    first === 'n' ||
    first === 'cancel' ||
    first === 'reject'
  ) {
    return 'deny';
  }
  return null;
}

export function isSilent(text: string): boolean {
  const t = text.trim().toUpperCase();
  return t === '[SILENT]' || t === 'SILENT' || t === 'NO_REPLY' || t === 'NO REPLY';
}

export function wrapCron(text: string): string {
  return (
    `**Cron job result**\n` +
    `-------------\n\n` +
    `${text}\n\n` +
    `_Reply here to continue coding in this chat._`
  );
}

export type GatewayRigorLevel = 'yolo' | 'default' | 'strict';

/** Coding-focused system prefix for gateway chats (anti-hallucination discipline). */
export function codingSystemPrefix(
  workdir: string,
  rigor: GatewayRigorLevel = 'default',
): string {
  const lines = [
    'You are XibeCode running in a 24/7 messaging gateway for software engineering.',
    `Working directory: ${workdir}`,
    `Rigor level: ${rigor}`,
    '',
    '## Execution rules (anti-hallucination)',
    '- Never claim you ran a command, edited a file, or fixed a bug unless a tool result in this turn confirms it.',
    '- Prefer tools over speculation: read_file / list_directory / run_command before asserting facts about the repo.',
    '- If a tool fails, report the real error; do not invent success.',
    '- Long-lived processes (pnpm/npm run dev, vite, next dev, watchers): use run_command with background=true (auto if you forget). Then check_process / curl health — never wait on the server in the foreground.',
    '- After starting a server in background, report process_id and how to verify (URL/port). Use kill_process when done if you started it.',
    '- Use ask_user when you need a human decision (port, package manager, yes/no). Do not guess preferences.',
    '- When stuck repeating the same failing command, stop, explain what failed, and ask or try a different approach.',
    '- Keep replies scannable in chat: short summary first, then details / code blocks.',
    '- If a task is done, say what changed and how to verify. Avoid fluff.',
    '- Skills: use list_skills / view_skill for domain workflows (tests, debug, React, etc.) when relevant. Follow loaded skill steps with tools.',
    '',
    '## Media to the user (Telegram / messaging)',
    '- To send images, videos, or files to this chat, put a MEDIA tag on its own line in your **final** reply:',
    '  MEDIA:/absolute/or/workdir/path/to/file.png',
    '- Images (.png/.jpg/.webp/…) → photo; videos (.mp4/.webm/…) → video; other → document. Optional: [[as_document]] to force raw file upload (no photo recompress).',
    '- After you build or run a site (localhost), capture a screenshot with take_screenshot (url + path), then include the returned MEDIA: line so the user sees the page.',
    '- Example final reply:',
    '  Homepage is live at http://localhost:3000',
    '  MEDIA:/tmp/xibecode-shots/home.png',
  ];
  if (rigor !== 'yolo') {
    lines.push(
      '- High-risk shell commands (rm -rf, force push, sudo, publish, etc.) pause for user approval — wait; do not assume they ran.',
    );
  }
  if (rigor === 'strict') {
    lines.push(
      '- STRICT mode: after edits, re-read or run tests to prove the change. End with a concrete verification step you actually ran.',
    );
  }
  return lines.join('\n');
}

export function describeRigor(level: GatewayRigorLevel): string {
  switch (level) {
    case 'yolo':
      return 'yolo — no approval prompts; looser completion checks (faster, riskier)';
    case 'strict':
      return 'strict — approvals + strict evidence + post-edit verify (anti-hallucination)';
    default:
      return 'default — approvals on dangerous cmds; balanced evidence';
  }
}

/**
 * Slash commands for messaging gateways.
 * Used for /help text and Telegram’s `/` menu via setMyCommands
 * (command: 1–32 lowercase letters/digits/_; description: 1–256 chars).
 */
export const GATEWAY_BOT_COMMANDS: ReadonlyArray<{
  command: string;
  description: string;
}> = [
  { command: 'start', description: 'Welcome + list commands' },
  { command: 'help', description: 'Show available commands' },
  { command: 'new', description: 'Clear conversation (keep workdir)' },
  { command: 'reset', description: 'Clear conversation (same as /new)' },
  { command: 'clear', description: 'Clear conversation (same as /new)' },
  { command: 'stop', description: 'Interrupt run + kill active commands' },
  { command: 'status', description: 'Workdir, busy state, progress' },
  { command: 'queue', description: 'List or clear queued messages' },
  { command: 'workdir', description: 'Show or set project directory' },
  { command: 'progress', description: 'Tool progress updates on|off' },
  { command: 'level', description: 'Rigor: yolo | default | strict' },
  { command: 'model', description: 'Show or set model (/model name)' },
  { command: 'models', description: 'List models from API' },
  { command: 'skills', description: 'List skills (or /skills search q)' },
  { command: 'skill', description: 'Show a skill: /skill <name>' },
  { command: 'update', description: 'CLI update: /update · /update yes' },
  { command: 'sethome', description: 'Set this chat as cron home' },
  { command: 'once', description: 'Allow a pending dangerous command once' },
  { command: 'session', description: 'Allow pending command for this session' },
  { command: 'always', description: 'Always allow this command pattern' },
  { command: 'deny', description: 'Deny a pending dangerous command' },
];

export const HELP_TEXT = [
  '**Xibe Daemon — coding gateway**',
  '',
  ...GATEWAY_BOT_COMMANDS.map((c) => `\`/${c.command}\` — ${c.description}`),
  '',
  'While coding you see live tool lines (not empty step counters).',
  'Dev servers (`pnpm run dev`) run in the **background** so the agent returns.',
  'Dangerous commands pause for approval — buttons or `/once` `/session` `/always` `/deny`.',
  'Agent can **ask** you questions mid-run — reply with a number or free text (not `/status`).',
  '',
  '**While busy:**',
  '• `/stop` — interrupt (kills active shell commands)',
  '• Follow-ups are **queued** (`/queue` / `/queue clear`)',
  '• `?` — quick status without queueing',
  '',
  '**Model** (`/model`):',
  '• `/model` / `/models` — current + list from API',
  '• `/model <name>` — this chat only',
  '• `/model <name> --global` — also save profile default',
  '',
  '**Rigor levels** (`/level`):',
  '• `yolo` — fast, no approval prompts',
  '• `default` — ask on dangerous cmds (recommended)',
  '• `strict` — stronger anti-hallucination + verify after edits',
  '',
  '**Skills** (progressive load, Hermes-style):',
  '• `/skills` — list installed skills',
  '• `/skills search <query>` — filter',
  '• `/skill <name>` — show full skill body',
  '• Agent tools during runs: `list_skills` + `view_skill`',
  '',
  'Send a normal message to start or continue a coding task.',
  'Example: `Fix the failing tests in packages/cli`',
  'Example: `Use the debug-production skill on this error: …`',
  '',
  'On Telegram, type `/` to pick a command from the menu.',
].join('\n');
