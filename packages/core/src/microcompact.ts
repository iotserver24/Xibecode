/**
 * Microcompact - Lightweight context reduction without full compaction.
 *
 * Three sub-paths:
 *   1. Time-based: Strip old tool results (>10 turns) when approaching context limit
 *   2. Cache-edit: Mark tool results as ephemeral via Anthropic's cache control API
 *   3. Auto-compact trigger: Check token budget and trigger full compaction when needed
 *
 * Circuit breaker: After 3 consecutive compaction failures, stop attempting.
 */

import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

export interface MicrocompactResult {
  messages: MessageParam[];
  /** Number of tool results stripped */
  strippedCount: number;
  /** Number of tool results marked ephemeral */
  ephemeralCount: number;
  /** Whether full compaction was triggered */
  triggeredFullCompact: boolean;
  /** Reason for the action taken */
  reason: string;
}

export interface MicrocompactOptions {
  /** Current messages */
  messages: MessageParam[];
  /** Estimated token count */
  tokenCount: number;
  /** Maximum context window tokens */
  contextWindow: number;
  /** Threshold before auto-compact triggers (default: 13000) */
  compactThreshold?: number;
  /** Number of recent turns to preserve in time-based strip (default: 10) */
  preserveRecentTurns?: number;
  /** Whether to use cache editing (default: true when available) */
  useCacheEdit?: boolean;
}

/** Track consecutive compaction failures for circuit breaker */
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Reset the circuit breaker (call at start of a new session).
 */
export function resetMicrocompactCircuitBreaker(): void {
  consecutiveFailures = 0;
}

/**
 * Run microcompact on the message list.
 *
 * Checks token budget and applies the appropriate reduction strategy:
 * 1. If approaching limit, strip old tool results (time-based)
 * 2. If still over budget, mark tool results as ephemeral (cache-edit)
 * 3. If still over budget, signal that full compaction is needed
 */
export function microcompact(options: MicrocompactOptions): MicrocompactResult {
  const {
    messages,
    tokenCount,
    contextWindow,
    compactThreshold = 13000,
    preserveRecentTurns = 10,
    useCacheEdit = true,
  } = options;

  const result: MicrocompactResult = {
    messages,
    strippedCount: 0,
    ephemeralCount: 0,
    triggeredFullCompact: false,
    reason: '',
  };

  // Check if we're approaching the context limit
  const effectiveLimit = contextWindow - compactThreshold;
  if (tokenCount < effectiveLimit) {
    result.reason = 'Token budget sufficient, no action needed';
    return result;
  }

  // Circuit breaker check
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    result.reason = `Circuit breaker active after ${consecutiveFailures} consecutive failures`;
    return result;
  }

  // Phase 1: Time-based microcompact - strip old tool results
  const timeResult = timeBasedMicrocompact(messages, preserveRecentTurns);
  result.messages = timeResult.messages;
  result.strippedCount = timeResult.strippedCount;

  // Re-estimate token count after stripping
  const estimatedSavings = result.strippedCount * 500; // rough estimate
  const newTokenCount = tokenCount - estimatedSavings;

  if (newTokenCount < effectiveLimit) {
    result.reason = `Stripped ${result.strippedCount} old tool results, budget now sufficient`;
    consecutiveFailures = 0;
    return result;
  }

  // Phase 2: Cache-edit microcompact - mark tool results as ephemeral
  if (useCacheEdit) {
    const cacheResult = cacheEditMicrocompact(result.messages);
    result.messages = cacheResult.messages;
    result.ephemeralCount = cacheResult.ephemeralCount;

    if (result.ephemeralCount > 0) {
      const cacheSavings = result.ephemeralCount * 400;
      const afterCache = newTokenCount - cacheSavings;

      if (afterCache < effectiveLimit) {
        result.reason = `Stripped ${result.strippedCount} + marked ${result.ephemeralCount} ephemeral`;
        consecutiveFailures = 0;
        return result;
      }
    }
  }

  // Phase 3: Need full compaction
  result.triggeredFullCompact = true;
  result.reason = `Token budget still exceeded after microcompact (${newTokenCount} > ${effectiveLimit}), full compaction needed`;
  consecutiveFailures++;
  return result;
}

