/**
 * First-party app chat events (not ACP, not Telegram MarkdownV2).
 * Tiny JSON objects the Flutter client renders as bubbles / buttons / files.
 */

export const APP_DEFAULT_CHAT_ID = 'owner';
export const APP_DEFAULT_USER_ID = 'owner';
export const APP_INBOX_DEFAULT_PORT = 8790;

export type AppEventType =
  | 'typing'
  | 'text'
  | 'tool'
  | 'ask'
  | 'approve'
  | 'picker'
  | 'file'
  | 'progress'
  | 'done'
  | 'error';

export type AppFileKind = 'photo' | 'video' | 'audio' | 'voice' | 'document';

export type AppPickerKind = 'model' | 'level' | 'choice';

export interface AppChatEvent {
  id: string;
  ts: number;
  chatId: string;
  type: AppEventType;
  text?: string;
  delta?: boolean;
  final?: boolean;
  name?: string;
  state?: 'start' | 'done';
  summary?: string;
  question?: string;
  choices?: string[];
  title?: string;
  detail?: string;
  kind?: AppFileKind | AppPickerKind;
  fileId?: string;
  caption?: string;
  /** Public wake-http share URL (E2B). */
  url?: string;
  mime?: string;
  size?: number;
  role?: 'user' | 'assistant';
  elapsedMs?: number;
  tools?: number;
  pct?: number;
  options?: Array<{ value: string; label: string; current?: boolean }>;
  /** Approval / ask / picker id the client echoes back. */
  ref?: string;
  /** Phone app renders GitHub-flavored markdown when this is set. */
  format?: 'markdown' | 'plain';
}

export function nextEventId(seq: { n: number }): string {
  seq.n += 1;
  return String(seq.n);
}

export function makeEvent(
  seq: { n: number },
  chatId: string,
  partial: Omit<AppChatEvent, 'id' | 'ts' | 'chatId'>,
): AppChatEvent {
  return {
    id: nextEventId(seq),
    ts: Date.now(),
    chatId,
    ...partial,
  };
}

export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^\s*Bearer\s+(\S+)\s*$/i.exec(header);
  return m?.[1] || null;
}

/** True when the request is allowed to talk to the inbox. */
export function inboxAuthorized(opts: {
  authorization?: string | null;
  secretHeader?: string | null;
  secrets: string[];
  allowOpen?: boolean;
}): boolean {
  const offered = [
    parseBearer(opts.authorization || null),
    (opts.secretHeader || '').trim() || null,
  ].filter((s): s is string => Boolean(s));
  const secrets = opts.secrets.map((s) => s.trim()).filter((s) => s.length >= 8);
  if (secrets.length === 0) return Boolean(opts.allowOpen);
  return offered.some((o) => secrets.includes(o));
}

const IMAGE_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.heic',
  '.heif',
]);

export function fileKindFromName(name: string, mime?: string): AppFileKind {
  if (mime && /^image\//i.test(mime)) return 'photo';
  if (mime && /^video\//i.test(mime)) return 'video';
  if (mime && /^audio\//i.test(mime)) return 'audio';
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
  if (IMAGE_EXTS.has(ext)) return 'photo';
  if (['.mp4', '.mov', '.webm', '.mkv'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.ogg', '.m4a', '.opus'].includes(ext)) return 'audio';
  return 'document';
}

export function parseProgressText(text: string): { elapsedMs?: number; tools?: number } {
  const secs = /\b(\d+)s\b/.exec(text);
  const tools = /\b(\d+)\s+tools?\b/i.exec(text);
  return {
    elapsedMs: secs ? Number(secs[1]) * 1000 : undefined,
    tools: tools ? Number(tools[1]) : undefined,
  };
}

export function inlineUploadPrompt(
  caption: string,
  files: Array<{
    name: string;
    savedPath?: string;
    inlineText?: string;
    mime?: string;
    kind?: string;
    publicUrl?: string;
  }>,
): string {
  const cap = caption.trim();
  if (!files.length) return cap;
  const parts: string[] = [];
  if (cap) parts.push(cap);
  for (const f of files) {
    const kind = f.kind || fileKindFromName(f.name, f.mime);
    if (f.inlineText != null) {
      parts.push(
        `--- attached file: ${f.name} ---\n${f.inlineText}\n--- end ${f.name} ---`,
      );
    } else if (kind === 'photo' && f.savedPath) {
      const link = f.publicUrl
        ? ` Public vision URL: ${f.publicUrl}`
        : '';
      parts.push(
        `User attached image \`${f.name}\` saved at \`${f.savedPath}\`.${link} The picture is attached to this turn for vision — call see_image on that path if you need to look again.`,
      );
    } else if (f.savedPath) {
      parts.push(
        `User attached file \`${f.name}\` saved at \`${f.savedPath}\`. Read or use that path.`,
      );
    } else {
      parts.push(`User attached file \`${f.name}\`.`);
    }
  }
  return parts.join('\n\n');
}
