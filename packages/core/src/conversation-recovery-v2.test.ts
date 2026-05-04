/**
 * Tests for conversation recovery v2 (3-way interruption detection).
 */

import { describe, it, expect } from 'vitest';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import {
  deserializeMessagesWithInterruptDetection,
  recoverConversationV2,
  assertResumeMessageSize,
  ResumeTranscriptTooLargeError,
} from './conversation-recovery-v2.js';
import type { Entry } from './transcript-types.js';
import { generateUuid } from './transcript-types.js';

function makeEntry(type: 'user' | 'assistant' | 'system', message: MessageParam): Entry {
  return {
    type,
    uuid: generateUuid(),
    parentUuid: null,
    timestamp: new Date().toISOString(),
    sessionId: 'test',
    message,
  } as Entry;
}

describe('deserializeMessagesWithInterruptDetection', () => {
  it('should detect no interruption when assistant is last', () => {
    const entries: Entry[] = [
      makeEntry('user', { role: 'user', content: 'hello' }),
      makeEntry('assistant', { role: 'assistant', content: 'hi there' }),
    ];

    const result = deserializeMessagesWithInterruptDetection(entries);
    expect(result.turnInterruptionState.kind).toBe('none');
  });

  it('should detect interrupted_prompt when user text is last', () => {
    const entries: Entry[] = [
      makeEntry('assistant', { role: 'assistant', content: 'response' }),
      makeEntry('user', { role: 'user', content: 'next prompt' }),
    ];

    const result = deserializeMessagesWithInterruptDetection(entries);
    expect(result.turnInterruptionState.kind).toBe('interrupted_prompt');
  });

  it('should detect interrupted_turn when tool_result is last', () => {
    const entries: Entry[] = [
      makeEntry('assistant', {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tool-1', name: 'read_file', input: { path: 'test.ts' } },
        ],
      }),
      makeEntry('user', {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tool-1', content: 'file content' },
        ],
      }),
    ];

    const result = deserializeMessagesWithInterruptDetection(entries);
    expect(result.turnInterruptionState.kind).toBe('interrupted_prompt'); // interrupted_turn gets converted to interrupted_prompt
    // Should have auto-continue message appended
    expect(result.messages.some((m) =>
      typeof m.content === 'string' && m.content.includes('Continue from where you left off'),
    )).toBe(true);
  });

  it('should filter whitespace-only assistant messages', () => {
    const entries: Entry[] = [
      makeEntry('user', { role: 'user', content: 'hello' }),
      makeEntry('assistant', { role: 'assistant', content: '\n\n' }),
      makeEntry('assistant', { role: 'assistant', content: 'actual response' }),
    ];

    const result = deserializeMessagesWithInterruptDetection(entries);
    // The whitespace-only assistant message should be filtered
    const assistantMessages = result.messages.filter((m) => m.role === 'assistant');
    expect(assistantMessages.length).toBe(1);
  });

  it('should handle empty entries', () => {
    const result = deserializeMessagesWithInterruptDetection([]);
    expect(result.messages.length).toBe(0);
    expect(result.turnInterruptionState.kind).toBe('none');
  });
});

describe('assertResumeMessageSize', () => {
  it('should not throw for small messages', () => {
    const messages: MessageParam[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ];
    expect(() => assertResumeMessageSize(messages)).not.toThrow();
  });

  it('should throw for oversized messages', () => {
    // Create a message that exceeds 8 MiB
    const hugeContent = 'x'.repeat(9 * 1024 * 1024);
    const messages: MessageParam[] = [
      { role: 'user', content: hugeContent },
    ];
    expect(() => assertResumeMessageSize(messages)).toThrow(ResumeTranscriptTooLargeError);
  });
});

describe('recoverConversationV2', () => {
  it('should return wasRecovered=true when interrupted', () => {
    const entries: Entry[] = [
      makeEntry('user', { role: 'user', content: 'prompt' }),
    ];

    const result = recoverConversationV2(entries);
    expect(result.wasRecovered).toBe(true);
    expect(result.wasInterrupted).toBe(true);
  });

  it('should return wasRecovered=false for normal conversation', () => {
    const entries: Entry[] = [
      makeEntry('user', { role: 'user', content: 'prompt' }),
      makeEntry('assistant', { role: 'assistant', content: 'response' }),
    ];

    const result = recoverConversationV2(entries);
    expect(result.wasRecovered).toBe(false);
  });
});
