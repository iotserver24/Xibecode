import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateUuid } from './transcript-types.js';
import { appendEntryToFile, getTranscriptWriter } from './transcript-writer.js';
import {
  createDaemonSessionContext,
  formatNewConversationReply,
  loadResumeContext,
  startNewConversation,
} from './daemon-session.js';
import { loadTranscriptFile } from './transcript-reader.js';
import { SessionMemory } from './session-memory.js';
import { SessionManager } from './session-manager.js';
import { drainSessionIndexQueue, enqueueSessionIndex } from './session-index-queue.js';
import { ftsSearch } from './learning-loop/session-fts.js';

describe('startNewConversation', () => {
  let dir: string;
  let prevHome: string | undefined;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xc-new-lane-'));
    prevHome = process.env.HOME;
    process.env.HOME = dir;
  });

  afterEach(async () => {
    process.env.HOME = prevHome;
    await getTranscriptWriter().flush();
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function seedOldSession(cwd: string): Promise<string> {
    const sessionId = generateUuid();
    const ctx = createDaemonSessionContext({
      sessionId,
      cwd,
      baseDir: dir,
      model: 'test-model',
    });
    appendEntryToFile(ctx.transcriptPath, {
      type: 'session-meta',
      uuid: generateUuid(),
      parentUuid: null,
      timestamp: '2026-01-01T00:00:00.000Z',
      sessionId,
      model: 'test-model',
      cwd,
      conversationStatus: 'active',
    });
    appendEntryToFile(ctx.transcriptPath, {
      type: 'user',
      uuid: generateUuid(),
      parentUuid: null,
      timestamp: '2026-01-01T00:01:00.000Z',
      sessionId,
      message: { role: 'user', content: 'add preview browser' },
    });
    appendEntryToFile(ctx.transcriptPath, {
      type: 'assistant',
      uuid: generateUuid(),
      parentUuid: null,
      timestamp: '2026-01-01T00:02:00.000Z',
      sessionId,
      message: { role: 'assistant', content: 'wired webview' },
    });
    appendEntryToFile(ctx.transcriptPath, {
      type: 'last-prompt',
      uuid: generateUuid(),
      parentUuid: null,
      timestamp: '2026-01-01T00:02:01.000Z',
      sessionId,
      lastPrompt: 'add preview browser',
    });
    appendEntryToFile(ctx.transcriptPath, {
      type: 'run-handoff',
      uuid: generateUuid(),
      parentUuid: null,
      timestamp: '2026-01-01T00:03:00.000Z',
      sessionId,
      handoff: {
        sessionId,
        cwd,
        task: 'add preview browser',
        status: 'completed',
        changedFiles: ['lib/preview.dart'],
        validation: [{ command: 'flutter test', result: 'passed' }],
        decisions: [],
        failedApproaches: [],
        remainingWork: [],
        createdAt: '2026-01-01T00:03:00.000Z',
        trigger: 'complete',
        source: 'observed',
      },
    });
    return sessionId;
  }

  it('creates a new session id and keeps the old transcript readable', async () => {
    const cwd = path.join(dir, 'proj');
    await fs.mkdir(cwd, { recursive: true });
    const oldId = await seedOldSession(cwd);
    const oldPath = createDaemonSessionContext({
      sessionId: oldId,
      cwd,
      baseDir: dir,
    }).transcriptPath;

    const result = await startNewConversation({
      previousSessionId: oldId,
      cwd,
      model: 'test-model',
      channel: 'app',
      reason: 'user-new',
      baseDir: dir,
    });

    expect(result.newSessionId).not.toBe(oldId);
    expect(result.previousSessionId).toBe(oldId);
    expect(result.previousTitle).toContain('add preview browser');

    const oldRaw = await fs.readFile(oldPath, 'utf-8');
    expect(oldRaw).toContain('add preview browser');
    expect(oldRaw).toContain('"event":"session-closed"');
    expect(oldRaw).toContain('"event":"session-reset"');
    expect(oldRaw).toContain(`"successorSessionId":"${result.newSessionId}"`);

    const newRaw = await fs.readFile(result.newTranscriptPath, 'utf-8');
    expect(newRaw).toContain('"event":"session-created"');
    expect(newRaw).toContain(`"parentSessionId":"${oldId}"`);
    expect(newRaw).not.toContain('add preview browser');
    expect(newRaw).not.toContain('wired webview');

    const resume = await loadResumeContext(result.newTranscriptPath);
    expect(resume.messages).toEqual([]);

    const oldResume = await loadResumeContext(oldPath);
    const oldTexts = oldResume.messages.map((m) =>
      typeof m.content === 'string' ? m.content : '',
    );
    expect(oldTexts).toContain('add preview browser');
    expect(oldResume.handoff?.changedFiles).toContain('lib/preview.dart');
    expect(oldResume.handoff?.validation?.[0]?.result).toBe('passed');
  });

  it('persists parent/previous relationship and lifecycle events', async () => {
    const cwd = path.join(dir, 'proj');
    await fs.mkdir(cwd, { recursive: true });
    const oldId = await seedOldSession(cwd);
    const result = await startNewConversation({
      previousSessionId: oldId,
      cwd,
      baseDir: dir,
    });
    const { entries: newEntries } = await loadTranscriptFile(result.newTranscriptPath);
    const created = newEntries.filter((e) => e.type === 'lifecycle' && e.event === 'session-created');
    expect(created).toHaveLength(1);
    const meta = newEntries.find((e) => e.type === 'session-meta');
    expect(meta && 'parentSessionId' in meta ? meta.parentSessionId : undefined).toBe(oldId);
  });

  it('resets session-only memory and leaves project memory files alone', async () => {
    const cwd = path.join(dir, 'proj');
    await fs.mkdir(path.join(cwd, '.xibecode'), { recursive: true });
    const memoryPath = path.join(cwd, 'MEMORY.md');
    const userPath = path.join(cwd, 'USER.md');
    await fs.writeFile(memoryPath, 'project fact: uses flutter\n');
    await fs.writeFile(userPath, 'user prefers pnpm\n');

    const oldMem = new SessionMemory(cwd, 'old-session');
    oldMem.recordLearning('failed approach: rewrite the whole widget');
    oldMem.recordAttempt('edit_file', false, 'broke preview');

    const result = await startNewConversation({
      previousSessionId: 'old-session',
      cwd,
      baseDir: dir,
    });
    const fresh = new SessionMemory(cwd, result.newSessionId);
    expect(fresh.getLearnings()).toEqual([]);
    expect(fresh.getAttempts()).toEqual([]);
    expect(await fs.readFile(memoryPath, 'utf-8')).toContain('uses flutter');
    expect(await fs.readFile(userPath, 'utf-8')).toContain('prefers pnpm');
  });

  it('does not append new messages to the old transcript', async () => {
    const cwd = path.join(dir, 'proj');
    await fs.mkdir(cwd, { recursive: true });
    const oldId = await seedOldSession(cwd);
    const result = await startNewConversation({
      previousSessionId: oldId,
      cwd,
      baseDir: dir,
    });
    appendEntryToFile(result.newTranscriptPath, {
      type: 'user',
      uuid: generateUuid(),
      parentUuid: null,
      timestamp: new Date().toISOString(),
      sessionId: result.newSessionId,
      message: { role: 'user', content: 'only on the new session' },
    });
    const oldPath = createDaemonSessionContext({
      sessionId: oldId,
      cwd,
      baseDir: dir,
    }).transcriptPath;
    const oldRaw = await fs.readFile(oldPath, 'utf-8');
    expect(oldRaw).not.toContain('only on the new session');
    const newRaw = await fs.readFile(result.newTranscriptPath, 'utf-8');
    expect(newRaw).toContain('only on the new session');
  });

  it('keeps both sessions in the search index', async () => {
    const cwd = path.join(dir, 'proj');
    await fs.mkdir(cwd, { recursive: true });
    const oldId = await seedOldSession(cwd);
    const result = await startNewConversation({
      previousSessionId: oldId,
      cwd,
      baseDir: dir,
    });
    await drainSessionIndexQueue();
    await drainSessionIndexQueue();
    const hits = await ftsSearch('preview', 8);
    expect(hits.some((h) => h.sessionId === oldId)).toBe(true);
    expect(result.newSessionId).toBeTruthy();
  });

  it('preserves compact boundary and handoff when /new follows compact', async () => {
    const cwd = path.join(dir, 'proj');
    await fs.mkdir(cwd, { recursive: true });
    const oldId = generateUuid();
    const ctx = createDaemonSessionContext({ sessionId: oldId, cwd, baseDir: dir });
    appendEntryToFile(ctx.transcriptPath, {
      type: 'user',
      uuid: generateUuid(),
      parentUuid: null,
      timestamp: '2026-01-01T00:00:00.000Z',
      sessionId: oldId,
      message: { role: 'user', content: 'old request that will be compacted' },
    });
    appendEntryToFile(ctx.transcriptPath, {
      type: 'compact-boundary',
      uuid: generateUuid(),
      parentUuid: null,
      timestamp: '2026-01-01T00:01:00.000Z',
      sessionId: oldId,
      removedCount: 8,
    });
    appendEntryToFile(ctx.transcriptPath, {
      type: 'run-handoff',
      uuid: generateUuid(),
      parentUuid: null,
      timestamp: '2026-01-01T00:01:01.000Z',
      sessionId: oldId,
      handoff: {
        sessionId: oldId,
        cwd,
        task: 'preview after compact',
        status: 'compacted',
        changedFiles: ['lib/preview.dart'],
        validation: [],
        decisions: [],
        failedApproaches: [],
        remainingWork: ['wire /new'],
        createdAt: '2026-01-01T00:01:01.000Z',
        trigger: 'compact',
        source: 'observed',
      },
    });
    const afterCompact = await fs.readFile(ctx.transcriptPath, 'utf-8');
    expect(afterCompact).toContain('compact-boundary');

    const result = await startNewConversation({
      previousSessionId: oldId,
      cwd,
      baseDir: dir,
    });
    const oldRaw = await fs.readFile(ctx.transcriptPath, 'utf-8');
    expect(oldRaw).toContain('compact-boundary');
    expect(oldRaw).toContain('run-handoff');
    expect(oldRaw).toContain('"event":"session-closed"');
    const newResume = await loadResumeContext(result.newTranscriptPath);
    expect(newResume.messages).toEqual([]);
  });

  it('formats a history-preserving reply', () => {
    const text = formatNewConversationReply({
      previousSessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      newSessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      previousTitle: 'add preview browser',
      newTranscriptPath: '/tmp/new.jsonl',
    });
    expect(text).toContain('Started a new conversation');
    expect(text).toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(text).toContain('add preview browser');
    expect(text).toContain('/history');
  });

  it('lists both sessions through SessionManager after /new', async () => {
    const cwd = path.join(dir, 'proj');
    await fs.mkdir(cwd, { recursive: true });
    const manager = new SessionManager(dir);
    const first = await manager.createSession({ model: 'test-model', cwd, title: 'first chat' });
    await manager.saveSession({
      ...first,
      messages: [{ role: 'user', content: 'first task about previews' }],
    });
    const result = await startNewConversation({
      previousSessionId: first.id,
      cwd,
      model: 'test-model',
      baseDir: dir,
    });
    const listed = await manager.listSessions(cwd);
    const ids = listed.map((s) => s.id);
    expect(ids).toContain(first.id);
    expect(ids).toContain(result.newSessionId);
    const old = listed.find((s) => s.id === first.id);
    expect(old?.conversationStatus).toBe('closed');
    const oldPath = manager.getSessionPath(first.id, cwd);
    const oldRaw = await fs.readFile(oldPath, 'utf-8');
    expect(oldRaw).toContain('first task about previews');
    const loaded = await manager.loadSession(first.id);
    expect(loaded?.id).toBe(first.id);
    expect(loaded?.conversationStatus).toBe('closed');
  });
});
