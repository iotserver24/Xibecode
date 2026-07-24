/**
 * Formatting helpers for coding-oriented chat replies.
 * Progress + approval copy is messaging-friendly (Telegram / Discord / Slack).
 */

import type { DangerousApprovalRequest } from 'xibecode-core';
import {
  e2bAgentContextBlock,
  featuresForMode,
  resolveRuntimeMode,
  resolveSandboxIdentity,
} from '../utils/runtime-mode.js';

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
    // messaging: never leave chunk marker on a fence line
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
  curated_memory: '🧠',
  list_skills: '🧩',
  view_skill: '🧩',
  save_skill: '🧩',
  search_skills_sh: '🧩',
  install_skill_from_skills_sh: '🧩',
  delegate_subtask: '🐝',
  run_swarm: '🐝',
};

/**
 * short status lines (gateway/assets/status_phrases.yaml generic).
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

/** Long-running heartbeat ("status" surface). */
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
 * busy ack: short phrase only — no workdir, no checkmarks, no "Got it —".
 * workdirBasename kept for API compat; intentionally unused in the message.
 */
export function formatBusyAck(_workdirBasename?: string): string {
  return statusPhrase();
}

/** Progress bubble header (messaging: phrase only, not "💻 Coding… dir · rigor"). */
export function formatProgressHeader(_workdirBasename?: string, _rigor?: string): string {
  return statusPhrase();
}

/** Compact tool call for progress lines (emoji + short preview). */
export function formatToolProgress(name: string, input?: any): string {
  const emoji = TOOL_EMOJI[name] || '⚙️';
  // Memory tools: clear "saving…" so Telegram shows when persistence starts
  if (name === 'curated_memory') {
    const target = input?.target === 'user' ? 'USER' : 'MEMORY';
    const action = input?.operations?.length
      ? `batch×${input.operations.length}`
      : String(input?.action || 'save');
    const snippet = String(input?.content || input?.old_text || '')
      .replace(/\s+/g, ' ')
      .slice(0, 48);
    return `${emoji} saving ${target} (${action})${snippet ? ` · ${snippet}${snippet.length >= 48 ? '…' : ''}` : '…'}`;
  }
  if (name === 'update_memory' || name === 'remember_lesson') {
    const snippet = String(
      input?.content || input?.trigger || input?.action || '',
    )
      .replace(/\s+/g, ' ')
      .slice(0, 48);
    return `${emoji} saving memory${snippet ? ` · ${snippet}${snippet.length >= 48 ? '…' : ''}` : '…'}`;
  }
  const detail = summarizeToolInput(name, input);
  if (name === 'run_command' && detail) {
    return `${emoji} running ${detail}`;
  }
  if (detail) return `${emoji} ${friendlyToolName(name)} ${detail}`;
  return `${emoji} ${friendlyToolName(name)}…`;
}

