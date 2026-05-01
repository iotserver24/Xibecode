import type { ChatSession } from './session-manager.js';

export interface DebugSnapshot {
  sessionId?: string;
  messageCount: number;
  lastUserMessage?: string;
  notes: string[];
}

export function buildDebugSnapshot(session: ChatSession | null, notes: string[] = []): DebugSnapshot {
  if (!session) {
    return {
      messageCount: 0,
      notes: ['No active session found', ...notes].slice(0, 12),
    };
  }

  const messages = session.messages || [];
  const userMessages = messages.filter((msg: any) => msg.role === 'user');
  const lastUser = userMessages[userMessages.length - 1];
  const lastUserMessage = typeof lastUser?.content === 'string' ? lastUser.content : undefined;

  return {
    sessionId: session.id,
    messageCount: messages.length,
    lastUserMessage: lastUserMessage?.slice(0, 400),
    notes: notes.slice(0, 12),
  };
}
