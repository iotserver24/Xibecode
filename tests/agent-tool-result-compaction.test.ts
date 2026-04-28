import { describe, expect, it } from 'vitest';
import { compactToolResultPayload } from '../src/core/agent.js';

describe('compactToolResultPayload', () => {
  it('leaves small tool results unchanged', () => {
    const result = compactToolResultPayload({ stdout: 'ok', nested: { content: 'small' } }, 1000);

    expect(result).toEqual({ stdout: 'ok', nested: { content: 'small' } });
  });

  it('compacts large stdout/stderr/content fields with metadata', () => {
    const result = compactToolResultPayload(
      {
        stdout: `${'a'.repeat(1000)}${'z'.repeat(1000)}`,
        content: `${'x'.repeat(1000)}${'y'.repeat(1000)}`,
      },
      600,
    ) as any;

    expect(result.stdout.length).toBeLessThanOrEqual(600);
    expect(result.content.length).toBeLessThanOrEqual(600);
    expect(result.stdout).toContain('tool result truncated');
    expect(result.stdoutTruncated).toBe(true);
    expect(result.stdoutOriginalLength).toBe(2000);
    expect(result.contentTruncated).toBe(true);
  });
});
