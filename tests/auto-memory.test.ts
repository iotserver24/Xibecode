import { describe, expect, it } from 'vitest';
import { formatMemoriesForContext, isAutoMemoryLoadEnabled } from '../src/utils/auto-memory.js';
import type { LoadedMemory } from '../src/utils/auto-memory.js';

describe('auto-memory', () => {
  it('formatMemoriesForContext returns empty for no memories', () => {
    expect(formatMemoriesForContext([])).toBe('');
  });

  it('formatMemoriesForContext includes section and path comments', () => {
    const m: LoadedMemory[] = [
      {
        path: '/p/.xibecode/memory.md',
        content: 'Use pnpm.',
        relevance: 0.5,
        type: 'project',
      },
    ];
    const s = formatMemoriesForContext(m);
    expect(s).toContain('Relevant Project Memories');
    expect(s).toContain('project memory:');
    expect(s).toContain('Use pnpm.');
  });

  it('isAutoMemoryLoadEnabled respects disable env', () => {
    const prev = process.env.XIBECODE_DISABLE_AUTO_MEMORY;
    try {
      process.env.XIBECODE_DISABLE_AUTO_MEMORY = '1';
      expect(isAutoMemoryLoadEnabled()).toBe(false);
    } finally {
      if (prev === undefined) {
        delete process.env.XIBECODE_DISABLE_AUTO_MEMORY;
      } else {
        process.env.XIBECODE_DISABLE_AUTO_MEMORY = prev;
      }
    }
  });
});
