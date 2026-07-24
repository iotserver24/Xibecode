import { describe, expect, it } from 'vitest';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import {
  compactConversation,
  shouldTriggerAutoCompact,
  resolveCompactTriggerTokens,
  selectProtectedTail,
  estimateMessagesTokensRough,
  COMPACTION_STATUS,
  COMPACTION_STATUS_MARKER,
} from './context-compactor.js';

function user(text: string): MessageParam {
  return { role: 'user', content: text };
}
function assistant(text: string): MessageParam {
  return { role: 'assistant', content: text };
}

describe('auto-compact thresholds', () => {
  it('triggers near 75% for typical 128k windows', () => {
    const window = 128_000;
    const trigger = resolveCompactTriggerTokens(window, 13_000);
    // min(0.75*128k, 128k-13k) = min(96000, 115000) = 96000
    expect(trigger).toBe(96_000);
    expect(shouldTriggerAutoCompact(95_999, window)).toBe(false);
    expect(shouldTriggerAutoCompact(96_000, window)).toBe(true);
  });

  it('status line is user-visible', () => {
    expect(COMPACTION_STATUS).toContain(COMPACTION_STATUS_MARKER);
    expect(COMPACTION_STATUS).toMatch(/🗜️/);
  });
});

describe('selectProtectedTail', () => {
  it('keeps a token-budget tail and does not orphan tool_result', () => {
    const messages: MessageParam[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push(user(`old user turn ${i} ${'x'.repeat(200)}`));
      messages.push(assistant(`old assistant turn ${i} ${'y'.repeat(200)}`));
    }
    // tool pair at end
    messages.push({
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 't1', name: 'read_file', input: { path: 'a.ts' } },
      ],
    } as any);
    messages.push({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 't1', content: 'file body '.repeat(50) },
      ],
    } as any);

    const { head, tail } = selectProtectedTail(messages, {
      tailTokenBudget: 2_000,
      minTailMessages: 4,
      maxTailMessages: 12,
    });
    expect(tail.length).toBeGreaterThanOrEqual(4);
    expect(head.length + tail.length).toBe(messages.length);
    // tail should include the tool_use if it includes tool_result
    const hasResult = tail.some(
      (m) =>
        Array.isArray(m.content) &&
        (m.content as any[]).some((b) => b.type === 'tool_result'),
    );
    if (hasResult) {
      const hasUse = tail.some(
        (m) =>
          Array.isArray(m.content) &&
          (m.content as any[]).some((b) => b.type === 'tool_use'),
      );
      expect(hasUse).toBe(true);
    }
  });
});

describe('compactConversation', () => {
  it('folds older turns into a handoff and keeps recent', () => {
    const messages: MessageParam[] = [];
    for (let i = 0; i < 30; i++) {
      messages.push(user(`Please do task ${i}: fix the ${i}th bug in the app`));
      messages.push(
        assistant(`I fixed bug ${i} by editing packages/cli/src/foo.ts line ${i}`),
      );
    }
    const beforeTokens = estimateMessagesTokensRough(messages);
    const result = compactConversation(messages, {
      contextWindow: 32_000,
      tailTokenBudget: 3_000,
      minTailMessages: 6,
      maxTailMessages: 16,
    });
    expect(result.droppedCount).toBeGreaterThan(0);
    expect(result.messages.length).toBeLessThan(messages.length);
    const first = result.messages[0]!;
    const text =
      typeof first.content === 'string' ? first.content : JSON.stringify(first.content);
    expect(text).toMatch(/Context compaction handoff|Conversation was compacted/);
    expect(result.summaryNotice).toMatch(/compacted/i);
    const after = result.estimatedTokensAfter ?? estimateMessagesTokensRough(result.messages);
    expect(after).toBeLessThan(beforeTokens);
  });

  it('preserves PLAN_READY markers from the head', () => {
    const messages: MessageParam[] = [
      user('plan this'),
      assistant('Here is the plan [[PLAN_READY]]\n1. do x\n2. do y'),
      ...Array.from({ length: 20 }, (_, i) =>
        i % 2 === 0 ? user(`followup ${i}`) : assistant(`reply ${i}`),
      ),
    ];
    const result = compactConversation(messages, {
      contextWindow: 16_000,
      tailTokenBudget: 1_500,
      minTailMessages: 4,
      maxTailMessages: 10,
    });
    const all = result.messages.map((m) =>
      typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    );
    expect(all.some((t) => t.includes('PLAN_READY') || t.includes('plan'))).toBe(true);
  });
});
