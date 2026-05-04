/**
 * Enhanced conversation recovery with 3-way interruption detection.
 *
 * Replaces the basic transcript-cleanup.ts with:
 * - 3-way interruption detection: none, interrupted_prompt, interrupted_turn
 * - Filtering of unresolved tool uses (orphaned tool_use without tool_result)
 * - Filtering of orphaned thinking-only messages
 * - Filtering of whitespace-only assistant messages
 * - Auto-continue: appends "Continue from where you left off." for interrupted_turn
 * - 8 MiB resume size guard to prevent OOM on oversized transcripts
 *
 * @module conversation-recovery-v2
 */

import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { Entry } from './transcript-types.js';

// ─── Constants ──────────────────────────────────────────────────

/** Hard cap for reconstructed resume payloads (8 MiB). */
const MAX_RESUME_MESSAGE_BYTES = 8 * 1024 * 1024;

// ─── Error Types ────────────────────────────────────────────────

export class ResumeTranscriptTooLargeError extends Error {
  constructor(
    readonly bytes: number,
    readonly maxBytes: number,
    readonly messageCount: number,
  ) {
    super(
      `Reconstructed transcript is too large to resume safely (${(
        bytes /
        (1024 * 1024)
      ).toFixed(1)} MiB > ${(maxBytes / (1024 * 1024)).toFixed(1)} MiB, ${messageCount} messages).`,
    );
    this.name = 'ResumeTranscriptTooLargeError';
  }
}

// ─── Interruption Detection Types ───────────────────────────────

/** Turn interruption state: detected when resuming a conversation. */
export type TurnInterruptionState =
  | { kind: 'none' }
  | { kind: 'interrupted_prompt'; message: MessageParam }
  | { kind: 'interrupted_turn' };

/** Result of deserialization with interruption detection. */
export interface DeserializeResult {
  messages: MessageParam[];
  turnInterruptionState: TurnInterruptionState;
}

// ─── Helpers ────────────────────────────────────────────────────

/** Safely read a string field from an unknown block. */
function blockType(block: unknown): string | undefined {
  if (typeof block === 'object' && block !== null) {
    return (block as Record<string, unknown>).type as string | undefined;
  }
  return undefined;
}

/** Safely read a string field from an unknown block. */
function blockField(block: unknown, field: string): unknown {
  if (typeof block === 'object' && block !== null) {
    return (block as Record<string, unknown>)[field];
  }
  return undefined;
}

// ─── Message Filtering ──────────────────────────────────────────

/** Check if a message has meaningful content. */
function hasMeaningfulContent(message: MessageParam): boolean {
  if (typeof message.content === 'string') {
    return message.content.trim().length > 0;
  }
  if (Array.isArray(message.content)) {
    return message.content.some((block) => {
      const t = blockType(block);
      if (t === 'text') return String(blockField(block, 'text') || '').trim().length > 0;
      if (t === 'tool_use') return true;
      if (t === 'tool_result') return true;
      if (t === 'thinking') return true;
      if (t === 'redacted_thinking') return true;
      return false;
    });
  }
  return false;
}

/**
 * Check if an assistant message has only thinking/redacted_thinking content blocks
 * with no other meaningful content.
 */
function isOrphanedThinkingOnly(message: MessageParam): boolean {
  if (message.role !== 'assistant') return false;
  if (!Array.isArray(message.content)) return false;

  const nonThinkingBlocks = message.content.filter(
    (block) => blockType(block) !== 'thinking' && blockType(block) !== 'redacted_thinking',
  );
  return nonThinkingBlocks.length === 0;
}

/**
 * Check if an assistant message has only whitespace text content.
 */
function isWhitespaceOnlyAssistant(message: MessageParam): boolean {
  if (message.role !== 'assistant') return false;
  if (typeof message.content === 'string') {
    return message.content.trim().length === 0;
  }
  if (Array.isArray(message.content)) {
    const nonEmpty = message.content.filter((block) => {
      const t = blockType(block);
      if (t === 'text') return String(blockField(block, 'text') || '').trim().length > 0;
      if (t === 'tool_use') return true;
      return false;
    });
    return nonEmpty.length === 0;
  }
  return false;
}

/**
 * Filter unresolved tool uses from messages.
 */
function filterUnresolvedToolUses(messages: MessageParam[]): MessageParam[] {
  const toolUseIds = new Set<string>();
  const toolResultIds = new Set<string>();

  // Collect all tool_use IDs and tool_result IDs
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        const t = blockType(block);
        if (t === 'tool_use') {
          const id = blockField(block, 'id');
          if (typeof id === 'string') toolUseIds.add(id);
        }
        if (t === 'tool_result') {
          const toolUseId = blockField(block, 'tool_use_id');
          if (typeof toolUseId === 'string') toolResultIds.add(toolUseId);
        }
      }
    }
  }

  // Find unresolved tool_use IDs
  const unresolvedIds = new Set<string>();
  for (const id of toolUseIds) {
    if (!toolResultIds.has(id)) {
      unresolvedIds.add(id);
    }
  }

  if (unresolvedIds.size === 0) return messages;

  // Filter
  const result: MessageParam[] = [];
  const skipToolResultIds = new Set(unresolvedIds);

  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const filtered = msg.content.filter(
        (block) => !(blockType(block) === 'tool_use' && unresolvedIds.has(blockField(block, 'id') as string)),
      );

      if (filtered.length === 0) continue;

      const nonThinking = filtered.filter(
        (block) => blockType(block) !== 'thinking' && blockType(block) !== 'redacted_thinking',
      );
      if (nonThinking.length === 0) continue;

      result.push({ ...msg, content: filtered });
    } else if (msg.role === 'user' && Array.isArray(msg.content)) {
      const filtered = msg.content.filter(
        (block) => !(blockType(block) === 'tool_result' && skipToolResultIds.has(blockField(block, 'tool_use_id') as string)),
      );
      if (filtered.length === 0) continue;
      result.push({ ...msg, content: filtered });
    } else {
      result.push(msg);
    }
  }

  return result;
}

