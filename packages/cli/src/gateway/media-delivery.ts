/**
 * Hermes-style MEDIA:<path> extraction + safe local-file delivery helpers.
 *
 * Agent replies can include tags like:
 *   MEDIA:/path/to/shot.png
 *   MEDIA:dist/report.pdf          (workspace-relative)
 *   MEDIA:`src/app.ts`
 *   MEDIA:"my report.docx"
 *   [[as_document]]  — force images as sendDocument (no Telegram recompress)
 *   [[audio_as_voice]] — send audio as voice note when platform supports it
 *
 * Telegram Bot API (multipart/form-data upload):
 *   sendPhoto    — images ≤10MB (inline gallery)
 *   sendVideo    — video ≤50MB
 *   sendAudio    — audio ≤50MB (mp3/m4a etc.)
 *   sendVoice    — OGG Opus voice notes
 *   sendDocument — any file ≤50MB (code, zip, pdf, large images, …)
 * Docs: https://core.telegram.org/bots/api#sending-files
 *       https://core.telegram.org/bots/api#senddocument
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
  /** Original tag path (for logs). */
  raw?: string;
}

export interface MediaExtractResult {
  media: ExtractedMedia[];
  cleanedText: string;
  asDocument: boolean;
  asVoice: boolean;
  /** Tags that matched but could not be delivered. */
  skipped: Array<{ raw: string; reason: string }>;
}

export interface ExtractMediaOptions {
  /** Session workdir — relative MEDIA paths resolve here. */
  workdir?: string;
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
  '.heic',
  '.heif',
]);
const VIDEO_EXTS = new Set([
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.m4v',
  '.mpeg',
  '.mpg',
  '.3gp',
]);
const AUDIO_EXTS = new Set([
  '.mp3',
  '.wav',
  '.ogg',
  '.opus',
  '.m4a',
  '.flac',
  '.aac',
  '.wma',
]);
/** OGG/Opus often work as Telegram voice notes. */
const VOICE_EXTS = new Set(['.ogg', '.opus']);

/**
 * Hint list for docs/tests — delivery accepts **any** existing file ≤50MB.
 * Classification still uses IMAGE/VIDEO/AUDIO sets above; everything else is document.
 */
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
  '.markdown',
  '.epub',
  '.xlsx',
  '.xls',
  '.ods',
  '.csv',
  '.tsv',
  '.json',
  '.jsonl',
  '.xml',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
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
  '.css',
  '.scss',
  '.svg',
  '.ico',
  '.log',
  '.diff',
  '.patch',
  '.sql',
  '.db',
  '.sqlite',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.c',
  '.cc',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.php',
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.bat',
  '.vue',
  '.svelte',
  '.astro',
  '.wasm',
  '.bin',
  '.exe',
  '.dmg',
  '.apk',
  '.ipa',
  '.deb',
  '.rpm',
  '.whl',
  '.jar',
  '.war',
  '.parquet',
  '.arrow',
  '.ipynb',
  '.lock',
  '.env.example',
]);

/**
 * MEDIA:<path> — absolute, ~/…, or workspace-relative.
 * Supports optional quotes/backticks around the path or the whole tag.
 * Any extension (or none) is allowed; existence is checked later.
 */
const MEDIA_TAG_RE =
  /[`"']?MEDIA:\s*(?:`([^`\n]+)`|"([^"\n]+)"|'([^'\n]+)'|([^\s`"']+))[`"']?/gi;

const SENSITIVE_PATH_RE =
  /(?:^|[\\/])(?:\.ssh|\.gnupg|\.aws|\.kube|\.docker|\.npmrc|\.env(?:\..*)?|id_rsa|id_ed25519|credentials|passwd|shadow)(?:$|[\\/])/i;

/** Telegram Bot API practical size limits (bytes) for bots. */
export const TG_LIMITS = {
  photo: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  document: 50 * 1024 * 1024,
  voice: 50 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
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
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.heic': 'image/heic',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mpeg': 'video/mpeg',
    '.mpg': 'video/mpeg',
    '.3gp': 'video/3gpp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/opus',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.gz': 'application/gzip',
    '.tgz': 'application/gzip',
    '.tar': 'application/x-tar',
    '.7z': 'application/x-7z-compressed',
    '.rar': 'application/vnd.rar',
    '.json': 'application/json',
    '.jsonl': 'application/x-ndjson',
    '.xml': 'application/xml',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.toml': 'application/toml',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.md': 'text/markdown',
    '.markdown': 'text/markdown',
    '.txt': 'text/plain',
    '.log': 'text/plain',
    '.csv': 'text/csv',
    '.tsv': 'text/tab-separated-values',
    '.ts': 'text/typescript',
    '.tsx': 'text/tsx',
    '.js': 'text/javascript',
    '.jsx': 'text/javascript',
    '.mjs': 'text/javascript',
    '.cjs': 'text/javascript',
    '.py': 'text/x-python',
    '.go': 'text/x-go',
    '.rs': 'text/x-rust',
    '.java': 'text/x-java',
    '.rb': 'text/x-ruby',
    '.sh': 'text/x-shellscript',
    '.bash': 'text/x-shellscript',
    '.c': 'text/x-c',
    '.cpp': 'text/x-c++',
    '.h': 'text/x-c',
    '.cs': 'text/x-csharp',
    '.php': 'text/x-php',
    '.sql': 'application/sql',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.pptx':
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.epub': 'application/epub+zip',
    '.wasm': 'application/wasm',
    '.ipynb': 'application/x-ipynb+json',
  };
  return map[ext] || 'application/octet-stream';
}

