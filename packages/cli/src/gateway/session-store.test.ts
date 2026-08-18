import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getOrCreateSession,
  listConversations,
  startNewLane,
  switchLane,
  updateSessionMeta,
} from './session-store.js';

describe('gateway conversation lanes', () => {
  let dir: string;
  let prevHome: string | undefined;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xc-gw-lane-'));
    prevHome = process.env.HOME;
    process.env.HOME = dir;
  });

  afterEach(async () => {
    process.env.HOME = prevHome;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('starts a new session without deleting the previous transcript pointer history', async () => {
    const session = await getOrCreateSession('app', 'owner');
    await updateSessionMeta('app', 'owner', { transcriptSessionId: '11111111-1111-4111-8111-111111111111' });
    expect(session.key).toBe('app:owner');

    const first = await startNewLane('app', 'owner', { reason: 'user-new' });
    expect(first.result.newSessionId).toBeTruthy();
    expect(first.session.messages).toEqual([]);
    expect(first.session.transcriptSessionId).toBe(first.result.newSessionId);
    expect(first.reply).toMatch(/Started a new conversation/i);

    const second = await startNewLane('app', 'owner');
    expect(second.result.newSessionId).not.toBe(first.result.newSessionId);
    expect(second.result.previousSessionId).toBe(first.result.newSessionId);

    const listed = await listConversations('app', 'owner');
    expect(listed.active).toBe(second.result.newSessionId);
    expect(listed.conversations.some((c) => c.sessionId === first.result.newSessionId)).toBe(true);
    expect(listed.conversations.some((c) => c.sessionId === second.result.newSessionId)).toBe(true);

    const switched = await switchLane('app', 'owner', first.result.newSessionId);
    expect(switched?.transcriptSessionId).toBe(first.result.newSessionId);
    const after = await listConversations('app', 'owner');
    expect(after.active).toBe(first.result.newSessionId);
  });
});
