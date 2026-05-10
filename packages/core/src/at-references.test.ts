import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  collectImageReferencesForPrompt,
  extractImplicitImagePaths,
} from './utils/at-references.js';

describe('extractImplicitImagePaths', () => {
  it('finds bare filename in prose', () => {
    expect(extractImplicitImagePaths('see i just added a image boot.jpg explain')).toEqual([
      'boot.jpg',
    ]);
  });

  it('finds relative and nested paths', () => {
    expect(extractImplicitImagePaths('look at ./a.png and b/c/d.webp')).toEqual([
      './a.png',
      'b/c/d.webp',
    ]);
  });

  it('skips http(s) URLs', () => {
    expect(extractImplicitImagePaths('from https://x.com/y/z.jpg local only f.gif')).toEqual([
      'f.gif',
    ]);
  });

  it('dedupes repeated paths', () => {
    expect(extractImplicitImagePaths('boot.jpg and boot.jpg')).toEqual(['boot.jpg']);
  });
});

describe('collectImageReferencesForPrompt', () => {
  const cwd = path.resolve('/proj');

  it('merges @ refs and implicit paths', () => {
    const { imageRefs, explicitAtImagePaths } = collectImageReferencesForPrompt(
      'compare @a.png with b.jpeg',
      cwd,
    );
    expect(imageRefs.map((r) => r.refPath).sort()).toEqual(['a.png', 'b.jpeg'].sort());
    expect(explicitAtImagePaths.has(path.resolve(cwd, 'a.png'))).toBe(true);
  });
});
