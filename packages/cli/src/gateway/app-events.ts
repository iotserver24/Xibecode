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
  options?: Array<{ value: string; label: string; current?: boolean }>;
  /** Approval / ask / picker id the client echoes back. */
  ref?: string;
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

export function inlineUploadPrompt(
  caption: string,
  files: Array<{ name: string; savedPath?: string; inlineText?: string }>,
): string {
  const cap = caption.trim();
  if (!files.length) return cap;
  const parts: string[] = [];
  if (cap) parts.push(cap);
  for (const f of files) {
    if (f.inlineText != null) {
      parts.push(
        `--- attached file: ${f.name} ---\n${f.inlineText}\n--- end ${f.name} ---`,
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
