import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateUuid } from './transcript-types.js';
import { appendEntryToFile } from './transcript-writer.js';
import { createDaemonSessionContext, loadResumeContext } from './daemon-session.js';
import { formatRunHandoffMarkdown, type RunHandoff } from './run-handoff.js';

describe('daemon session resume', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xc-daemon-sess-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('creates a stable transcript path from session id + cwd', () => {
    const ctx = createDaemonSessionContext({
      sessionId: '11111111-1111-4111-8111-111111111111',
      cwd: '/tmp/proj',
      channel: 'app',
    });
    expect(ctx.sessionId).toBe('11111111-1111-4111-8111-111111111111');
    expect(ctx.transcriptPath).toMatch(/11111111-1111-4111-8111-111111111111\.jsonl$/);
    expect(ctx.channel).toBe('app');
  });

  it('resumes from the latest handoff plus post-compact messages', async () => {
    const sessionId = generateUuid();
    const file = path.join(dir, `${sessionId}.jsonl`);
    const handoff: RunHandoff = {
      sessionId,
      cwd: '/tmp/proj',
      task: 'add preview browser',
      status: 'compacted',
      changedFiles: ['lib/preview.dart'],
      validation: [{ command: 'flutter test', result: 'passed' }],
      decisions: ['use webview_flutter'],
      failedApproaches: [],
      remainingWork: ['wire /compact in app'],
      createdAt: new Date().toISOString(),
      trigger: 'compact',
      source: 'observed',
    };

    appendEntryToFile(file, {
      type: 'user',
      uuid: generateUuid(),
      parentUuid: null,
      timestamp: '2026-01-01T00:00:00.000Z',
      sessionId,
      message: { role: 'user', content: 'old request that was compacted' },
    });
    appendEntryToFile(file, {
      type: 'compact-boundary',
      uuid: generateUuid(),
      parentUuid: null,
      timestamp: '2026-01-01T00:01:00.000Z',
      sessionId,
      removedCount: 12,
    });
    appendEntryToFile(file, {
      type: 'run-handoff',
      uuid: generateUuid(),
      parentUuid: null,
      timestamp: '2026-01-01T00:01:01.000Z',
      sessionId,
      handoff,
    });
    const last = generateUuid();
    appendEntryToFile(file, {
      type: 'user',
      uuid: last,
      parentUuid: null,
      timestamp: '2026-01-01T00:02:00.000Z',
      sessionId,
      message: { role: 'user', content: 'continue the preview work' },
    });

    const resume = await loadResumeContext(file);
    expect(resume.handoff?.task).toBe('add preview browser');
    expect(resume.handoff?.changedFiles).toContain('lib/preview.dart');
    expect(resume.lastUuid).toBe(last);
    const texts = resume.messages.map((m) =>
      typeof m.content === 'string' ? m.content : '',
    );
    expect(texts.some((t) => t.includes('continue the preview work'))).toBe(true);
    expect(texts.some((t) => t.includes(formatRunHandoffMarkdown(handoff).slice(0, 20)))).toBe(
      true,
    );
    expect(texts.join('\n')).not.toContain('old request that was compacted');
  });
});
