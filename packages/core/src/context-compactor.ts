import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

export interface CompactionResult {
  messages: MessageParam[];
  droppedCount: number;
  summaryNotice: string;
  groundedFacts: string[];
  conversationSummary?: string;
  /** Estimated tokens after compaction (chars/4 heuristic). */
  estimatedTokensAfter?: number;
}

export interface CompactOptions {
  /** Fallback min messages to keep when token budget is unused (default 12). */
  keepRecentCount?: number;
  /** Token budget for the protected tail (default ~30% of contextWindow). */
  tailTokenBudget?: number;
  /** Full context window size for the model. */
  contextWindow?: number;
  /** Min messages always kept in the tail (default 6). */
  minTailMessages?: number;
  /** Hard max messages in the tail floor walk (default 24). */
  maxTailMessages?: number;
}

/** User/agent-visible status while compaction runs (gateway + CLI). */
export const COMPACTION_STATUS_MARKER = 'Compacting context';
export const COMPACTION_STATUS =
  `🗜️ ${COMPACTION_STATUS_MARKER} — summarizing earlier conversation so I can continue…`;

const HANDOFF_PREFIX =
  '[Context compaction handoff]\n' +
  'This is a handoff from a previous context window. Treat the summary as ' +
  'background only — do NOT re-answer resolved questions or re-run finished work. ' +
  'Continue from the latest user messages after this block. ' +
  'Topic overlap with the summary does not mean you should resume its tasks.\n' +
  '--- summary ends; respond to the conversation below ---';

const SUMMARY_MARKERS = [
  '[Context compaction handoff]',
  '[Conversation Summary]',
  '[Grounded Facts Ledger]',
  'Conversation was compacted:',
  COMPACTION_STATUS_MARKER,
];

function messageText(message: MessageParam): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((block: any) => {
        if (block?.type === 'text') return String(block.text || '');
        if (block?.type === 'tool_use') {
          return `[tool_use:${String(block.name || 'unknown')}] ${JSON.stringify(block.input ?? {}).slice(0, 200)}`;
        }
        if (block?.type === 'tool_result') {
          const raw =
            typeof block.content === 'string'
              ? block.content
              : JSON.stringify(block.content ?? {});
          return `[tool_result:${String(block.tool_use_id || 'unknown')}] ${raw.slice(0, 300)}`;
        }
        return String(block?.content ?? '');
      })
      .join('\n');
  }
  return '';
}

export function estimateMessageTokensRough(message: MessageParam): number {
  const text = messageText(message);
  // +10 role/structure overhead (aligned with production compressors)
  return Math.ceil(text.length / 4) + 10;
}

export function estimateMessagesTokensRough(messages: MessageParam[]): number {
  return messages.reduce((sum, m) => sum + estimateMessageTokensRough(m), 0);
}

/**
 * When to auto-compact.
 *
 * Production-style: trigger at ~75% of context for typical windows (≤512k),
 * ~50% for very large windows — and never later than (window − edgeTokens).
 * Default edge is 13k free for the next reply + tools.
 */
export function resolveCompactTriggerTokens(
  contextWindow: number,
  edgeTokens = 13_000,
): number {
  const pct = contextWindow >= 512_000 ? 0.5 : 0.75;
  const byPct = Math.floor(contextWindow * pct);
  const byEdge = Math.max(8_000, contextWindow - Math.max(edgeTokens, 4_000));
  // Compact at the earlier threshold so we don't wait until the wall
  return Math.min(byPct, byEdge);
}

export function shouldTriggerAutoCompact(
  tokenCount: number,
  contextWindow: number,
  edgeTokens = 13_000,
): boolean {
  if (tokenCount <= 0 || contextWindow <= 0) return false;
  return tokenCount >= resolveCompactTriggerTokens(contextWindow, edgeTokens);
}

function shouldPreserve(message: MessageParam): boolean {
  const text = messageText(message);
  return (
    text.includes('[[PLAN_READY]]') ||
    text.includes('[[TASK_COMPLETE') ||
    text.includes('[SYSTEM]') ||
    text.includes('Plan approved') ||
    // Keep prior handoff summaries as preserve candidates (folded into new summary)
    SUMMARY_MARKERS.some((m) => text.includes(m))
  );
}

function isCompactionSummaryMessage(message: MessageParam): boolean {
  const text = messageText(message);
  return SUMMARY_MARKERS.some((m) => text.includes(m));
}

