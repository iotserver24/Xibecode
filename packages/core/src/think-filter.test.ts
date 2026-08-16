import { describe, expect, it } from 'vitest';
import {
  ThinkTagFilter,
  extractAnthropicThinkingDelta,
  extractDeltaReasoning,
  extractDeltaText,
} from './think-filter.js';

describe('ThinkTagFilter', () => {
  it('splits a complete think block from reply text', () => {
    const out = ThinkTagFilter.split('Hello <think>plan the edit</think>world');
    expect(out.text).toBe('Hello world');
    expect(out.thinking).toBe('plan the edit');
  });

  it('handles thinking and thought aliases case-insensitively', () => {
    const out = ThinkTagFilter.split('<THINKING>why</THINKING>ok<Thought>next</Thought>');
    expect(out.text).toBe('ok');
    expect(out.thinking).toBe('whynext');
  });

  it('streams tags split across chunks', () => {
    const filter = new ThinkTagFilter();
    expect(filter.push('Hi <th')).toEqual({ text: 'Hi ', thinking: '' });
    expect(filter.push('ink>reason')).toEqual({ text: '', thinking: 'reason' });
    expect(filter.push('ing</thi')).toEqual({ text: '', thinking: 'ing' });
    expect(filter.push('nk> done')).toEqual({ text: ' done', thinking: '' });
    expect(filter.flush()).toEqual({ text: '', thinking: '' });
  });

  it('strips think blocks from finished strings', () => {
    expect(ThinkTagFilter.strip('a<think>hidden</think>b')).toBe('ab');
  });
});

describe('delta extractors', () => {
  it('reads OpenAI-compat reasoning_content separately from text', () => {
    const delta = {
      content: 'answer',
      reasoning_content: 'let me think',
    };
    expect(extractDeltaText(delta)).toBe('answer');
    expect(extractDeltaReasoning(delta)).toBe('let me think');
  });

  it('reads array content thinking blocks', () => {
    const delta = {
      content: [
        { type: 'thinking', thinking: 'step 1' },
        { type: 'text', text: 'hi' },
      ],
    };
    expect(extractDeltaText(delta)).toBe('hi');
    expect(extractDeltaReasoning(delta)).toBe('step 1');
  });

  it('reads Anthropic thinking_delta events', () => {
    expect(
      extractAnthropicThinkingDelta({
        type: 'content_block_delta',
        delta: { type: 'thinking_delta', thinking: 'hmm' },
      }),
    ).toBe('hmm');
  });
});
