/**
 * Hermes-style MEDIA:<path> extraction + safe local-file delivery helpers.
 *
 * Agent replies can include tags like:
 *   MEDIA:/path/to/shot.png
 *   MEDIA:`/tmp/demo.mp4`
 *   [[as_document]]  — force images as sendDocument (no Telegram recompress)
 *   [[audio_as_voice]] — send audio as voice note when platform supports it
 *
 * Telegram Bot API (multipart/form-data upload):
 *   sendPhoto    — images ≤10MB (inline)
 *   sendVideo    — video ≤50MB
 *   sendDocument — any file ≤50MB
 *   sendVoice    — OGG Opus voice notes
 * Docs: https://core.telegram.org/bots/api#sendphoto
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type MediaKind = 'photo' | 'video' | 'audio' | 'voice' | 'document';

export interface ExtractedMedia {
  path: string;
  kind: MediaKind;
  /** Prefer sendDocument even for images (Hermes [[as_document]]). */
  asDocument: boolean;
  /** Prefer voice note for audio (Hermes [[audio_as_voice]]). */
  asVoice: boolean;
}

export interface MediaExtractResult {
  media: ExtractedMedia[];
  cleanedText: string;
  asDocument: boolean;
  asVoice: boolean;
}

const IMAGE_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.tiff',
  '.tif',
]);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.opus', '.m4a', '.flac', '.aac']);
const VOICE_EXTS = new Set(['.ogg', '.opus']);

/** Deliverable extensions (aligned with Hermes MEDIA_DELIVERY_EXTS). */
export const MEDIA_DELIVERY_EXTS = new Set([
  ...IMAGE_EXTS,
  ...VIDEO_EXTS,
  ...AUDIO_EXTS,
  '.pdf',
  '.docx',
  '.doc',
  '.odt',
  '.rtf',
  '.txt',
  '.md',
  '.epub',
  '.xlsx',
  '.xls',
  '.ods',
  '.csv',
  '.tsv',
  '.json',
  '.xml',
  '.yaml',
  '.yml',
  '.pptx',
  '.ppt',
  '.odp',
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.bz2',
  '.xz',
  '.7z',
  '.rar',
  '.html',
  '.htm',
  '.svg',
]);

const EXT_ALT = [...MEDIA_DELIVERY_EXTS]
  .map((e) => e.replace(/^\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .sort((a, b) => b.length - a.length)
  .join('|');

/**
 * MEDIA:<path> with optional quotes/backticks; path must end in a known ext.
 * Anchored so "see MEDIA in docs" does not match.
 */
const MEDIA_TAG_RE = new RegExp(
  String.raw`[\`"']?MEDIA:\s*[\`"']?((?:~|\/|[A-Za-z]:[\\/])[^\s\`"'<>|*?]+\.(?:${EXT_ALT}))[\`"']?`,
  'gi',
);

const SENSITIVE_PATH_RE =
  /(?:^|[\\/])(?:\.ssh|\.gnupg|\.aws|\.kube|\.docker|\.npmrc|\.env(?:\..*)?|id_rsa|id_ed25519|credentials)(?:$|[\\/])/i;

/** Telegram Bot API practical size limits (bytes). */
export const TG_LIMITS = {
  photo: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  document: 50 * 1024 * 1024,
  voice: 50 * 1024 * 1024,
} as const;

export function classifyMediaKind(filePath: string): MediaKind {
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'photo';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (VOICE_EXTS.has(ext)) return 'voice';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  return 'document';
}

export function mimeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/opus',
    '.m4a': 'audio/mp4',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.json': 'application/json',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.md': 'text/markdown',
    '.txt': 'text/plain',
  };
  return map[ext] || 'application/octet-stream';
}

