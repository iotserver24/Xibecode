import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  enqueueSessionIndex,
  drainSessionIndexQueue,
  withSearchTimeout,
  handoffToIndexDoc,
} from './session-index-queue.js';
import { ftsSearch } from './learning-loop/session-fts.js';

describe('session index queue', () => {
  let dir: string;
  let prevHome: string | undefined;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xc-idxq-'));
    prevHome = process.env.HOME;
    process.env.HOME = dir;
  });

  afterEach(async () => {
    process.env.HOME = prevHome;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('indexes a handoff and finds it by filename and error', async () => {
    const doc = handoffToIndexDoc({
      sessionId: 'sess-preview',
      transcriptPath: '/tmp/sess.jsonl',
      task: 'add preview browser',
      cwd: '/tmp/proj',
      status: 'completed',
      changedFiles: ['lib/preview.dart'],
      commands: ['flutter test'],
      errors: ['GoException: no routes'],
      body: 'wired /compact',
    });
    await enqueueSessionIndex(doc);
    const drained = await drainSessionIndexQueue();
    expect(drained.indexed).toBe(1);
    expect(drained.remaining).toBe(0);

    const byFile = await ftsSearch('preview.dart', 4);
    const fileHit = byFile.find((h) => h.sessionId === 'sess-preview');
    expect(fileHit).toBeTruthy();
    expect(fileHit?.changedFiles).toContain('lib/preview.dart');

    const byErr = await ftsSearch('GoException', 4);
    expect(byErr.some((h) => h.sessionId === 'sess-preview')).toBe(true);
  });

  it('recovers from a corrupt queue file', async () => {
    const queue = path.join(dir, '.xibecode', 'session-index', 'queue.jsonl');
    await fs.mkdir(path.dirname(queue), { recursive: true });
    await fs.writeFile(queue, '{not json\n', 'utf-8');
    const drained = await drainSessionIndexQueue();
    expect(drained.indexed).toBe(0);
  });

  it('times out search so the daemon is not blocked', async () => {
    const raced = await withSearchTimeout(
      new Promise<string>((resolve) => setTimeout(() => resolve('late'), 200)),
      'fallback',
      20,
    );
    expect(raced.timedOut).toBe(true);
    expect(raced.value).toBe('fallback');
  });
});