/**
 * Time-based microcompact: Strip tool results older than N turns.
 */
function timeBasedMicrocompact(
  messages: MessageParam[],
  preserveRecentTurns: number,
): { messages: MessageParam[]; strippedCount: number } {
  const result: MessageParam[] = [];
  let strippedCount = 0;

  // Count tool results from the end to determine the "recent" boundary
  let toolResultCount = 0;
  let recentBoundary = messages.length;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user' && hasToolResult(msg)) {
      toolResultCount++;
      if (toolResultCount >= preserveRecentTurns) {
        recentBoundary = i;
        break;
      }
    }
  }

  // Strip old tool results (replace content with a placeholder)
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (i < recentBoundary && msg.role === 'user' && hasToolResult(msg)) {
      // Replace tool result content with a compact placeholder
      const compacted = stripToolResults(msg);
      if (compacted) {
        result.push(compacted);
        strippedCount++;
        continue;
      }
    }

    result.push(msg);
  }

  return { messages: result, strippedCount };
}

/**
 * Cache-edit microcompact: Mark tool results as ephemeral using cache_control.
 */
function cacheEditMicrocompact(
  messages: MessageParam[],
): { messages: MessageParam[]; ephemeralCount: number } {
  let ephemeralCount = 0;
  const result = messages.map((msg) => {
    if (msg.role !== 'user' || !Array.isArray(msg.content)) return msg;

    let hasEphemeral = false;
    const newContent = (msg.content as any[]).map((block: any) => {
      if (block.type === 'tool_result' && !block.cache_control) {
        hasEphemeral = true;
        return { ...block, cache_control: { type: 'ephemeral' } };
      }
      return block;
    });

    if (hasEphemeral) {
      ephemeralCount++;
      return { ...msg, content: newContent };
    }
    return msg;
  });

  return { messages: result, ephemeralCount };
}

/**
 * Check if a message contains tool results.
 */
function hasToolResult(msg: MessageParam): boolean {
  if (typeof msg.content === 'string') return false;
  if (!Array.isArray(msg.content)) return false;
  return msg.content.some(
    (block: any) => block?.type === 'tool_result',
  );
}

/**
 * Strip tool results from a message, replacing them with a placeholder.
 */
function stripToolResults(msg: MessageParam): MessageParam | null {
  if (typeof msg.content === 'string') return null;
  if (!Array.isArray(msg.content)) return null;

  const newContent = (msg.content as any[]).map((block: any) => {
    if (block?.type === 'tool_result') {
      const id = block.tool_use_id || 'unknown';
      return {
        type: 'tool_result',
        tool_use_id: id,
        content: `[Tool result stripped for context savings]`,
      };
    }
    return block;
  });

  return { ...msg, content: newContent };
}

/**
 * Estimate the token count for a list of messages.
 * Uses a rough heuristic: ~4 chars per token.
 */
export function estimateTokenCount(messages: MessageParam[]): number {
  let totalChars = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      totalChars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content as any[]) {
        if (typeof block === 'string') {
          totalChars += block.length;
        } else if (block?.type === 'text' && typeof block.text === 'string') {
          totalChars += block.text.length;
        } else if (block?.type === 'tool_result') {
          const content = typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? '');
          totalChars += content.length;
        } else if (block?.type === 'tool_use') {
          totalChars += JSON.stringify(block.input ?? '').length;
        }
      }
    }
  }
  return Math.ceil(totalChars / 4);
}

/**
 * Check if auto-compact should be triggered based on token usage.
 * Prefer `shouldTriggerAutoCompact` from context-compactor (percent + edge).
 * This keeps the legacy edge-only check for callers that haven't migrated.
 */
export function shouldAutoCompact(
  tokenCount: number,
  contextWindow: number,
  threshold: number = 13000,
): boolean {
  // Align with percent-based trigger when possible
  try {
    // Lazy require avoided — duplicate formula for microcompact isolation
    const pct = contextWindow >= 512_000 ? 0.5 : 0.75;
    const byPct = Math.floor(contextWindow * pct);
    const byEdge = Math.max(8_000, contextWindow - Math.max(threshold, 4_000));
    return tokenCount >= Math.min(byPct, byEdge);
  } catch {
    return tokenCount >= contextWindow - threshold;
  }
}
