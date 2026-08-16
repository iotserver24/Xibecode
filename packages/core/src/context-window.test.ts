import { describe, expect, it } from 'vitest';
import {
  extractContextLimit,
  formatTokenCount,
  heuristicContextWindow,
  usagePercent,
} from './context-window.js';

describe('heuristicContextWindow', () => {
  it('maps common families', () => {
    expect(heuristicContextWindow('claude-sonnet-4-6')).toBe(200_000);
    expect(heuristicContextWindow('gpt-4o')).toBe(128_000);
    expect(heuristicContextWindow('deepseek-chat')).toBe(128_000);
    expect(heuristicContextWindow('grok-3')).toBe(131_072);
  });
});

describe('extractContextLimit', () => {
  it('reads models.dev limit.context', () => {
    expect(extractContextLimit({ limit: { context: 200000, output: 64000 } })).toBe(200000);
    expect(extractContextLimit({ context_length: 65536 })).toBe(65536);
    expect(extractContextLimit({})).toBe(0);
  });
});

describe('formatTokenCount', () => {
  it('uses compact k/m labels', () => {
    expect(formatTokenCount(842)).toBe('842');
    expect(formatTokenCount(12400)).toBe('12k');
    expect(formatTokenCount(200000)).toBe('200k');
    expect(usagePercent(50_000, 200_000)).toBe(25);
  });
});
