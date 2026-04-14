import path from 'node:path';

export type AtReference = {
  raw: string;
  refPath: string;
  isAbsolute: boolean;
  resolvedPath: string;
  extension: string;
};

const AT_REF_RE = /@([A-Za-z0-9._\-\/]+)(?=$|\s)/g;

export function extractAtReferences(input: string, cwd: string): AtReference[] {
  const out: AtReference[] = [];
  if (!input) return out;

  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = AT_REF_RE.exec(input)) != null) {
    const refPath = match[1] || '';
    if (!refPath) continue;
    if (seen.has(refPath)) continue;
    seen.add(refPath);

    const isAbsolute = path.isAbsolute(refPath);
    const resolvedPath = isAbsolute ? refPath : path.resolve(cwd, refPath);
    const extension = path.extname(refPath).toLowerCase();

    out.push({
      raw: match[0],
      refPath,
      isAbsolute,
      resolvedPath,
      extension,
    });
  }

  return out;
}

export const DEFAULT_IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
]);

export function splitAtReferences(refs: AtReference[], imageExts = DEFAULT_IMAGE_EXTENSIONS): {
  image: AtReference[];
  other: AtReference[];
} {
  const image: AtReference[] = [];
  const other: AtReference[] = [];

  for (const ref of refs) {
    if (imageExts.has(ref.extension)) image.push(ref);
    else other.push(ref);
  }

  return { image, other };
}