function normalizeTagPath(raw: string): string {
  let p = raw.trim();
  p = p.replace(/^[\`"']+|[\`"']+$/g, '');
  // Strip trailing punctuation the model sometimes glues on (period, comma)
  p = p.replace(/[.,;:!?)]+$/g, '');
  if (p.startsWith('~/')) {
    p = path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function resolveAgainstWorkdir(rawPath: string, workdir?: string): string {
  const normalized = normalizeTagPath(rawPath);
  if (!normalized) return normalized;
  if (path.isAbsolute(normalized)) return path.resolve(normalized);
  const base = workdir ? path.resolve(workdir) : process.cwd();
  return path.resolve(base, normalized);
}

/**
 * Validate a path is safe to upload as a bot attachment.
 * Rejects missing files, directories, sensitive locations, and oversize payloads.
 * Accepts **any** regular file ≤50MB (Telegram sendDocument limit for bots).
 */
export function validateMediaPath(
  rawPath: string,
  opts?: { maxBytes?: number; workdir?: string },
):
  | { ok: true; path: string; size: number; kind: MediaKind }
  | { ok: false; reason: string } {
  let abs: string;
  try {
    abs = resolveAgainstWorkdir(rawPath, opts?.workdir);
  } catch {
    return { ok: false, reason: 'invalid path' };
  }
  if (!abs) {
    return { ok: false, reason: 'empty path' };
  }
  if (SENSITIVE_PATH_RE.test(abs)) {
    return { ok: false, reason: 'sensitive path blocked' };
  }
  if (
    abs.startsWith('/etc') ||
    abs.startsWith('/proc') ||
    abs.startsWith('/sys') ||
    abs.startsWith('/dev')
  ) {
    return { ok: false, reason: 'system path blocked' };
  }

  // Prefer workspace / tmp / ~/.xibecode when workdir is set; still allow other
  // non-system paths (e.g. build artifacts) so agents can send generated files.
  if (opts?.workdir) {
    const wd = path.resolve(opts.workdir);
    const tmp = os.tmpdir();
    const xibe = path.join(os.homedir(), '.xibecode');
    const under = (root: string) =>
      abs === root ||
      abs.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
    // Soft preference only — do not hard-block outside workdir (agent may write
    // to absolute paths inside the sandbox workspace layout).
    void under(wd);
    void under(tmp);
    void under(xibe);
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

  let kind = classifyMediaKind(abs);
  // Photos over 10MB must go as document (Telegram sendPhoto limit)
  if (st.size > TG_LIMITS.document) {
    return {
      ok: false,
      reason: `file too large (${Math.round(st.size / 1024 / 1024)}MB > 50MB Telegram bot limit)`,
    };
  }
  if (kind === 'photo' && st.size > TG_LIMITS.photo) {
    kind = 'document';
  }
  if (
    (kind === 'video' || kind === 'audio' || kind === 'voice') &&
    st.size > TG_LIMITS.video
  ) {
    kind = 'document';
  }
  if (opts?.maxBytes != null && st.size > opts.maxBytes) {
    return {
      ok: false,
      reason: `file too large (${st.size} > ${opts.maxBytes} bytes)`,
    };
  }
  return { ok: true, path: abs, size: st.size, kind };
}

function stripDirectives(content: string): string {
  return content
    .replace(/\[\[as_document\]\]/gi, '')
    .replace(/\[\[audio_as_voice\]\]/gi, '');
}

/**
 * Extract MEDIA: tags and directive markers from agent response text.
 */
export function extractMedia(
  content: string,
  opts?: ExtractMediaOptions,
): MediaExtractResult {
  if (!content) {
    return {
      media: [],
      cleanedText: '',
      asDocument: false,
      asVoice: false,
      skipped: [],
    };
  }

  const asDocument = /\[\[as_document\]\]/i.test(content);
  const asVoice = /\[\[audio_as_voice\]\]/i.test(content);
  const media: ExtractedMedia[] = [];
  const skipped: Array<{ raw: string; reason: string }> = [];
  const seen = new Set<string>();

  if (!content.includes('MEDIA:')) {
    const cleaned = stripDirectives(content).replace(/\n{3,}/g, '\n\n').trim();
    return { media: [], cleanedText: cleaned, asDocument, asVoice, skipped };
  }

  let cleaned = stripDirectives(content);

  cleaned = cleaned.replace(MEDIA_TAG_RE, (_full, g1, g2, g3, g4) => {
    const raw = String(g1 || g2 || g3 || g4 || '').trim();
    if (!raw) return '';
    const v = validateMediaPath(raw, { workdir: opts?.workdir });
    if (!v.ok) {
      skipped.push({ raw, reason: v.reason });
      return '';
    }
    if (seen.has(v.path)) return '';
    seen.add(v.path);
    let kind = v.kind;
    if (asDocument && kind === 'photo') kind = 'document';
    if (asVoice && (kind === 'audio' || kind === 'voice')) kind = 'voice';
    // Explicit [[as_document]] forces document for video/audio too when set
    if (asDocument && (kind === 'video' || kind === 'audio')) kind = 'document';
    media.push({
      path: v.path,
      kind,
      asDocument,
      asVoice,
      raw,
    });
    return '';
  });

  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return { media, cleanedText: cleaned, asDocument, asVoice, skipped };
}

/**
 * Build a Hermes-style MEDIA tag for tool results so the gateway can upload the file.
 */
export function mediaTag(filePath: string): string {
  return `MEDIA:${path.resolve(filePath)}`;
}

/**
 * Pull absolute deliverable paths out of a tool result (take_screenshot, etc.).
 * Used by the gateway to auto-attach files even if the model omits MEDIA: lines.
 */
export function collectMediaPathsFromToolResult(
  result: unknown,
  opts?: { workdir?: string },
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | undefined | null) => {
    if (!raw || typeof raw !== 'string') return;
    // Strip MEDIA: prefix if present
    let p = raw.trim();
    const m = p.match(/^MEDIA:\s*(.+)$/i);
    if (m) p = m[1].trim().replace(/^[\`"']+|[\`"']+$/g, '');
    const v = validateMediaPath(p, { workdir: opts?.workdir });
    if (!v.ok) return;
    if (seen.has(v.path)) return;
    seen.add(v.path);
    out.push(v.path);
  };

  if (result == null) return out;
  if (typeof result === 'string') {
    // Scan string results for MEDIA: tags or absolute image paths
    const re = /MEDIA:\s*([^\s`"']+)/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(result)) !== null) {
      add(match[1]);
    }
    return out;
  }
  if (typeof result !== 'object') return out;
  const r = result as Record<string, unknown>;
  add(typeof r.media_tag === 'string' ? r.media_tag : null);
  add(typeof r.mediaTag === 'string' ? r.mediaTag : null);
  add(typeof r.path === 'string' ? r.path : null);
  if (typeof r.message === 'string') {
    for (const p of collectMediaPathsFromToolResult(r.message, opts)) {
      if (!seen.has(p)) {
        seen.add(p);
        out.push(p);
      }
    }
  }
  return out;
}

