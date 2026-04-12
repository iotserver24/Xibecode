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

  it('preserves grounded facts from older tool results', () => {
    const messages: any[] = [
      { role: 'user', content: 'start' },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'a1',
            content: JSON.stringify({ path: 'src/index.ts', linesChanged: 3 }),
          },
        ],
      },
      ...Array.from({ length: 20 }).map((_, i) => ({ role: 'assistant', content: `message-${i}` })),
    ];
    const compacted = compactConversation(messages as any, 6);
    expect(compacted.groundedFacts.length).toBeGreaterThan(0);
    expect(compacted.messages.some((m: any) => String(m.content).includes('[Grounded Facts Ledger]'))).toBe(
      true,
    );
  });

  it('adds conversation summary for compacted older messages', () => {
    const messages: any[] = [
      { role: 'user', content: 'Please refactor auth middleware and keep compatibility.' },
      { role: 'assistant', content: 'I will inspect auth, sessions, and route guards first.' },
      ...Array.from({ length: 30 }).map((_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `turn-${i} with context`,
      })),
    ];
    const compacted = compactConversation(messages as any, 10);
    expect(compacted.conversationSummary?.length ?? 0).toBeGreaterThan(0);
    expect(compacted.messages.some((m: any) => String(m.content).includes('[Conversation Summary]'))).toBe(
      true,
    );
  });
});
