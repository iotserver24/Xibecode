import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  appendMissingMediaTags,
  classifyMediaKind,
  collectMediaPathsFromToolResult,
  extractMedia,
  mediaTag,
  mimeForPath,
  validateMediaPath,
} from './media-delivery.js';

describe('media-delivery', () => {
  it('classifies extensions', () => {
    expect(classifyMediaKind('a.png')).toBe('photo');
    expect(classifyMediaKind('a.MP4')).toBe('video');
    expect(classifyMediaKind('a.ogg')).toBe('voice');
    expect(classifyMediaKind('a.mp3')).toBe('audio');
    expect(classifyMediaKind('a.pdf')).toBe('document');
    expect(classifyMediaKind('src/app.ts')).toBe('document');
    expect(classifyMediaKind('dist/app.zip')).toBe('document');
    expect(classifyMediaKind('notes')).toBe('document');
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

  it('resolves workspace-relative MEDIA paths', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xc-media-'));
    const sub = path.join(dir, 'dist');
    fs.mkdirSync(sub);
    const zip = path.join(sub, 'app.zip');
    fs.writeFileSync(zip, 'PK\x03\x04fake');
    const text = `Here is the build.\nMEDIA:dist/app.zip`;
    const { media, cleanedText, skipped } = extractMedia(text, { workdir: dir });
    expect(skipped).toHaveLength(0);
    expect(media).toHaveLength(1);
    expect(media[0].path).toBe(zip);
    expect(media[0].kind).toBe('document');
    expect(cleanedText).toContain('Here is the build');
    expect(cleanedText).not.toContain('MEDIA:');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('sends code and docs as document', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xc-media-'));
    const ts = path.join(dir, 'main.ts');
    const pdf = path.join(dir, 'report.pdf');
    fs.writeFileSync(ts, 'export const x = 1;\n');
    fs.writeFileSync(pdf, '%PDF-1.4 fake');
    const text = `Files ready.\nMEDIA:main.ts\nMEDIA:report.pdf`;
    const { media } = extractMedia(text, { workdir: dir });
    expect(media).toHaveLength(2);
    expect(media.map((m) => m.kind)).toEqual(['document', 'document']);
    expect(media.map((m) => path.basename(m.path)).sort()).toEqual([
      'main.ts',
      'report.pdf',
    ]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reports skipped tags when file missing', () => {
    const text = `Oops\nMEDIA:does-not-exist-xyz.pdf`;
    const { media, skipped, cleanedText } = extractMedia(text, {
      workdir: os.tmpdir(),
    });
    expect(media).toHaveLength(0);
    expect(skipped.length).toBeGreaterThanOrEqual(1);
    expect(skipped[0].reason).toMatch(/not found/i);
    expect(cleanedText).not.toContain('MEDIA:');
  });

  it('rejects missing files', () => {
    const r = validateMediaPath('/tmp/definitely-missing-xc-xyz.png');
    expect(r.ok).toBe(false);
  });

  it('mediaTag is absolute', () => {
    const t = mediaTag('/tmp/x.png');
    expect(t).toBe('MEDIA:/tmp/x.png');
  });

  it('mimeForPath covers common types', () => {
    expect(mimeForPath('a.pdf')).toBe('application/pdf');
    expect(mimeForPath('a.ts')).toBe('text/typescript');
    expect(mimeForPath('a.zip')).toBe('application/zip');
    expect(mimeForPath('a.unknownext')).toBe('application/octet-stream');
  });

  it('reclassifies oversized photos as document', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xc-media-'));
    const img = path.join(dir, 'huge.png');
    // 11MB fake png header + padding
    const buf = Buffer.alloc(11 * 1024 * 1024, 1);
    buf[0] = 0x89;
    buf[1] = 0x50;
    fs.writeFileSync(img, buf);
    const v = validateMediaPath(img);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.kind).toBe('document');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('collects media from take_screenshot tool result', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xc-media-'));
    const img = path.join(dir, 'shot.png');
    fs.writeFileSync(img, 'x');
    const paths = collectMediaPathsFromToolResult(
      {
        success: true,
        path: img,
        media_tag: `MEDIA:${img}`,
        message: `Screenshot saved. Include:\nMEDIA:${img}`,
      },
      { workdir: dir },
    );
    expect(paths).toEqual([img]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('appendMissingMediaTags adds only missing paths', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xc-media-'));
    const a = path.join(dir, 'a.png');
    const b = path.join(dir, 'b.png');
    fs.writeFileSync(a, 'a');
    fs.writeFileSync(b, 'b');
    const text = `Done\nMEDIA:${a}`;
    const out = appendMissingMediaTags(text, [a, b], { workdir: dir });
    expect(out).toContain(`MEDIA:${a}`);
    expect(out).toContain(`MEDIA:${b}`);
    // only one extra line for b
    expect(out.match(/MEDIA:/g)?.length).toBe(2);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
