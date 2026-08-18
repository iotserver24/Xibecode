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
import { loadSessionMetadata, loadTranscriptFile } from './transcript-reader.js';
import { getTranscriptWriter } from './transcript-writer.js';
import { sessionTranscriptPath } from './session-paths.js';
import {
  formatRunHandoffMarkdown,
  latestHandoffFromEntries,
  messageContainsHandoff,
  type RunHandoff,
} from './run-handoff.js';
import { enqueueSessionIndex, scheduleSessionIndexDrain } from './session-index-queue.js';

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

export type LifecycleEventName =
  | 'session-start'
  | 'prompt'
  | 'complete'
  | 'fail'
  | 'interrupt'
  | 'shutdown'
  | 'compact'
  | 'session-reset'
  | 'session-closed'
  | 'session-created';

export type NewConversationReason = 'user-new' | 'user-reset' | 'user-clear';

export interface StartNewConversationInput {
  previousSessionId?: string | null;
  cwd: string;
  model?: string;
  channel?: string;
  reason?: NewConversationReason;
  baseDir?: string;
  title?: string;
}

export interface StartNewConversationResult {
  previousSessionId: string | null;
  newSessionId: string;
  previousTitle?: string;
  newTranscriptPath: string;
  previousTranscriptPath?: string;
}

export async function writeLifecycleEntry(
  ctx: DaemonSessionContext,
  event: LifecycleEventName,
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

function conversationTitleFromMeta(
  meta: { customTitle?: string; lastPrompt?: string },
  fallback?: string,
): string | undefined {
  const title = (meta.customTitle || meta.lastPrompt || fallback || '').trim();
  if (!title) return undefined;
  return title.length > 80 ? `${title.slice(0, 77)}…` : title;
}

/**
 * `/new`: create a fresh session id, archive the previous transcript in place,
 * and record the parent/successor link. Does not delete the old JSONL,
 * handoffs, file-history, project memory, or user preferences.
 */
export async function startNewConversation(
  input: StartNewConversationInput,
): Promise<StartNewConversationResult> {
  const cwd = input.cwd;
  const previousSessionId = input.previousSessionId?.trim() || null;
  const newCtx = createDaemonSessionContext({
    cwd,
    model: input.model,
    channel: input.channel,
    promptOrigin: 'user',
    baseDir: input.baseDir,
  });
  const writer = getTranscriptWriter();
  await writer.flush();

  let previousTitle: string | undefined = input.title?.trim() || undefined;
  let previousTranscriptPath: string | undefined;

  if (previousSessionId) {
    const prevCtx = createDaemonSessionContext({
      sessionId: previousSessionId,
      cwd,
      model: input.model,
      channel: input.channel,
      promptOrigin: 'user',
      baseDir: input.baseDir,
    });
    previousTranscriptPath = prevCtx.transcriptPath;
    if (await transcriptExists(prevCtx.transcriptPath)) {
      const meta = await loadSessionMetadata(prevCtx.transcriptPath);
      previousTitle = conversationTitleFromMeta(meta, previousTitle);
      const resume = await loadResumeContext(prevCtx.transcriptPath);
      const now = new Date().toISOString();
      await writer.enqueueWrite(prevCtx.transcriptPath, {
        type: 'session-meta',
        uuid: generateUuid(),
        parentUuid: null,
        timestamp: now,
        sessionId: previousSessionId,
        model: input.model || meta.model || 'unknown',
        cwd,
        parentSessionId: meta.parentSessionId,
        successorSessionId: newCtx.sessionId,
        conversationStatus: 'closed',
        resetReason: input.reason || 'user-new',
        channel: input.channel,
      });
      await writeLifecycleEntry(
        prevCtx,
        'session-closed',
        `successor=${newCtx.sessionId}`,
      );
      await writeLifecycleEntry(
        prevCtx,
        'session-reset',
        input.reason || 'user-new',
      );
      await enqueueSessionIndex({
        id: previousSessionId,
        path: prevCtx.transcriptPath,
        title: previousTitle || previousSessionId,
        body: [
          previousTitle || '',
          `closed successor=${newCtx.sessionId}`,
          resume.handoff?.task || '',
          (resume.handoff?.changedFiles || []).join(' '),
        ].join('\n'),
        updated: Date.now(),
        projectPath: cwd,
        status: 'closed',
        changedFiles: resume.handoff?.changedFiles?.slice(0, 40),
      }).catch(() => {});
    }
  }

  const now = new Date().toISOString();
  await writer.enqueueWrite(newCtx.transcriptPath, {
    type: 'session-meta',
    uuid: generateUuid(),
    parentUuid: null,
    timestamp: now,
    sessionId: newCtx.sessionId,
    model: input.model || 'unknown',
    cwd,
    parentSessionId: previousSessionId || undefined,
    conversationStatus: 'active',
    resetReason: input.reason || 'user-new',
    channel: input.channel,
  });
  await writeLifecycleEntry(
    newCtx,
    'session-created',
    previousSessionId ? `parent=${previousSessionId}` : 'parent=none',
  );
  await enqueueSessionIndex({
    id: newCtx.sessionId,
    path: newCtx.transcriptPath,
    title: 'New conversation',
    body: previousSessionId ? `parent=${previousSessionId}` : 'new conversation',
    updated: Date.now(),
    projectPath: cwd,
    status: 'active',
  }).catch(() => {});
  scheduleSessionIndexDrain();
  await writer.flush();

  return {
    previousSessionId,
    newSessionId: newCtx.sessionId,
    previousTitle,
    newTranscriptPath: newCtx.transcriptPath,
    previousTranscriptPath,
  };
}

export function formatNewConversationReply(result: StartNewConversationResult): string {
  if (!result.previousSessionId) {
    return `Started a new conversation.\n\nsession: \`${result.newSessionId}\``;
  }
  const title = result.previousTitle ? ` (${result.previousTitle})` : '';
  return [
    'Started a new conversation. Your previous conversation is still available in history as',
    `\`${result.previousSessionId}\`${title}.`,
    '',
    `New session: \`${result.newSessionId}\``,
    'Use `/history` to list conversations, or `/history open <id>` to reopen the previous chat.',
  ].join('\n');
}
