import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

export interface CompactionResult {
  messages: MessageParam[];
  droppedCount: number;
  summaryNotice: string;
  groundedFacts: string[];
  conversationSummary?: string;
}

function messageText(message: MessageParam): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((block: any) => {
        if (block?.type === 'text') return String(block.text || '');
        if (block?.type === 'tool_use') return `[tool_use:${String(block.name || 'unknown')}]`;
        if (block?.type === 'tool_result') return `[tool_result:${String(block.tool_use_id || 'unknown')}]`;
        return String(block?.content ?? '');
      })
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

function parseToolResultFacts(message: MessageParam): string[] {
  if (!Array.isArray(message.content)) return [];
  const facts: string[] = [];
  for (const block of message.content as any[]) {
    if (block?.type !== 'tool_result') continue;
    const raw = typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? {});
    let payload: any = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
    if (!payload || typeof payload !== 'object') continue;
    if (typeof payload.path === 'string') {
      facts.push(`Touched file: ${payload.path}`);
    }
    if (typeof payload.linesChanged === 'number') {
      facts.push(`Edited ${payload.linesChanged} line(s)`);
    }
    if (typeof payload.exitCode === 'number') {
      facts.push(`Command exit code: ${payload.exitCode}`);
    }
    if (typeof payload.totalFiles === 'number') {
      facts.push(`Context files: ${payload.totalFiles}`);
    }
    if (typeof payload.match_count === 'number') {
      facts.push(`Search matches: ${payload.match_count}`);
    }
  }
  return facts;
}

function buildGroundedFacts(messages: MessageParam[]): string[] {
  const out: string[] = [];
  for (const message of messages) {
    const text = messageText(message);
    if (text.includes('[[TASK_COMPLETE')) {
      out.push('Task completion marker observed');
    }
    for (const fact of parseToolResultFacts(message)) {
      out.push(fact);
    }
  }
  return Array.from(new Set(out)).slice(-12);
}

function summarizeText(text: string, maxLen = 120): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1)}…`;
}

function buildConversationSummary(messages: MessageParam[]): string {
  const userTurns: string[] = [];
  const assistantTurns: string[] = [];
  for (const message of messages) {
    const text = messageText(message);
    if (!text) continue;
    if (message.role === 'user') {
      userTurns.push(summarizeText(text));
    } else if (message.role === 'assistant') {
      assistantTurns.push(summarizeText(text));
    }
  }

  const latestUser = userTurns.slice(-4);
  const latestAssistant = assistantTurns.slice(-4);
  const sections: string[] = [];
  if (latestUser.length > 0) {
    sections.push(
      'Recent user intents:\n' +
        latestUser.map((line, idx) => `${idx + 1}. ${line}`).join('\n'),
    );
  }
  if (latestAssistant.length > 0) {
    sections.push(
      'Recent assistant outcomes:\n' +
        latestAssistant.map((line, idx) => `${idx + 1}. ${line}`).join('\n'),
    );
  }
  return sections.join('\n\n').trim();
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
      groundedFacts: [],
      conversationSummary: '',
    };
  }

  const older = messages.slice(0, -keepRecentCount);
  const recent = messages.slice(-keepRecentCount);
  const preserved = older.filter(shouldPreserve);
  const groundedFacts = buildGroundedFacts(older);
  const conversationSummary = buildConversationSummary(older);
  const droppedCount = messages.length - (recent.length + preserved.length);
  const summaryNotice =
    `Conversation was compacted: dropped ${droppedCount} stale messages, ` +
    `kept ${preserved.length} critical and ${recent.length} recent messages.`;

  const compacted: MessageParam[] = [
    {
      role: 'assistant',
      content: summaryNotice,
    },
    ...(groundedFacts.length > 0
      ? [
          {
            role: 'assistant' as const,
            content: `[Grounded Facts Ledger]\n${groundedFacts.map((fact) => `- ${fact}`).join('\n')}`,
          },
        ]
      : []),
    ...(conversationSummary
      ? [
          {
            role: 'assistant' as const,
            content: `[Conversation Summary]\n${conversationSummary}`,
          },
        ]
      : []),
    ...preserved,
    ...recent,
  ];

  return {
    messages: compacted,
    droppedCount,
    summaryNotice,
    groundedFacts,
    conversationSummary,
  };
}
