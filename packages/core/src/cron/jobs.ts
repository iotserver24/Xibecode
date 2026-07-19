/**
 * Cron job storage under ~/.xibecode/cron/jobs.json (atomic writes).
 *
 * @module cron/jobs
 */

import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parseSchedule,
  nextRunAt,
  defaultRepeat,
  type ParsedSchedule,
} from './schedule.js';

export type CronDelivery = 'local' | 'origin' | 'telegram' | string;

export interface CronJob {
  id: string;
  name?: string;
  prompt: string;
  /** Original schedule string. */
  schedule: string;
  /** Parsed once at create/load. */
  parsed?: ParsedSchedule;
  /** Epoch ms of next run. */
  nextRunAt: number;
  /** Epoch ms of last successful/failed run. */
  lastRunAt?: number | null;
  /** paused | active */
  status: 'active' | 'paused';
  /** Remaining runs; 'forever' or number. */
  repeat: number | 'forever';
  /** Where to deliver output. */
  deliver: CronDelivery;
  /** Working directory for the agent run (absolute). */
  workdir?: string;
  /** Optional pinned model/provider for the job. */
  model?: string | null;
  provider?: string | null;
  apiKey?: string | null;
  baseUrl?: string | null;
  skills?: string[];
  /** Origin chat for messaging (platform:chatId). */
  origin?: string;
  createdAt: number;
  updatedAt: number;
  lastError?: string | null;
  lastOutputPath?: string | null;
  runCount: number;
}

export interface CronStore {
  version: 1;
  jobs: CronJob[];
}

function cronHome(base?: string): string {
  return base || path.join(os.homedir(), '.xibecode', 'cron');
}

export function jobsPath(base?: string): string {
  return path.join(cronHome(base), 'jobs.json');
}

export function outputDir(base?: string): string {
  return path.join(cronHome(base), 'output');
}

async function ensureDirs(base?: string): Promise<void> {
  await fs.mkdir(cronHome(base), { recursive: true });
  await fs.mkdir(outputDir(base), { recursive: true });
}

async function readStore(base?: string): Promise<CronStore> {
  await ensureDirs(base);
  const p = jobsPath(base);
  try {
    const raw = await fs.readFile(p, 'utf-8');
    const parsed = JSON.parse(raw) as CronStore;
    if (!parsed.jobs) parsed.jobs = [];
    return parsed;
  } catch {
    return { version: 1, jobs: [] };
  }
}

async function writeStore(store: CronStore, base?: string): Promise<void> {
  await ensureDirs(base);
  const p = jobsPath(base);
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf-8');
  await fs.rename(tmp, p);
}

function newId(): string {
  return randomBytes(4).toString('hex');
}

export interface CreateJobInput {
  prompt: string;
  schedule: string;
  name?: string;
  deliver?: CronDelivery;
  workdir?: string;
  model?: string | null;
  provider?: string | null;
  apiKey?: string | null;
  baseUrl?: string | null;
  skills?: string[];
  origin?: string;
  repeat?: number | 'forever';
}

export async function listJobs(base?: string): Promise<CronJob[]> {
  const store = await readStore(base);
  return store.jobs.slice().sort((a, b) => a.nextRunAt - b.nextRunAt);
}

export async function getJob(idOrName: string, base?: string): Promise<CronJob | null> {
  const store = await readStore(base);
  const exact = store.jobs.find((j) => j.id === idOrName);
  if (exact) return exact;
  const lower = idOrName.toLowerCase();
  const byName = store.jobs.filter((j) => j.name?.toLowerCase() === lower);
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) {
    throw new Error(
      `Ambiguous job name "${idOrName}". Candidates: ${byName.map((j) => j.id).join(', ')}`,
    );
  }
  return null;
}

export async function createJob(input: CreateJobInput, base?: string): Promise<CronJob> {
  const parsed = parseSchedule(input.schedule);
  const now = Date.now();
  const job: CronJob = {
    id: newId(),
    name: input.name,
    prompt: input.prompt,
    schedule: input.schedule,
    parsed,
    nextRunAt: nextRunAt(parsed, now),
    lastRunAt: null,
    status: 'active',
    repeat: input.repeat ?? defaultRepeat(parsed),
    deliver: input.deliver || 'local',
    workdir: input.workdir,
    model: input.model ?? null,
    provider: input.provider ?? null,
    apiKey: input.apiKey ?? null,
    baseUrl: input.baseUrl ?? null,
    skills: input.skills,
    origin: input.origin,
    createdAt: now,
    updatedAt: now,
    lastError: null,
    lastOutputPath: null,
    runCount: 0,
  };
  const store = await readStore(base);
  store.jobs.push(job);
  await writeStore(store, base);
  return job;
}

export async function updateJob(
  idOrName: string,
  patch: Partial<
    Pick<
      CronJob,
      | 'name'
      | 'prompt'
      | 'schedule'
      | 'deliver'
      | 'workdir'
      | 'model'
      | 'provider'
      | 'skills'
      | 'status'
      | 'repeat'
    >
  >,
  base?: string,
): Promise<CronJob> {
  const store = await readStore(base);
  const job = await resolveInStore(store, idOrName);
  if (!job) throw new Error(`Job not found: ${idOrName}`);

  if (patch.name !== undefined) job.name = patch.name;
  if (patch.prompt !== undefined) job.prompt = patch.prompt;
  if (patch.deliver !== undefined) job.deliver = patch.deliver;
  if (patch.workdir !== undefined) job.workdir = patch.workdir;
  if (patch.model !== undefined) job.model = patch.model;
  if (patch.provider !== undefined) job.provider = patch.provider;
  if (patch.skills !== undefined) job.skills = patch.skills;
  if (patch.status !== undefined) job.status = patch.status;
  if (patch.repeat !== undefined) job.repeat = patch.repeat;

  if (patch.schedule !== undefined) {
    job.schedule = patch.schedule;
    job.parsed = parseSchedule(patch.schedule);
    job.nextRunAt = nextRunAt(job.parsed, Date.now(), job.lastRunAt);
  }

  job.updatedAt = Date.now();
  await writeStore(store, base);
  return job;
}

