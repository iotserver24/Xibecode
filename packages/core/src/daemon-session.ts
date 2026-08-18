/**
 * Canonical daemon / gateway session context.
 *
 * One session ID is shared by the agent, transcript, SessionMemory, handoffs,
 * gateway events, and the session-search index.
 */

import { access } from 'fs/promises';
import type { UUID } from 'crypto';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { generateUuid, isTranscriptMessage, type Entry } from './transcript-types.js';
import { loadTranscriptFile } from './transcript-reader.js';
import { getTranscriptWriter } from './transcript-writer.js';
import { sessionTranscriptPath } from './session-paths.js';
import {
  formatRunHandoffMarkdown,
  latestHandoffFromEntries,
  messageContainsHandoff,
  type RunHandoff,
} from './run-handoff.js';

export type PromptOrigin = 'user' | 'daemon' | 'continuation';

export interface DaemonSessionContext {
  sessionId: string;
  cwd: string;
  transcriptPath: string;
  model?: string;
  channel?: string;
  taskId?: string;
  promptOrigin?: PromptOrigin;
}

const RESUME_TAIL_MAX = 28;

export function createDaemonSessionContext(input: {
  sessionId?: string;
  cwd: string;
  model?: string;
  channel?: string;
  taskId?: string;
  promptOrigin?: PromptOrigin;
  baseDir?: string;
}): DaemonSessionContext {
  const sessionId = input.sessionId || generateUuid();
  const cwd = input.cwd;
  return {
    sessionId,
    cwd,
    transcriptPath: sessionTranscriptPath(sessionId, cwd, input.baseDir),
    model: input.model,
    channel: input.channel,
    taskId: input.taskId,
    promptOrigin: input.promptOrigin || 'user',
  };
}

export async function transcriptExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function writeLifecycleEntry(
  ctx: DaemonSessionContext,
  event: 'session-start' | 'prompt' | 'complete' | 'fail' | 'interrupt' | 'shutdown' | 'compact',
  detail?: string,
): Promise<void> {
  await getTranscriptWriter().enqueueWrite(ctx.transcriptPath, {
    type: 'lifecycle',
    uuid: generateUuid(),
    parentUuid: null,
    timestamp: new Date().toISOString(),
    sessionId: ctx.sessionId,
    event,
    origin: ctx.promptOrigin,
    detail: detail?.slice(0, 500),
  });
}

export interface ResumeContext {
  messages: MessageParam[];
  lastUuid: UUID | null;
  handoff: RunHandoff | null;
  sessionId?: string;
}

/**
 * Resume a daemon session without replaying the entire transcript.
 * Prefers the latest run handoff + messages after the last compact boundary.
 */
export async function loadResumeContext(
  transcriptPath: string,
): Promise<ResumeContext> {
  const empty: ResumeContext = {
    messages: [],
    lastUuid: null,
    handoff: null,
  };

  let entries: Entry[];
  try {
    ({ entries } = await loadTranscriptFile(transcriptPath));
  } catch {
    return empty;
  }
  if (!entries.length) return empty;

  const handoff = latestHandoffFromEntries(entries);

  let afterTs: string | null = null;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i]!.type === 'compact-boundary') {
      afterTs = entries[i]!.timestamp;
      break;
    }
  }

  const convo = entries.filter(isTranscriptMessage).filter((e) => {
    if (!afterTs) return true;
    return e.timestamp >= afterTs;
  });

  let messages: MessageParam[] = convo
    .map((e) => ('message' in e ? e.message : null))
    .filter((m): m is MessageParam => !!m);

  if (messages.length > RESUME_TAIL_MAX) {
    messages = messages.slice(-RESUME_TAIL_MAX);
  }

  if (handoff && !messages.some(messageContainsHandoff)) {
    messages = [
      { role: 'user', content: formatRunHandoffMarkdown(handoff) },
      ...messages,
    ];
  }

  const lastMsg = [...entries].reverse().find(isTranscriptMessage);
  return {
    messages,
    lastUuid: (lastMsg?.uuid as UUID | undefined) ?? null,
    handoff,
    sessionId: lastMsg?.sessionId || handoff?.sessionId,
  };
}
