/**
 * Shared compaction pipeline for manual `/compact` and automatic compact.
 *
 * One session cannot run two compactions at once. A second request is rejected
 * (not queued) so the transcript cannot be corrupted.
 */

import type { UUID } from 'crypto';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { generateUuid } from './transcript-types.js';
import { getTranscriptWriter } from './transcript-writer.js';
import {
  compactConversation,
  COMPACTION_STATUS,
  type CompactionResult,
} from './context-compactor.js';
import {
  buildRunHandoff,
  compactUserStatus,
  formatRunHandoffMarkdown,
  messageContainsHandoff,
  writeHandoffEntry,
  type RunHandoff,
  type RunObservation,
} from './run-handoff.js';
import {
  enqueueSessionIndex,
  handoffToIndexDoc,
  scheduleSessionIndexDrain,
} from './session-index-queue.js';

export interface CompactSessionOptions {
  sessionId: string;
  cwd: string;
  transcriptPath?: string | null;
  messages: MessageParam[];
  trigger: 'manual' | 'auto';
  contextWindow: number;
  lastUuid?: UUID | null;
  observation: RunObservation;
  task?: string;
  hooksManager?: {
    execute: (event: string, ctx: Record<string, unknown>) => Promise<unknown>;
  } | null;
  onStatus?: (message: string) => void;
}

export interface CompactSessionResult {
  messages: MessageParam[];
  droppedCount: number;
  userStatus: string;
  handoff: RunHandoff | null;
  alreadyInProgress: boolean;
  skipped: boolean;
  lastUuid: UUID | null;
  estimatedTokensAfter?: number;
}

const inflight = new Set<string>();

export function isCompactInFlight(sessionId: string): boolean {
  return inflight.has(sessionId);
}

/** Test-only: clear in-flight locks. */
export function resetCompactLocks(): void {
  inflight.clear();
}

function preserveMarkers(messages: MessageParam[]): {
  hasPlan: boolean;
  hasQuestions: boolean;
  hasTask: boolean;
} {
  let hasPlan = false;
  let hasQuestions = false;
  let hasTask = false;
  for (const m of messages) {
    const text =
      typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content
              .map((b: any) => (typeof b?.text === 'string' ? b.text : ''))
              .join('\n')
          : '';
    if (text.includes('[[PLAN_READY]]') || text.includes('Plan approved')) hasPlan = true;
    if (text.includes('[[QUESTIONS:')) hasQuestions = true;
    if (text.includes('[[TASK_COMPLETE')) hasTask = true;
  }
  return { hasPlan, hasQuestions, hasTask };
}

