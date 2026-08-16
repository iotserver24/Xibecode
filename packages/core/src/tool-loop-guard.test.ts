import { describe, expect, it } from 'vitest';
import { ToolLoopGuard } from './tool-loop-guard.js';

describe('ToolLoopGuard', () => {
  it('does not block different commands on the same tool', () => {
    const g = new ToolLoopGuard({ blockAfter: 6 });
    for (let i = 0; i < 8; i++) {
      const d = g.before('run_command', { command: `echo ${i}` });
      expect(d.allowed).toBe(true);
      g.after('run_command', { command: `echo ${i}` }, `ok ${i}`, true);
    }
  });

  it('does not block different fetch URLs', () => {
    const g = new ToolLoopGuard({ blockAfter: 6 });
    for (let i = 0; i < 8; i++) {
      const d = g.before('fetch_url', { url: `https://ex.com/${i}` });
      expect(d.allowed).toBe(true);
      g.after('fetch_url', { url: `https://ex.com/${i}` }, `body ${i}`, true);
    }
  });

  it('blocks the same fetch only after 6 identical results', () => {
    const g = new ToolLoopGuard({ blockAfter: 6, warnAfter: 3 });
    const input = { url: 'https://ex.com/a' };
    for (let i = 0; i < 6; i++) {
      expect(g.before('fetch_url', input).allowed).toBe(true);
      g.after('fetch_url', input, 'same body', true);
    }
    const blocked = g.before('fetch_url', input);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/6 times/i);
  });

  it('resets the counter when the result changes', () => {
    const g = new ToolLoopGuard({ blockAfter: 6 });
    const input = { url: 'https://ex.com/a' };
    for (let i = 0; i < 5; i++) {
      g.after('fetch_url', input, 'v1', true);
    }
    g.after('fetch_url', input, 'v2', true);
    expect(g.before('fetch_url', input).allowed).toBe(true);
  });
});
