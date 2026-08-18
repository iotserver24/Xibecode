/**
 * Per-chat session store for the messaging gateway.
 * Keys are platform:chatId (e.g. telegram:123456).
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import {
  formatNewConversationReply,
  startNewConversation,
  type StartNewConversationResult,
} from 'xibecode-core';
import { gatewayHome } from './agent-runner.js';

export interface GatewaySessionMessage {
  role: 'user' | 'assistant';
  content: string;
  at: number;
}

export interface GatewayConversationRef {
  sessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  status: 'active' | 'closed';
  parentSessionId?: string;
  channel?: string;
}

export interface GatewaySession {
  key: string;
  platform: string;
  chatId: string;
  title?: string;
  messages: GatewaySessionMessage[];
  /** Per-chat project root for coding runs. */
  workdir?: string;
  /** Show tool progress bubbles (default true). */
  progressEnabled?: boolean;
  /** Archived + active conversation lanes for this chat. */
  conversations?: GatewayConversationRef[];
  previousSessionId?: string;
  /**
   * Gateway rigor level (anti-hallucination / approvals):
   * - yolo: no approval prompts; loose completion evidence
   * - default: ask on dangerous cmds; balanced evidence
   * - strict: ask + strict evidence + post-edit verify
   */
  rigorLevel?: 'yolo' | 'default' | 'strict';
  /** Per-chat model override (`/model`). Empty = use profile default. */
  model?: string;
  /**
   * Canonical JSONL session id shared with EnhancedAgent, SessionMemory,
   * run handoffs, and the session-search index.
   */
  transcriptSessionId?: string;
  updatedAt: number;
  createdAt: number;
}

function sessionsDir(): string {
  return path.join(gatewayHome(), 'sessions');
}

function sessionPath(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9:_-]/g, '_');
  return path.join(sessionsDir(), `${safe}.json`);
}

export async function loadSession(key: string): Promise<GatewaySession | null> {
  try {
    const raw = await fs.readFile(sessionPath(key), 'utf-8');
    return JSON.parse(raw) as GatewaySession;
  } catch {
    return null;
  }
}

