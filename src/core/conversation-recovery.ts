import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { ChatSession } from './session-manager.js';
import { cleanupTranscript } from './transcript-cleanup.js';

export interface ConversationRecoveryResult {
  session: ChatSession;
  wasRecovered: boolean;
  wasInterrupted: boolean;
  droppedMessages: number;
}

export function recoverConversation(session: ChatSession): ConversationRecoveryResult {
  const cleanup = cleanupTranscript(session.messages as MessageParam[]);

  const recoveredSession: ChatSession = {
    ...session,
    messages: cleanup.messages,
  };

  return {
    session: recoveredSession,
    wasRecovered: cleanup.droppedMessages > 0 || cleanup.wasInterrupted,
    wasInterrupted: cleanup.wasInterrupted,
    droppedMessages: cleanup.droppedMessages,
  };
}
