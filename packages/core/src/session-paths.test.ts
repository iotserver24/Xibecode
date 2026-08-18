import { describe, expect, it } from 'vitest';
import { sanitizeCwdKey, sessionTranscriptPath, projectDir } from './session-paths.js';

describe('session paths', () => {
  it('keeps short cwd keys as-is after sanitizing', () => {
    expect(sanitizeCwdKey('/tmp/app')).toBe('-tmp-app');
  });

  it('uses the same hash suffix as SessionManager for long paths', () => {
    const long = '/home/user/very/long/path/that/exceeds/sixty/characters/for/sure/project';
    const key = sanitizeCwdKey(long);
    expect(key.length).toBeGreaterThan(60);
    expect(key.startsWith(long.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 60))).toBe(true);
    expect(sessionTranscriptPath('abc', long)).toContain(key);
    expect(sessionTranscriptPath('abc', long)).toMatch(/abc\.jsonl$/);
  });

  it('isolates workspaces by cwd', () => {
    const a = projectDir('/tmp/proj-a');
    const b = projectDir('/tmp/proj-b');
    expect(a).not.toBe(b);
  });
});