export function formatToolResult(
  name: string,
  success: boolean,
  preview?: string,
  result?: any,
): string {
  const mark = success ? '✓' : '✗';
  // Explicit "saved" line for memory tools (user-visible on Telegram)
  if (
    success &&
    (name === 'curated_memory' ||
      name === 'update_memory' ||
      name === 'remember_lesson')
  ) {
    const r = result && typeof result === 'object' ? result : null;
    if (r?.staged) {
      return `⏳ Memory staged for approval (id=${r.id || '?'})`;
    }
    const target =
      r?.target === 'user' ? 'USER' : r?.target === 'memory' ? 'MEMORY' : null;
    const usage = typeof r?.usage === 'string' ? r.usage : '';
    const count =
      typeof r?.entry_count === 'number' ? `${r.entry_count} entries` : '';
    const bits = [
      '💾 Saved',
      target,
      usage,
      count,
      typeof r?.message === 'string' ? r.message : null,
    ].filter(Boolean);
    if (bits.length > 1) return bits.join(' · ');
    const short = preview
      ? preview.replace(/\s+/g, ' ').slice(0, 100)
      : 'memory written';
    return `💾 Saved · ${short}`;
  }
  if (success) {
    const short = preview
      ? preview.replace(/\s+/g, ' ').slice(0, 80)
      : friendlyToolName(name);
    return `${mark} ${short}`;
  }
  // Failures: show a longer error so users/agents aren't stuck with opaque "still checking"
  const err = preview
    ? preview.replace(/\s+/g, ' ').slice(0, 200)
    : 'unknown error';
  return `${mark} ${friendlyToolName(name)} failed: ${err}`;
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

/**
 * Prepare agent text for messaging platforms (Telegram/Discord/Slack).
 *
 * TUI renders `[[TASK_COMPLETE | summary=…]]` as a bordered footer; chat clients
 * show the raw tag which breaks Markdown and confuses users. Strip the tag and
 * append a plain done line (no internal control tokens).
 */
export function formatGatewayReply(text: string): string {
  if (!text) return text;
  // Lazy import-free regex mirror of core parseTaskComplete / stripTaskComplete
  // so gateway format stays usable without re-export churn.
  const match = text.match(/\[\[TASK_COMPLETE([^\]]*)\]\]/i);
  let body = text.replace(/\[\[TASK_COMPLETE[^\]]*\]\]/gi, '').trim();
  // Also strip mode request tags if the model leaked them
  body = body.replace(/\[\[REQUEST_MODE:[^\]]+\]\]/gi, '').trim();
  body = body.replace(/\[\[PLAN_READY\]\]/gi, '').trim();

  if (!match) return body;

  const raw = match[1] ?? '';
  const kv = new Map<string, string>();
  for (const field of raw
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const eq = field.indexOf('=');
    if (eq === -1) continue;
    const key = field.slice(0, eq).trim().toLowerCase();
    const value = field.slice(eq + 1).trim();
    if (key) kv.set(key, value);
  }
  const summary = kv.get('summary');
  if (!summary) return body;

  const evidence = kv.get('evidence');
  const showEvidence =
    evidence !== undefined &&
    evidence.trim().length > 0 &&
    evidence.trim().toLowerCase() !== 'none';

  // does not surface an internal completion token — just a clean final
  // answer. We add a short scannable footer so "done" is obvious in chat.
  const footer = showEvidence
    ? `✅ **Done** — ${summary}\n_Evidence: ${evidence}_`
    : `✅ **Done** — ${summary}`;

  if (!body) return footer;
  // Avoid duplicating if the model already wrote a similar done line
  if (/✅\s*\*?\*?Done/i.test(body) || /^Done\b/im.test(body)) {
    return body;
  }
  return `${body}\n\n${footer}`;
}

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
  ];

  // Hosted sandbox: identity + sudo + preview (e2b mode only)
  try {
    const mode = resolveRuntimeMode();
    const features = featuresForMode(mode.mode);
    if (mode.isE2b) {
      const block = e2bAgentContextBlock(resolveSandboxIdentity(), features);
      if (block) {
        lines.push(block, '');
      }
    }
  } catch {
    /* optional in non-cli test contexts */
  }

  lines.push(
    '## Sending files to the user (Telegram / messaging)',
    'When the user asks for a file, report, zip, code, PDF, image, video, or any other artifact, you MUST deliver it natively — not only describe the path.',
    '',
    'Put one MEDIA tag per file on its own line in your **final** reply (after creating the file with tools):',
    '  MEDIA:path/to/file.ext',
    '',
    'Rules:',
    '- Path can be workspace-relative (preferred) or absolute under the project.',
    '- Works for ANY file type up to 50MB: .png .jpg .pdf .zip .tar.gz .txt .md .ts .js .py .json .csv .docx .xlsx .mp4 .mp3 .webm …',
    '- Routing: images → Telegram photo; video → video; audio → audio; .ogg/.opus → voice note; everything else → document (downloadable with original filename).',
    '- Optional directive on its own line: [[as_document]] — force images/videos as raw documents (no photo recompression).',
    '- Optional: [[audio_as_voice]] — send audio as a voice note when applicable.',
    '- Multiple files: one MEDIA: line each (sent in order after the text).',
    '- Do NOT paste large file contents into the chat when a download is better — write the file, then MEDIA: it.',
    '',
    'Screenshots:',
    '- After you build or run a site (localhost), use take_screenshot(url, path under workspace); include the returned MEDIA: line.',
    '- Browser default: **agent-browser**. Path examples: screenshots/home.png — NOT /tmp/… (outside workspace is remapped).',
    '',
    'Examples of final replies:',
    '  Built the report.',
    '  MEDIA:reports/summary.pdf',
    '',
    '  Homepage is live at http://localhost:3000',
    '  MEDIA:screenshots/home.png',
    '',
    '  [[as_document]]',
    '  Source export ready.',
    '  MEDIA:dist/app.zip',
    '  MEDIA:src/index.ts',
    '',
    '- If a tool fails: read the error, retry with different params OR report failure to the user and emit [[TASK_COMPLETE | summary=failed: …]]. Never go silent.',
  );
  if (rigor !== 'yolo') {
    const e2bSudo =
      process.env.XIBECODE_E2B_ALLOW_SUDO === '1' ||
      process.env.XIBECODE_RUNTIME_MODE === 'e2b';
    lines.push(
      e2bSudo
        ? '- High-risk shell commands (rm -rf /, force push, publish, etc.) pause for user approval. Passwordless `sudo -n` for package installs is allowed in e2b mode.'
        : '- High-risk shell commands (rm -rf, force push, sudo, publish, etc.) pause for user approval — wait; do not assume they ran.',
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
  { command: 'update', description: 'CLI update (E2B: install+restart, chats kept)' },
  { command: 'mode', description: 'Show runtime mode (default | e2b)' },
  { command: 'cmd', description: 'Run shell: /cmd <command> (workdir, no agent)' },
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
  '• Default: plain messages **steer** mid-run (land after tools / next step)',
  '• `/queue <prompt>` — FIFO after current run (no interrupt)',
  '• `/stop` — hard interrupt; next free chat',
  '• `?` — quick status without queueing',
  '• Env: `XIBECODE_BUSY_INPUT_MODE=steer|queue|interrupt`',
  '',
  '**Runtime modes:**',
  '• `default` — local host',
  '• `e2b` — sandbox: `/update yes` = npm latest + daemon restart (**chat memory kept**)',
  '• `/mode` — show current · set via `XIBECODE_RUNTIME_MODE=default|e2b`',
  '',
  '**Shell** (`/cmd`) — no agent, runs in chat workdir:',
  '• `/cmd ls -la` · `/cmd pwd` · `/cmd tail -n 40 ~/.xibecode/daemon/logs/daemon.log`',
  '• Timeout 60s (override: `XIBECODE_CMD_TIMEOUT_MS`) · long output is truncated',
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
  '**Skills** (progressive load):',
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
