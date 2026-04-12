import { describe, expect, it } from 'vitest';
import { HistoryManager } from '../src/core/history-manager.js';

describe('HistoryManager', () => {
  it('summarizes title from first sentence', () => {
    const summary = HistoryManager.summarizeTitle('Fix auth flow. Add tests for edge cases.');
    expect(summary).toBe('Fix auth flow.');
  });
});