function normalizeTagPath(raw: string): string {
  let p = raw.trim();
  p = p.replace(/^[\`"']+|[\`"']+$/g, '');
  if (p.startsWith('~/')) {
    p = path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/**
 * Validate a path is safe to upload as a bot attachment.
 * Rejects missing files, directories, sensitive locations, and oversize payloads.
 */
export function validateMediaPath(
  rawPath: string,
  opts?: { maxBytes?: number; workdir?: string },
): { ok: true; path: string; size: number; kind: MediaKind } | { ok: false; reason: string } {
  let abs: string;
  try {
    abs = path.resolve(normalizeTagPath(rawPath));
  } catch {
    return { ok: false, reason: 'invalid path' };
  }
  if (SENSITIVE_PATH_RE.test(abs)) {
    return { ok: false, reason: 'sensitive path blocked' };
  }
  // Optional workdir preference: allow paths under workdir, /tmp, or ~/.xibecode
  if (opts?.workdir) {
    const wd = path.resolve(opts.workdir);
    const tmp = os.tmpdir();
    const xibe = path.join(os.homedir(), '.xibecode');
    const under = (root: string) =>
      abs === root || abs.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
    if (!under(wd) && !under(tmp) && !under(xibe)) {
      // Still allow if the file exists elsewhere under home project-ish; keep strict for security
      // Allow any existing non-sensitive file that is not under system roots we care about
      if (abs.startsWith('/etc') || abs.startsWith('/proc') || abs.startsWith('/sys')) {
        return { ok: false, reason: 'system path blocked' };
      }
    }
  }
  let st: fs.Stats;
  try {
    st = fs.statSync(abs);
  } catch {
    return { ok: false, reason: 'file not found' };
  }
  if (!st.isFile()) {
    return { ok: false, reason: 'not a file' };
  }
  const kind = classifyMediaKind(abs);
  const max =
    opts?.maxBytes ??
    (kind === 'photo'
      ? TG_LIMITS.photo
      : kind === 'video' || kind === 'voice' || kind === 'audio'
        ? TG_LIMITS.video
        : TG_LIMITS.document);
  // Photos over 10MB can still go as document — caller handles kind override
  if (st.size > TG_LIMITS.document) {
    return { ok: false, reason: `file too large (${Math.round(st.size / 1024 / 1024)}MB > 50MB)` };
  }
  if (kind === 'photo' && st.size > TG_LIMITS.photo) {
    // reclassify as document for send path
    return { ok: true, path: abs, size: st.size, kind: 'document' };
  }
  if (st.size > max && kind !== 'document') {
    return { ok: true, path: abs, size: st.size, kind: 'document' };
  }
  return { ok: true, path: abs, size: st.size, kind };
}

/**
 * Extract MEDIA: tags and directive markers from agent response text.
 */
export function extractMedia(content: string): MediaExtractResult {
  if (!content || !content.includes('MEDIA:')) {
    const asDocument = content.includes('[[as_document]]');
    const asVoice = content.includes('[[audio_as_voice]]');
    let cleaned = content
      .replace(/\[\[as_document\]\]/g, '')
      .replace(/\[\[audio_as_voice\]\]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { media: [], cleanedText: cleaned, asDocument, asVoice };
  }

  const asDocument = content.includes('[[as_document]]');
  const asVoice = content.includes('[[audio_as_voice]]');
  const media: ExtractedMedia[] = [];
  const seen = new Set<string>();

  let cleaned = content
    .replace(/\[\[as_document\]\]/g, '')
    .replace(/\[\[audio_as_voice\]\]/g, '');

  cleaned = cleaned.replace(MEDIA_TAG_RE, (_full, p1: string) => {
    const raw = normalizeTagPath(String(p1 || ''));
    if (!raw) return '';
    const v = validateMediaPath(raw);
    if (!v.ok) return ''; // strip undeliverable tags silently
    if (seen.has(v.path)) return '';
    seen.add(v.path);
    let kind = v.kind;
    if (asDocument && kind === 'photo') kind = 'document';
    if (asVoice && (kind === 'audio' || kind === 'voice')) kind = 'voice';
    media.push({
      path: v.path,
      kind,
      asDocument,
      asVoice,
    });
    return '';
  });

  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return { media, cleanedText: cleaned, asDocument, asVoice };
}

/**
 * Build a Hermes-style MEDIA tag for tool results so the gateway can upload the file.
 */
export function mediaTag(filePath: string): string {
  return `MEDIA:${path.resolve(filePath)}`;
}
