/**
 * Formatting helpers for coding-oriented chat replies.
 */

/** Split long text for platform limits, preferring breaks at newlines / code fences. */
export function chunkForChat(text: string, max = 3900): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let rest = text;
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
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/** Compact tool call for progress lines. */
export function formatToolProgress(name: string, input?: any): string {
  const detail = summarizeToolInput(name, input);
  return detail ? `🔧 \`${name}\` ${detail}` : `🔧 \`${name}\``;
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
    const short = cmd.length > 80 ? cmd.slice(0, 77) + '…' : cmd;
    return `\`${short.replace(/\n/g, ' ')}\``;
  }
  if (typeof path === 'string') {
    const short = path.length > 100 ? '…' + path.slice(-97) : path;
    return `\`${short}\``;
  }
  if (name.includes('search') && input.pattern) {
    return `\`${String(input.pattern).slice(0, 60)}\``;
  }
  return '';
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

/** Coding-focused system prefix for gateway chats. */
export function codingSystemPrefix(workdir: string): string {
  return [
    'You are XibeCode running in a 24/7 messaging gateway for software engineering.',
    `Working directory: ${workdir}`,
    'Prefer concrete code changes: read files, edit, run tests/commands, report results.',
    'Keep replies scannable in chat: short summary first, then details / code blocks.',
    'Use fenced code blocks with language tags for patches and snippets.',
    'If a task is done, say what changed and how to verify. Avoid fluff.',
  ].join('\n');
}

export const HELP_TEXT = [
  '**XibeCode coding gateway**',
  '',
  '`/help` — this help',
  '`/new` or `/reset` — clear conversation',
  '`/stop` — cancel the current agent run',
  '`/status` — workdir, model, busy state',
  '`/workdir [path]` — show or set project directory for this chat',
  '`/progress on|off` — tool progress updates while coding',
  '`/sethome` — set this chat as home for cron delivery',
  '',
  'Send a normal message to start or continue a coding task.',
  'Example: `Fix the failing tests in packages/cli`',
].join('\n');