/**
 * Ensure final agent text includes MEDIA: tags for every path we captured
 * during the run (deduped). Absolute tags so delivery never depends on cwd.
 */
export function appendMissingMediaTags(
  text: string,
  paths: string[],
  opts?: { workdir?: string },
): string {
  if (!paths.length) return text;
  const existing = extractMedia(text || '', { workdir: opts?.workdir });
  const have = new Set(existing.media.map((m) => m.path));
  const missing: string[] = [];
  for (const p of paths) {
    const v = validateMediaPath(p, { workdir: opts?.workdir });
    if (!v.ok) continue;
    if (have.has(v.path)) continue;
    have.add(v.path);
    missing.push(v.path);
  }
  if (!missing.length) return text;
  const block = missing.map((p) => mediaTag(p)).join('\n');
  const base = (text || '').trimEnd();
  return base ? `${base}\n\n${block}` : block;
}

/**
 * Human-readable summary of how a path will be sent (for agent hints / logs).
 */
export function describeMediaDelivery(filePath: string): string {
  const kind = classifyMediaKind(filePath);
  switch (kind) {
    case 'photo':
      return 'Telegram photo (inline; use [[as_document]] for original file)';
    case 'video':
      return 'Telegram video';
    case 'voice':
      return 'Telegram voice note';
    case 'audio':
      return 'Telegram audio';
    default:
      return 'Telegram document (downloadable file)';
  }
}
