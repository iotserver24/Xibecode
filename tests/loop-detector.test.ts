import { describe, expect, it } from 'vitest';
import { LoopDetector } from '../src/core/agent.js';

describe('LoopDetector', () => {
  it('blocks exact repeated tool calls', () => {
    const detector = new LoopDetector();
    const input = { path: 'src/a.ts', pattern: 'foo' };
    const r1 = detector.check('search_files', input);
    const r2 = detector.check('search_files', input);
    const r3 = detector.check('search_files', input);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(false);
  });

  it('detects near-identical low-variation loops', () => {
    const detector = new LoopDetector();
    const calls = [
      { path: 'a.ts', pattern: 'x' },
      { pattern: 'x', path: 'a.ts' }, // same keys, different order
      { path: 'b.ts', pattern: 'x' },
      { pattern: 'x', path: 'b.ts' },
      { path: 'c.ts', pattern: 'x' },
    ];
    let last = { allowed: true };
    for (const call of calls) {
      last = detector.check('search_files', call);
    }
    expect(last.allowed).toBe(false);
  });
});
