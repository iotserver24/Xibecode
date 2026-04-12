import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

export interface TranscriptCleanupResult {
  messages: MessageParam[];
  wasInterrupted: boolean;
  droppedMessages: number;
}

function hasMeaningfulContent(message: MessageParam): boolean {
  if (typeof message.content === 'string') {
    return message.content.trim().length > 0;
  }

  if (Array.isArray(message.content)) {
    return message.content.some((block: any) => {
      if (block?.type === 'text') return String(block.text || '').trim().length > 0;
      if (block?.type === 'tool_use') return true;
      if (block?.type === 'tool_result') return true;
      return false;
    });
  }

  return false;
}

function isInterruptedTurn(messages: MessageParam[]): boolean {
  if (messages.length === 0) return false;
  const last = messages[messages.length - 1];
  if (last.role !== 'assistant') return false;
  return !hasMeaningfulContent(last);
}

export function cleanupTranscript(messages: MessageParam[]): TranscriptCleanupResult {
  let droppedMessages = 0;
  const cleaned = messages.filter((message) => {
    if (!message || (message.role !== 'user' && message.role !== 'assistant')) {
      droppedMessages += 1;
      return false;
    }

    if (!hasMeaningfulContent(message)) {
      droppedMessages += 1;
      return false;
    }

    return true;
  });

  const interrupted = isInterruptedTurn(messages);
  if (interrupted) {
    cleaned.push({
      role: 'user',
      content: 'Continue from where you left off.',
    });
  }

  return {
    messages: cleaned,
    wasInterrupted: interrupted,
    droppedMessages,
  };
}