export async function saveSession(session: GatewaySession): Promise<void> {
  await fs.mkdir(sessionsDir(), { recursive: true });
  const p = sessionPath(session.key);
  const tmp = `${p}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(session, null, 2), 'utf-8');
  await fs.rename(tmp, p);
}

export async function getOrCreateSession(
  platform: string,
  chatId: string,
): Promise<GatewaySession> {
  const key = `${platform}:${chatId}`;
  const existing = await loadSession(key);
  if (existing) return existing;
  const now = Date.now();
  const session: GatewaySession = {
    key,
    platform,
    chatId,
    messages: [],
    progressEnabled: true,
    createdAt: now,
    updatedAt: now,
  };
  await saveSession(session);
  return session;
}

export async function updateSessionMeta(
  platform: string,
  chatId: string,
  patch: Partial<
    Pick<
      GatewaySession,
      'workdir' | 'progressEnabled' | 'title' | 'rigorLevel' | 'model' | 'transcriptSessionId'
    >
  >,
): Promise<GatewaySession> {
  const session = await getOrCreateSession(platform, chatId);
  if (patch.workdir !== undefined) session.workdir = patch.workdir;
  if (patch.progressEnabled !== undefined) session.progressEnabled = patch.progressEnabled;
  if (patch.title !== undefined) session.title = patch.title;
  if (patch.rigorLevel !== undefined) session.rigorLevel = patch.rigorLevel;
  if (patch.model !== undefined) {
    session.model = patch.model || undefined;
  }
  if (patch.transcriptSessionId !== undefined) {
    session.transcriptSessionId = patch.transcriptSessionId || undefined;
  }
  session.updatedAt = Date.now();
  await saveSession(session);
  return session;
}

export async function appendTurn(
  platform: string,
  chatId: string,
  userText: string,
  assistantText: string,
  maxMessages = 40,
): Promise<GatewaySession> {
  const session = await getOrCreateSession(platform, chatId);
  const now = Date.now();
  session.messages.push({ role: 'user', content: userText, at: now });
  session.messages.push({ role: 'assistant', content: assistantText, at: now });
  if (session.messages.length > maxMessages) {
    session.messages = session.messages.slice(-maxMessages);
  }
  session.updatedAt = now;
  await saveSession(session);
  return session;
}

function upsertConversation(
  list: GatewayConversationRef[],
  ref: GatewayConversationRef,
): GatewayConversationRef[] {
  const idx = list.findIndex((c) => c.sessionId === ref.sessionId);
  if (idx < 0) return [...list, ref];
  const next = [...list];
  next[idx] = { ...list[idx], ...ref };
  return next;
}

function markConversationsInactive(
  list: GatewayConversationRef[],
  except?: string,
): GatewayConversationRef[] {
  return list.map((c) =>
    c.sessionId === except ? { ...c, status: 'active' as const } : { ...c, status: 'closed' as const },
  );
}

/**
 * `/new`: start a fresh transcript session. The old JSONL stays on disk
 * and remains listed in `conversations`. Workdir / model / rigor persist.
 */
export async function startNewLane(
  platform: string,
  chatId: string,
  opts?: { reason?: 'user-new' | 'user-reset' | 'user-clear'; model?: string },
): Promise<{
  session: GatewaySession;
  result: StartNewConversationResult;
  reply: string;
}> {
  const session = await getOrCreateSession(platform, chatId);
  const cwd = session.workdir || process.cwd();
  const previousId = session.transcriptSessionId;
  const result = await startNewConversation({
    previousSessionId: previousId,
    cwd,
    model: opts?.model || session.model,
    channel: platform,
    reason: opts?.reason || 'user-new',
  });

  const now = Date.now();
  let conversations = [...(session.conversations || [])];
  if (previousId && !conversations.some((c) => c.sessionId === previousId)) {
    conversations.push({
      sessionId: previousId,
      title: result.previousTitle || previousId,
      createdAt: session.createdAt,
      updatedAt: now,
      status: 'closed',
      channel: platform,
    });
  }
  if (previousId) {
    conversations = conversations.map((c) =>
      c.sessionId === previousId
        ? {
            ...c,
            status: 'closed' as const,
            title: result.previousTitle || c.title,
            updatedAt: now,
          }
        : c,
    );
  }
  conversations = markConversationsInactive(conversations, result.newSessionId);
  conversations = upsertConversation(conversations, {
    sessionId: result.newSessionId,
    title: 'New conversation',
    createdAt: now,
    updatedAt: now,
    status: 'active',
    parentSessionId: result.previousSessionId || undefined,
    channel: platform,
  });

  session.messages = [];
  session.previousSessionId = result.previousSessionId || undefined;
  session.transcriptSessionId = result.newSessionId;
  session.conversations = conversations;
  session.updatedAt = now;
  await saveSession(session);
  return {
    session,
    result,
    reply: formatNewConversationReply(result),
  };
}

/** Switch the active lane to an existing transcript without deleting either. */
export async function switchLane(
  platform: string,
  chatId: string,
  sessionId: string,
): Promise<GatewaySession | null> {
  const id = sessionId.trim();
  if (!id) return null;
  const session = await getOrCreateSession(platform, chatId);
  const now = Date.now();
  let conversations = markConversationsInactive(session.conversations || [], id);
  const existing = conversations.find((c) => c.sessionId === id);
  if (!existing) {
    conversations = upsertConversation(conversations, {
      sessionId: id,
      title: id,
      createdAt: now,
      updatedAt: now,
      status: 'active',
      channel: platform,
    });
  }
  session.messages = [];
  session.previousSessionId = session.transcriptSessionId;
  session.transcriptSessionId = id;
  session.conversations = conversations;
  session.updatedAt = now;
  await saveSession(session);
  return session;
}

export async function listConversations(
  platform: string,
  chatId: string,
): Promise<{ active?: string; conversations: GatewayConversationRef[] }> {
  const session = await getOrCreateSession(platform, chatId);
  return {
    active: session.transcriptSessionId,
    conversations: [...(session.conversations || [])].sort((a, b) => b.updatedAt - a.updatedAt),
  };
}

/** @deprecated Use startNewLane. Kept so older imports still compile. */
export async function resetSession(platform: string, chatId: string): Promise<void> {
  await startNewLane(platform, chatId);
}