async function runCompact(
  opts: CompactSessionOptions,
): Promise<CompactSessionResult> {
  const writer = getTranscriptWriter();
  if (opts.transcriptPath) {
    await writer.flush();
  }

  if (opts.hooksManager) {
    try {
      await opts.hooksManager.execute('PreCompact', {
        event: 'PreCompact',
        compactTrigger: opts.trigger,
        sessionId: opts.sessionId,
      });
    } catch {
      /* non-fatal */
    }
  }

  opts.onStatus?.(COMPACTION_STATUS);

  const before = opts.messages.length;
  const compacted: CompactionResult = compactConversation(opts.messages, {
    contextWindow: opts.contextWindow,
    tailTokenBudget: Math.max(4_000, Math.floor(opts.contextWindow * 0.3)),
    keepRecentCount: 20,
    minTailMessages: 6,
    maxTailMessages: 28,
  });

  if (compacted.droppedCount <= 0 && compacted.messages.length >= before) {
    return {
      messages: opts.messages,
      droppedCount: 0,
      userStatus: 'Nothing to compact — conversation is already within the protected tail.',
      handoff: null,
      alreadyInProgress: false,
      skipped: true,
      lastUuid: opts.lastUuid ?? null,
      estimatedTokensAfter: compacted.estimatedTokensAfter,
    };
  }

  const markers = preserveMarkers(opts.messages);
  if (markers.hasQuestions) {
    opts.observation.recordRemaining('Unresolved questions are still pending.');
  }
  if (markers.hasPlan && !markers.hasTask) {
    opts.observation.recordRemaining('Active plan is still in progress.');
  }

  const handoff = buildRunHandoff({
    sessionId: opts.sessionId,
    cwd: opts.cwd,
    status: 'compacted',
    trigger: 'compact',
    observation: opts.observation,
    task: opts.task,
  });

  const handoffText = formatRunHandoffMarkdown(handoff);
  let messages = compacted.messages;
  if (!messages.some(messageContainsHandoff)) {
    const firstRole = messages[0]?.role;
    const handoffRole: 'user' | 'assistant' =
      firstRole === 'user' ? 'assistant' : 'user';
    messages = [{ role: handoffRole, content: handoffText }, ...messages];
  }

  let lastUuid = opts.lastUuid ?? null;
  if (opts.transcriptPath) {
    const handoffUuid = generateUuid();
    await writer.enqueueWrite(opts.transcriptPath, {
      type: 'system',
      uuid: handoffUuid,
      parentUuid: lastUuid,
      timestamp: new Date().toISOString(),
      sessionId: opts.sessionId,
      message: { role: 'user', content: handoffText },
    });
    lastUuid = handoffUuid;

    await writer.enqueueWrite(opts.transcriptPath, {
      type: 'compact-boundary',
      uuid: generateUuid(),
      parentUuid: null,
      timestamp: new Date().toISOString(),
      sessionId: opts.sessionId,
      removedCount: compacted.droppedCount,
      tokensBefore: undefined,
      tokensAfter: compacted.estimatedTokensAfter,
    });

    await writeHandoffEntry(opts.transcriptPath, handoff);
    await writer.enqueueWrite(opts.transcriptPath, {
      type: 'lifecycle',
      uuid: generateUuid(),
      parentUuid: null,
      timestamp: new Date().toISOString(),
      sessionId: opts.sessionId,
      event: 'compact',
      origin: opts.trigger === 'manual' ? 'user' : 'daemon',
      detail: `dropped ${compacted.droppedCount}`,
    });
    await writer.flush();

    await enqueueSessionIndex(
      handoffToIndexDoc({
        sessionId: opts.sessionId,
        transcriptPath: opts.transcriptPath,
        task: handoff.task,
        cwd: opts.cwd,
        status: handoff.status,
        changedFiles: handoff.changedFiles,
        commands: handoff.validation.map((v) => v.command),
        errors: handoff.failedApproaches,
        body: handoffText,
      }),
    );
    scheduleSessionIndexDrain();
  }

  if (opts.hooksManager) {
    try {
      await opts.hooksManager.execute('PostCompact', {
        event: 'PostCompact',
        compactTrigger: opts.trigger,
        sessionId: opts.sessionId,
      });
    } catch {
      /* non-fatal */
    }
  }

  const userStatus = compactUserStatus(handoff, compacted.droppedCount);
  opts.onStatus?.(userStatus);

  return {
    messages,
    droppedCount: compacted.droppedCount,
    userStatus,
    handoff,
    alreadyInProgress: false,
    skipped: false,
    lastUuid,
    estimatedTokensAfter: compacted.estimatedTokensAfter,
  };
}

export async function compactSession(
  opts: CompactSessionOptions,
): Promise<CompactSessionResult> {
  if (inflight.has(opts.sessionId)) {
    return {
      messages: opts.messages,
      droppedCount: 0,
      userStatus: 'Compaction already in progress for this session.',
      handoff: null,
      alreadyInProgress: true,
      skipped: true,
      lastUuid: opts.lastUuid ?? null,
    };
  }

  inflight.add(opts.sessionId);
  try {
    return await runCompact(opts);
  } finally {
    inflight.delete(opts.sessionId);
  }
}
