import { describe, it, expect } from 'vitest';
import {
  applyToolResultBudget,
  formatToolBatchSummary,
} from './tool-result-budget.js';

describe('applyToolResultBudget', () => {
  it('leaves small results alone', () => {
    const r = applyToolResultBudget(
      [
        { type: 'tool_result', tool_use_id: '1', content: 'hello' },
        { type: 'tool_result', tool_use_id: '2', content: 'world' },
      ],
      { maxTotalChars: 10_000 },
    );
    expect(r.trimmed).toBe(0);
    expect(r.results[0]!.content).toBe('hello');
  });

  it('trims when over budget', () => {
    const big = 'x'.repeat(50_000);
    const r = applyToolResultBudget(
      [
        { type: 'tool_result', tool_use_id: '1', content: big },
        { type: 'tool_result', tool_use_id: '2', content: big },
        { type: 'tool_result', tool_use_id: '3', content: big },
      ],
      { maxTotalChars: 40_000, maxOneChars: 30_000 },
    );
    expect(r.totalChars).toBeLessThanOrEqual(40_000);
    expect(r.results.every((x) => x.content.includes('truncated') || x.content.length < 50_000)).toBe(
      true,
    );
  });
});

describe('formatToolBatchSummary', () => {
  it('summarizes tools', () => {
    const s = formatToolBatchSummary([
      { name: 'read_file', success: true, path: 'a.ts' },
      { name: 'read_file', success: true, path: 'b.ts' },
      { name: 'run_command', success: false },
    ]);
    expect(s).toMatch(/3 call/);
    expect(s).toMatch(/read_file/);
    expect(s).toMatch(/2 ok/);
    expect(s).toMatch(/1 failed/);
  });
});
