import { describe, expect, it } from 'vitest';
import { compactConversation } from '../src/core/context-compactor.js';

describe('compactConversation', () => {
  it('keeps recent and critical messages', () => {
    const messages = Array.from({ length: 30 }).map((_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: i === 5 ? '[[PLAN_READY]] keep me' : `message-${i}`,
    }));

    const compacted = compactConversation(messages as any, 8);
    expect(compacted.messages.length).toBeLessThan(messages.length + 1);
    const content = compacted.messages.map((m: any) => m.content).join('\n');
    expect(content).toContain('[[PLAN_READY]]');
  });
});
