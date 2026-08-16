import { describe, expect, it } from 'vitest';
import {
  fileKindFromName,
  inboxAuthorized,
  inlineUploadPrompt,
  makeEvent,
  parseBearer,
  parseProgressText,
} from './app-events.js';

describe('app chat events', () => {
  it('parses Bearer tokens', () => {
    expect(parseBearer('Bearer abc.def')).toBe('abc.def');
    expect(parseBearer('bearer xyz')).toBe('xyz');
    expect(parseBearer('Basic nope')).toBeNull();
  });

  it('authorizes matching secrets', () => {
    expect(
      inboxAuthorized({
        authorization: 'Bearer supersecretvalue',
        secrets: ['supersecretvalue'],
      }),
    ).toBe(true);
    expect(
      inboxAuthorized({
        secretHeader: 'supersecretvalue',
        secrets: ['supersecretvalue'],
      }),
    ).toBe(true);
    expect(
      inboxAuthorized({
        authorization: 'Bearer wrong',
        secrets: ['supersecretvalue'],
      }),
    ).toBe(false);
    expect(inboxAuthorized({ secrets: [], allowOpen: true })).toBe(true);
    expect(inboxAuthorized({ secrets: [] })).toBe(false);
  });

  it('builds incremental events', () => {
    const seq = { n: 0 };
    const a = makeEvent(seq, 'owner', { type: 'typing', text: 'on it' });
    const b = makeEvent(seq, 'owner', { type: 'text', text: 'hi', final: true });
    expect(a.id).toBe('1');
    expect(b.id).toBe('2');
    expect(b.type).toBe('text');
  });

  it('inlines text uploads and keeps binary paths', () => {
    const prompt = inlineUploadPrompt('please review', [
      { name: 'notes.md', inlineText: '# hi', savedPath: '/ws/inbox/notes.md' },
      { name: 'shot.png', savedPath: '/ws/inbox/shot.png' },
    ]);
    expect(prompt).toContain('please review');
    expect(prompt).toContain('--- attached file: notes.md ---');
    expect(prompt).toContain('# hi');
    expect(prompt).toContain('`/ws/inbox/shot.png`');
    expect(prompt).toContain('Open and look at that image file');
  });

  it('classifies image uploads and parses progress text', () => {
    expect(fileKindFromName('shot.PNG')).toBe('photo');
    expect(fileKindFromName('notes.pdf')).toBe('document');
    expect(fileKindFromName('clip.mp4')).toBe('video');
    expect(parseProgressText('still on it · 45s · 3 tools')).toEqual({
      elapsedMs: 45000,
      tools: 3,
    });
  });
});
