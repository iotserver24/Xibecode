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

/**
 * Find image path tokens in plain text (no leading `@`), e.g. "see boot.jpg".
 * Skips http(s) URLs. Caller should verify paths exist on disk.
 */
export function extractImplicitImagePaths(input: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  if (!input) return out;

  const re =
    /(?:^|[\s"'(<\[\{,;:])(?!https?:\/\/)((?:\.\/|\.\.\/)(?:[\w.-]+\/)*[\w.-]+\.(?:png|jpe?g|gif|webp)|(?:[\w.-]+\/)+[\w.-]+\.(?:png|jpe?g|gif|webp)|[\w][\w.-]*\.(?:png|jpe?g|gif|webp))\b/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const p = m[1];
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

function implicitPathsToImageReferences(paths: string[], cwd: string): AtReference[] {
  return paths.map((refPath) => {
    const isAbsolute = path.isAbsolute(refPath);
    const resolvedPath = isAbsolute ? refPath : path.resolve(cwd, refPath);
    return {
      raw: refPath,
      refPath,
      isAbsolute,
      resolvedPath,
      extension: path.extname(refPath).toLowerCase(),
    };
  });
}

/**
 * Image file references for vision: explicit `@path` refs plus path-like image
 * tokens in the message body (deduped by resolved path).
 */
export function collectImageReferencesForPrompt(
  input: string,
  cwd: string,
  imageExts = DEFAULT_IMAGE_EXTENSIONS,
): { imageRefs: AtReference[]; explicitAtImagePaths: Set<string> } {
  const atRefs = extractAtReferences(input, cwd);
  const atSplit = splitAtReferences(atRefs, imageExts);
  const explicitAtImagePaths = new Set(atSplit.image.map((r) => r.resolvedPath));

  const merged: AtReference[] = [...atSplit.image];
  const seen = new Set(merged.map((r) => r.resolvedPath));

  for (const ref of implicitPathsToImageReferences(extractImplicitImagePaths(input), cwd)) {
    if (!imageExts.has(ref.extension)) continue;
    if (seen.has(ref.resolvedPath)) continue;
    seen.add(ref.resolvedPath);
    merged.push(ref);
  }

  return { imageRefs: merged, explicitAtImagePaths };
}

