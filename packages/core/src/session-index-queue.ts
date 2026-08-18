/**
 * Durable async queue for session / handoff FTS indexing.
 * Never blocks the daemon on index I/O; retries on the next drain.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { indexSessionDocument, type IndexDoc } from './learning-loop/session-fts.js';

const QUEUE_NAME = 'queue.jsonl';
const MAX_ATTEMPTS = 5;
const SEARCH_TIMEOUT_MS = 3_000;

function indexDir(): string {
  return path.join(os.homedir(), '.xibecode', 'session-index');
}

function queuePath(): string {
  return path.join(indexDir(), QUEUE_NAME);
}

export interface QueuedIndexJob {
  doc: IndexDoc;
  enqueuedAt: number;
  attempts: number;
}

async function readQueue(): Promise<QueuedIndexJob[]> {
  try {
    const raw = await fs.readFile(queuePath(), 'utf-8');
    const jobs: QueuedIndexJob[] = [];
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        const parsed = JSON.parse(t) as QueuedIndexJob;
        if (parsed?.doc?.id) jobs.push(parsed);
      } catch {
        /* skip corrupt line */
      }
    }
    return jobs;
  } catch (err: any) {
    if (err?.code === 'ENOENT') return [];
    // Corrupt file: quarantine and start empty
    try {
      await fs.rename(queuePath(), `${queuePath()}.corrupt.${Date.now()}`);
    } catch {
      /* ignore */
    }
    return [];
  }
}

async function writeQueue(jobs: QueuedIndexJob[]): Promise<void> {
  await fs.mkdir(indexDir(), { recursive: true });
  const tmp = `${queuePath()}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  const body = jobs.map((j) => JSON.stringify(j)).join('\n') + (jobs.length ? '\n' : '');
  await fs.writeFile(tmp, body, 'utf-8');
  try {
    await fs.rename(tmp, queuePath());
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err;
  }
}

export async function enqueueSessionIndex(doc: IndexDoc): Promise<void> {
  const jobs = await readQueue();
  const existing = jobs.findIndex((j) => j.doc.id === doc.id);
  const job: QueuedIndexJob = {
    doc,
    enqueuedAt: Date.now(),
    attempts: 0,
  };
  if (existing >= 0) jobs[existing] = job;
  else jobs.push(job);
  await writeQueue(jobs);
}

export async function drainSessionIndexQueue(): Promise<{
  indexed: number;
  failed: number;
  remaining: number;
}> {
  const jobs = await readQueue();
  if (!jobs.length) return { indexed: 0, failed: 0, remaining: 0 };

  const remaining: QueuedIndexJob[] = [];
  let indexed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      await indexSessionDocument(job.doc);
      indexed++;
    } catch {
      job.attempts += 1;
      if (job.attempts >= MAX_ATTEMPTS) {
        failed++;
      } else {
        remaining.push(job);
      }
    }
  }

  await writeQueue(remaining);
  return { indexed, failed, remaining: remaining.length };
}

/** Fire-and-forget drain. Errors are swallowed. */
export function scheduleSessionIndexDrain(): void {
  void drainSessionIndexQueue().catch(() => {});
}

export async function rebuildSessionIndex(
  docs: IndexDoc[],
): Promise<{ indexed: number }> {
  let indexed = 0;
  for (const doc of docs) {
    try {
      await indexSessionDocument(doc);
      indexed++;
    } catch {
      /* skip */
    }
  }
  return { indexed };
}

/**
 * Run an async search with a hard timeout so memory retrieval cannot stall the daemon.
 */
export async function withSearchTimeout<T>(
  work: Promise<T>,
  fallback: T,
  timeoutMs = SEARCH_TIMEOUT_MS,
): Promise<{ value: T; timedOut: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('search-timeout')), timeoutMs);
      }),
    ]);
    return { value, timedOut: false };
  } catch {
    return { value: fallback, timedOut: true };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function handoffToIndexDoc(input: {
  sessionId: string;
  transcriptPath: string;
  task: string;
  cwd: string;
  status: string;
  changedFiles: string[];
  commands: string[];
  errors: string[];
  body?: string;
  parentSessionId?: string;
}): IndexDoc {
  const parts = [
    input.task,
    input.status,
    input.cwd,
    input.changedFiles.join(' '),
    input.commands.join(' '),
    input.errors.join(' '),
    input.body || '',
  ];
  return {
    id: input.sessionId,
    path: input.transcriptPath,
    title: (input.task || input.sessionId).slice(0, 120),
    body: parts.join('\n').slice(0, 100_000),
    updated: Date.now(),
    projectPath: input.cwd,
    status: input.status,
    changedFiles: input.changedFiles.slice(0, 40),
    parentSessionId: input.parentSessionId,
  };
}