export async function removeJob(idOrName: string, base?: string): Promise<boolean> {
  const store = await readStore(base);
  const job = await resolveInStore(store, idOrName);
  if (!job) return false;
  store.jobs = store.jobs.filter((j) => j.id !== job.id);
  await writeStore(store, base);
  return true;
}

export async function pauseJob(idOrName: string, base?: string): Promise<CronJob> {
  return updateJob(idOrName, { status: 'paused' }, base);
}

export async function resumeJob(idOrName: string, base?: string): Promise<CronJob> {
  const store = await readStore(base);
  const job = await resolveInStore(store, idOrName);
  if (!job) throw new Error(`Job not found: ${idOrName}`);
  job.status = 'active';
  const parsed = job.parsed || parseSchedule(job.schedule);
  job.parsed = parsed;
  job.nextRunAt = nextRunAt(parsed, Date.now(), job.lastRunAt);
  job.updatedAt = Date.now();
  await writeStore(store, base);
  return job;
}

/** Jobs that are due right now. */
export async function dueJobs(nowMs: number = Date.now(), base?: string): Promise<CronJob[]> {
  const store = await readStore(base);
  return store.jobs.filter((j) => j.status === 'active' && j.nextRunAt <= nowMs);
}

export interface JobRunResult {
  ok: boolean;
  output: string;
  error?: string;
}

/**
 * Record a completed run: write output file, update next_run / repeat.
 */
export async function completeJobRun(
  jobId: string,
  result: JobRunResult,
  base?: string,
): Promise<CronJob | null> {
  const store = await readStore(base);
  const job = store.jobs.find((j) => j.id === jobId);
  if (!job) return null;

  const now = Date.now();
  job.lastRunAt = now;
  job.runCount += 1;
  job.updatedAt = now;
  job.lastError = result.ok ? null : result.error || 'failed';

  // Persist output
  const dir = path.join(outputDir(base), job.id);
  await fs.mkdir(dir, { recursive: true });
  const outPath = path.join(dir, `${now}.md`);
  const body = [
    `# Cron: ${job.name || job.id}`,
    ``,
    `- schedule: \`${job.schedule}\``,
    `- at: ${new Date(now).toISOString()}`,
    `- ok: ${result.ok}`,
    result.error ? `- error: ${result.error}` : '',
    ``,
    `---`,
    ``,
    result.output || '(empty)',
    ``,
  ]
    .filter((l) => l !== '')
    .join('\n');
  await fs.writeFile(outPath, body, 'utf-8');
  job.lastOutputPath = outPath;

  // Advance schedule / retire job
  const parsed = job.parsed || parseSchedule(job.schedule);
  job.parsed = parsed;

  if (job.repeat !== 'forever') {
    const left = typeof job.repeat === 'number' ? job.repeat - 1 : 0;
    job.repeat = left;
    if (left <= 0) {
      job.status = 'paused';
      job.nextRunAt = Number.MAX_SAFE_INTEGER;
    } else {
      job.nextRunAt = nextRunAt(parsed, now, now);
    }
  } else if (parsed.kind === 'once_relative' || parsed.kind === 'once_at') {
    job.status = 'paused';
    job.nextRunAt = Number.MAX_SAFE_INTEGER;
  } else {
    job.nextRunAt = nextRunAt(parsed, now, now);
  }

  await writeStore(store, base);
  return job;
}

async function resolveInStore(store: CronStore, idOrName: string): Promise<CronJob | null> {
  const exact = store.jobs.find((j) => j.id === idOrName);
  if (exact) return exact;
  const lower = idOrName.toLowerCase();
  const byName = store.jobs.filter((j) => j.name?.toLowerCase() === lower);
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) {
    throw new Error(
      `Ambiguous job name "${idOrName}". Candidates: ${byName.map((j) => j.id).join(', ')}`,
    );
  }
  return null;
}

/** Simple file lock for scheduler ticks. */
export async function withTickLock<T>(
  fn: () => Promise<T>,
  base?: string,
): Promise<T | null> {
  await ensureDirs(base);
  const lockPath = path.join(cronHome(base), '.tick.lock');
  let fd: fs.FileHandle | null = null;
  try {
    fd = await fs.open(lockPath, 'wx');
    await fd.writeFile(String(process.pid));
    return await fn();
  } catch (err: any) {
    if (err?.code === 'EEXIST') {
      // Stale lock? if process gone, reclaim
      try {
        const pid = Number((await fs.readFile(lockPath, 'utf-8')).trim());
        if (pid && !isPidAlive(pid)) {
          await fs.unlink(lockPath).catch(() => {});
          return withTickLock(fn, base);
        }
      } catch {
        /* ignore */
      }
      return null;
    }
    throw err;
  } finally {
    if (fd) {
      await fd.close().catch(() => {});
      await fs.unlink(lockPath).catch(() => {});
    }
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
