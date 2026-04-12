import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

export interface CompactionResult {
  messages: MessageParam[];
  droppedCount: number;
  summaryNotice: string;
}

function messageText(message: MessageParam): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((block: any) => (block?.type === 'text' ? String(block.text || '') : ''))
      .join('\n');
  }
  return '';
}

function shouldPreserve(message: MessageParam): boolean {
  const text = messageText(message);
  return (
    text.includes('[[PLAN_READY]]') ||
    text.includes('[[TASK_COMPLETE') ||
    text.includes('[SYSTEM]') ||
    text.includes('Plan approved')
  );
}

export function compactConversation(
  messages: MessageParam[],
  keepRecentCount = 16,
): CompactionResult {
  if (messages.length <= keepRecentCount) {
    return {
      messages,
      droppedCount: 0,
      summaryNotice: '',
    };
  }

  const recent = messages.slice(-keepRecentCount);
  const preserved = messages.slice(0, -keepRecentCount).filter(shouldPreserve);
  const droppedCount = messages.length - (recent.length + preserved.length);
  const summaryNotice = `Conversation was compacted: dropped ${droppedCount} stale messages, kept ${preserved.length} critical and ${recent.length} recent messages.`;

  const compacted: MessageParam[] = [
    {
      role: 'assistant',
      content: summaryNotice,
    },
    ...preserved,
    ...recent,
  ];

  return {
    messages: compacted,
    droppedCount,
    summaryNotice,
  };
}
