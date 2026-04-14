import { stat, readFile } from 'node:fs/promises';

export type ImageAttachment = {
  path: string;
  mime: string;
  dataBase64: string;
  bytes: number;
};

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export function mimeFromExtension(ext: string): string | null {
  const e = (ext || '').toLowerCase();
  return MIME_BY_EXT[e] ?? null;
}

export async function loadImageAttachment(
  absolutePath: string,
  opts?: { maxBytes?: number; mime?: string },
): Promise<ImageAttachment> {
  const maxBytes = opts?.maxBytes ?? 5 * 1024 * 1024; // 5MB

  const st = await stat(absolutePath);
  if (!st.isFile()) {
    throw new Error(`Not a file: ${absolutePath}`);
  }
  if (st.size > maxBytes) {
    throw new Error(`Image too large (${st.size} bytes > ${maxBytes}): ${absolutePath}`);
  }

  const buf = await readFile(absolutePath);
  const dataBase64 = buf.toString('base64');
  const mime = opts?.mime;
  if (!mime) {
    throw new Error(`Missing mime type for image: ${absolutePath}`);
  }

  return { path: absolutePath, mime, dataBase64, bytes: st.size };
}

