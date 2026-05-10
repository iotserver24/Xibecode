import { describe, expect, it } from 'vitest';
import { EnhancedAgent } from './agent.js';

describe('EnhancedAgent anthropic message normalization', () => {
  it('converts image_url data URLs into Anthropic image source blocks', () => {
    const agent = new EnhancedAgent({
      apiKey: 'test-key',
      model: 'claude-3-5-sonnet-latest',
      requestFormat: 'anthropic',
    });

    agent.setMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look at this' },
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/png;base64,aGVsbG8=',
            },
          },
        ] as any,
      },
    ] as any);

    const normalized = (agent as any).buildAnthropicMessages();
    const userMessage = normalized[0];
    expect(userMessage.role).toBe('user');
    expect(Array.isArray(userMessage.content)).toBe(true);
    expect(userMessage.content).toEqual([
      { type: 'text', text: 'look at this' },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'aGVsbG8=',
        },
      },
    ]);
  });

  it('keeps tool_result blocks unchanged in Anthropic normalization', () => {
    const agent = new EnhancedAgent({
      apiKey: 'test-key',
      model: 'claude-3-5-sonnet-latest',
      requestFormat: 'anthropic',
    });

    const toolResultBlock = {
      type: 'tool_result',
      tool_use_id: 'tool-1',
      content: '{"ok":true}',
      is_error: false,
    };

    agent.setMessages([
      {
        role: 'user',
        content: [toolResultBlock] as any,
      },
    ] as any);

    const normalized = (agent as any).buildAnthropicMessages();
    expect(normalized[0]?.content).toEqual([toolResultBlock]);
  });
});