/**
 * Strip thinking/redacted_thinking content blocks from assistant messages.
 */
function stripThinkingBlocks(messages: MessageParam[]): MessageParam[] {
  return messages.reduce<MessageParam[]>((acc, msg) => {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) {
      acc.push(msg);
      return acc;
    }
    const filtered = msg.content.filter(
      (block) => blockType(block) !== 'thinking' && blockType(block) !== 'redacted_thinking',
    );
    if (filtered.length === 0) return acc;
    acc.push({ ...msg, content: filtered });
    return acc;
  }, []);
}

// ─── Interruption Detection ─────────────────────────────────────

/**
 * Detect whether the conversation was interrupted mid-turn.
 */
function detectTurnInterruption(messages: MessageParam[]): TurnInterruptionState {
  if (messages.length === 0) return { kind: 'none' };

  let lastIdx = messages.length - 1;
  while (lastIdx >= 0) {
    const msg = messages[lastIdx];
    if (msg.role === 'user' || msg.role === 'assistant') break;
    lastIdx--;
  }

  if (lastIdx < 0) return { kind: 'none' };
  const lastMessage = messages[lastIdx];

  if (lastMessage.role === 'assistant') {
    return { kind: 'none' };
  }

  if (lastMessage.role === 'user') {
    if (isMetaUserMessage(lastMessage)) return { kind: 'none' };
    if (isToolUseResultMessage(lastMessage)) {
      return { kind: 'interrupted_turn' };
    }
    return { kind: 'interrupted_prompt', message: lastMessage };
  }

  return { kind: 'none' };
}

function isMetaUserMessage(message: MessageParam): boolean {
  if (typeof message.content === 'string') {
    return message.content.trim() === 'Continue from where you left off.';
  }
  return false;
}

function isToolUseResultMessage(message: MessageParam): boolean {
  if (!Array.isArray(message.content)) return false;
  return message.content.some(
    (block) => blockType(block) === 'tool_result',
  );
}

// ─── Size Guard ─────────────────────────────────────────────────

export function assertResumeMessageSize(messages: MessageParam[]): void {
  const bytes = Buffer.byteLength(JSON.stringify(messages), 'utf8');
  if (bytes > MAX_RESUME_MESSAGE_BYTES) {
    throw new ResumeTranscriptTooLargeError(bytes, MAX_RESUME_MESSAGE_BYTES, messages.length);
  }
}

// ─── Main Deserialization ───────────────────────────────────────

export function deserializeMessagesWithInterruptDetection(
  entries: Entry[],
): DeserializeResult {
  // Extract MessageParam from transcript entries
  const rawMessages: MessageParam[] = [];
  for (const entry of entries) {
    if (entry.type === 'user' || entry.type === 'assistant' || entry.type === 'system') {
      const msg = (entry as unknown as { message: MessageParam }).message;
      if (msg && (msg.role === 'user' || msg.role === 'assistant')) {
        rawMessages.push(msg);
      }
    }
  }

  // Filter unresolved tool uses
  const filteredToolUses = filterUnresolvedToolUses(rawMessages);

  // Filter orphaned thinking-only assistant messages
  const filteredThinking = filteredToolUses.filter(
    (msg) => !isOrphanedThinkingOnly(msg),
  );

  // Filter whitespace-only assistant messages
  const filteredWhitespace = filteredThinking.filter(
    (msg) => !isWhitespaceOnlyAssistant(msg),
  );

  const messages = filteredWhitespace;

  // Detect interruption
  const interruptionState = detectTurnInterruption(messages);

  let turnInterruptionState: TurnInterruptionState;
  if (interruptionState.kind === 'interrupted_turn') {
    messages.push({
      role: 'user',
      content: 'Continue from where you left off.',
    });
    turnInterruptionState = { kind: 'interrupted_prompt', message: messages[messages.length - 1] };
  } else {
    turnInterruptionState = interruptionState;
  }

  // Append a synthetic assistant sentinel after the last user message
  const lastIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user' || messages[i].role === 'assistant') return i;
    }
    return -1;
  })();
  if (lastIdx !== -1 && messages[lastIdx].role === 'user') {
    messages.splice(lastIdx + 1, 0, {
      role: 'assistant',
      content: '',
    });
  }

  return { messages, turnInterruptionState };
}

export function deserializeMessages(entries: Entry[]): MessageParam[] {
  return deserializeMessagesWithInterruptDetection(entries).messages;
}

export function recoverConversationV2(entries: Entry[]): {
  messages: MessageParam[];
  wasRecovered: boolean;
  wasInterrupted: boolean;
  turnInterruptionState: TurnInterruptionState;
} {
  const result = deserializeMessagesWithInterruptDetection(entries);
  assertResumeMessageSize(result.messages);

  return {
    messages: result.messages,
    wasRecovered: result.turnInterruptionState.kind !== 'none',
    wasInterrupted: result.turnInterruptionState.kind !== 'none',
    turnInterruptionState: result.turnInterruptionState,
  };
}
