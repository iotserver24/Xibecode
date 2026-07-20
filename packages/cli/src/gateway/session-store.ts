/**
 * Per-chat session store for the messaging gateway.
 * Keys are platform:chatId (e.g. telegram:123456).
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { gatewayHome } from './agent-runner.js';

export interface GatewaySessionMessage {
  role: 'user' | 'assistant';
  content: string;
  at: number;
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
  /**
   * Gateway rigor level (anti-hallucination / approvals):
   * - yolo: no approval prompts; loose completion evidence
   * - default: ask on dangerous cmds; balanced evidence
   * - strict: ask + strict evidence + post-edit verify
   */
  rigorLevel?: 'yolo' | 'default' | 'strict';
  /** Per-chat model override (`/model`). Empty = use profile default. */
  model?: string;
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
      'workdir' | 'progressEnabled' | 'title' | 'rigorLevel' | 'model'
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

export async function resetSession(platform: string, chatId: string): Promise<void> {
  const key = `${platform}:${chatId}`;
  const existing = await loadSession(key);
  try {
    await fs.unlink(sessionPath(key));
  } catch {
    /* ignore */
  }
  // Preserve workdir/progress prefs across /new
  if (existing?.workdir || existing?.progressEnabled === false) {
    const session = await getOrCreateSession(platform, chatId);
    if (existing.workdir) session.workdir = existing.workdir;
    if (existing.progressEnabled === false) session.progressEnabled = false;
    await saveSession(session);
  }
}
