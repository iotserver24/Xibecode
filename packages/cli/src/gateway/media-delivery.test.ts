import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  classifyMediaKind,
  extractMedia,
  mediaTag,
  validateMediaPath,
} from './media-delivery.js';

describe('media-delivery', () => {
  it('classifies extensions', () => {
    expect(classifyMediaKind('a.png')).toBe('photo');
    expect(classifyMediaKind('a.MP4')).toBe('video');
    expect(classifyMediaKind('a.ogg')).toBe('voice');
    expect(classifyMediaKind('a.pdf')).toBe('document');
  });

  it('extracts MEDIA tags and strips them from text', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xc-media-'));
    const img = path.join(dir, 'shot.png');
    fs.writeFileSync(img, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const text = `Done.\n\nMEDIA:${img}\n\nSee above.`;
    const { media, cleanedText } = extractMedia(text);
    expect(media).toHaveLength(1);
    expect(media[0].path).toBe(img);
    expect(media[0].kind).toBe('photo');
    expect(cleanedText).toContain('Done');
    expect(cleanedText).not.toContain('MEDIA:');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('supports quoted paths and as_document', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xc-media-'));
    const img = path.join(dir, 'big.png');
    fs.writeFileSync(img, 'x');
    const text = `[[as_document]]\nMEDIA:\`${img}\``;
    const { media, cleanedText, asDocument } = extractMedia(text);
    expect(asDocument).toBe(true);
    expect(media).toHaveLength(1);
    expect(media[0].kind).toBe('document');
    expect(cleanedText).not.toContain('[[as_document]]');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rejects missing files', () => {
    const r = validateMediaPath('/tmp/definitely-missing-xc-xyz.png');
    expect(r.ok).toBe(false);
  });

  it('mediaTag is absolute', () => {
    const t = mediaTag('/tmp/x.png');
    expect(t).toBe('MEDIA:/tmp/x.png');
  });
});