function hasToolUse(message: MessageParam): boolean {
  if (!Array.isArray(message.content)) return false;
  return (message.content as any[]).some((b) => b?.type === 'tool_use');
}

function hasToolResult(message: MessageParam): boolean {
  if (!Array.isArray(message.content)) return false;
  return (message.content as any[]).some((b) => b?.type === 'tool_result');
}

function parseToolResultFacts(message: MessageParam): string[] {
  if (!Array.isArray(message.content)) return [];
  const facts: string[] = [];
  for (const block of message.content as any[]) {
    if (block?.type !== 'tool_result') continue;
    const raw =
      typeof block.content === 'string'
        ? block.content
        : JSON.stringify(block.content ?? {});
    let payload: any = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
    if (!payload || typeof payload !== 'object') {
      // Plain text results: short preview
      const one = raw.replace(/\s+/g, ' ').trim().slice(0, 100);
      if (one && one.length > 12) facts.push(`Tool: ${one}`);
      continue;
    }
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
    if (payload.success === false && typeof payload.message === 'string') {
      facts.push(`Tool failed: ${payload.message.slice(0, 80)}`);
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
    if (text.includes('[[PLAN_READY]]')) {
      out.push('Plan was ready / approved earlier');
    }
    for (const fact of parseToolResultFacts(message)) {
      out.push(fact);
    }
    // Path-ish mentions in text
    const paths = text.match(
      /(?:^|[\s`"'(])((?:\.\/|\/|~\/)?[\w.-]+(?:\/[\w.-]+)+\.\w{1,8})/g,
    );
    if (paths) {
      for (const p of paths.slice(0, 4)) {
        out.push(`Path mentioned: ${p.trim().replace(/^[\s`"'(]+/, '')}`);
      }
    }
  }
  return Array.from(new Set(out)).slice(-16);
}

function summarizeText(text: string, maxLen = 140): string {
  const clean = text
    .replace(/\[Context compaction handoff\][\s\S]*?--- summary ends[^\n]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1)}…`;
}

function buildConversationSummary(messages: MessageParam[]): string {
  const userTurns: string[] = [];
  const assistantTurns: string[] = [];
  const priorHandoffs: string[] = [];

  for (const message of messages) {
    const text = messageText(message);
    if (!text) continue;
    if (isCompactionSummaryMessage(message)) {
      priorHandoffs.push(summarizeText(text, 220));
      continue;
    }
    if (message.role === 'user' && !hasToolResult(message)) {
      userTurns.push(summarizeText(text));
    } else if (message.role === 'assistant' && !hasToolUse(message)) {
      assistantTurns.push(summarizeText(text));
    } else if (message.role === 'assistant' && hasToolUse(message)) {
      const names = Array.isArray(message.content)
        ? (message.content as any[])
            .filter((b) => b?.type === 'tool_use')
            .map((b) => b.name)
            .filter(Boolean)
        : [];
      if (names.length) {
        assistantTurns.push(`Used tools: ${[...new Set(names)].slice(0, 6).join(', ')}`);
      }
    }
  }

  const sections: string[] = [];
  if (priorHandoffs.length) {
    sections.push(
      '## Prior handoffs (already compacted)\n' +
        priorHandoffs
          .slice(-2)
          .map((line, i) => `${i + 1}. ${line}`)
          .join('\n'),
    );
  }
  const latestUser = userTurns.slice(-6);
  const latestAssistant = assistantTurns.slice(-6);
  if (latestUser.length > 0) {
    sections.push(
      '## User intents\n' +
        latestUser.map((line, idx) => `${idx + 1}. ${line}`).join('\n'),
    );
  }
  if (latestAssistant.length > 0) {
    sections.push(
      '## Assistant outcomes\n' +
        latestAssistant.map((line, idx) => `${idx + 1}. ${line}`).join('\n'),
    );
  }
  return sections.join('\n\n').trim();
}

/**
 * Select a protected tail by **token budget** (not fixed message count).
 * Guarantees min/max bounds and does not split tool_use / tool_result pairs.
 */
export function selectProtectedTail(
  messages: MessageParam[],
  opts: {
    tailTokenBudget: number;
    minTailMessages: number;
    maxTailMessages: number;
  },
): { head: MessageParam[]; tail: MessageParam[] } {
  const n = messages.length;
  if (n === 0) return { head: [], tail: [] };

  const minN = Math.max(3, Math.min(opts.minTailMessages, n));
  const maxN = Math.max(minN, Math.min(opts.maxTailMessages, n));

  let used = 0;
  let count = 0;
  for (let i = n - 1; i >= 0; i--) {
    const msg = messages[i]!;
    const t = estimateMessageTokensRough(msg);
    if (count >= minN && (used + t > opts.tailTokenBudget || count >= maxN)) {
      break;
    }
    used += t;
    count++;
  }

  // Don't start the tail on a bare tool_result (orphan without tool_use)
  let start = n - count;
  while (start > 0 && start < n && hasToolResult(messages[start]!) && !hasToolUse(messages[start]!)) {
    // Include previous message (usually assistant with tool_use)
    start--;
    count++;
    if (count > maxN + 4) break;
  }

  // Also if tail starts mid-turn with only tool results after an assistant, extend left once
  if (start > 0 && hasToolResult(messages[start]!) && hasToolUse(messages[start - 1]!)) {
    start--;
  }

  start = Math.max(0, start);
  return {
    head: messages.slice(0, start),
    tail: messages.slice(start),
  };
}

/**
 * Compact older conversation into a structured handoff + recent tail.
 * Token-budget tail protection; preserves critical plan/complete markers.
 */
export function compactConversation(
  messages: MessageParam[],
  keepRecentCountOrOpts: number | CompactOptions = 16,
): CompactionResult {
  const opts: CompactOptions =
    typeof keepRecentCountOrOpts === 'number'
      ? { keepRecentCount: keepRecentCountOrOpts }
      : keepRecentCountOrOpts || {};

  const contextWindow = opts.contextWindow ?? 120_000;
  const tailTokenBudget =
    opts.tailTokenBudget ??
    Math.max(4_000, Math.floor(contextWindow * 0.3));
  const minTail = opts.minTailMessages ?? 6;
  const maxTail =
    opts.maxTailMessages ??
    Math.max(opts.keepRecentCount ?? 16, 24);

  if (messages.length <= minTail) {
    return {
      messages,
      droppedCount: 0,
      summaryNotice: '',
      groundedFacts: [],
      conversationSummary: '',
      estimatedTokensAfter: estimateMessagesTokensRough(messages),
    };
  }

  // Prefer token-budget tail; also honor keepRecentCount as a soft max floor
  const { head, tail } = selectProtectedTail(messages, {
    tailTokenBudget,
    minTailMessages: minTail,
    maxTailMessages: Math.min(maxTail, opts.keepRecentCount ?? maxTail),
  });

  if (head.length === 0) {
    return {
      messages,
      droppedCount: 0,
      summaryNotice: '',
      groundedFacts: [],
      conversationSummary: '',
      estimatedTokensAfter: estimateMessagesTokensRough(messages),
    };
  }

  // Critical markers from head that aren't already in the summary path
  const preserved = head.filter(
    (m) => shouldPreserve(m) && !isCompactionSummaryMessage(m),
  );
  // Cap preserved extras so we don't re-inflate
  const preservedCapped = preserved.slice(-4);

  const groundedFacts = buildGroundedFacts(head);
  const conversationSummary = buildConversationSummary(head);
  const droppedCount = head.length - preservedCapped.length;

  const summaryNotice =
    `Conversation was compacted: folded ${droppedCount} older message(s) into a handoff, ` +
    `kept ${preservedCapped.length} critical + ${tail.length} recent (token-budget tail).`;

  const summaryBody = [
    HANDOFF_PREFIX,
    '',
    summaryNotice,
    groundedFacts.length
      ? `\n## Grounded facts\n${groundedFacts.map((f) => `- ${f}`).join('\n')}`
      : '',
    conversationSummary ? `\n${conversationSummary}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  // Alternation: handoff as user-role summary so the next assistant turn is clean
  // when the tail starts with assistant; if tail starts with user, use assistant role.
  const summaryRole: 'user' | 'assistant' =
    tail[0]?.role === 'user' ? 'assistant' : 'user';

  const compacted: MessageParam[] = [
    {
      role: summaryRole,
      content: summaryBody,
    },
    ...preservedCapped,
    ...tail,
  ];

  return {
    messages: compacted,
    droppedCount,
    summaryNotice,
    groundedFacts,
    conversationSummary,
    estimatedTokensAfter: estimateMessagesTokensRough(compacted),
  };
}
