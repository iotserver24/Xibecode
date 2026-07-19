/**
 * Cron scheduler — tick due jobs and invoke a runner callback.
 * Used by the long-running gateway process (Hermes-style).
 *
 * @module cron/scheduler
 */

import {
  dueJobs,
  completeJobRun,
  withTickLock,
  type CronJob,
  type JobRunResult,
} from './jobs.js';

export type CronJobRunner = (job: CronJob) => Promise<JobRunResult>;

export interface SchedulerOptions {
  /** Interval between ticks (ms). Default 60s. */
  intervalMs?: number;
  /** Storage root override (~/.xibecode/cron). */
  baseDir?: string;
  /** Called for each due job. */
  runJob: CronJobRunner;
  /** Optional logger. */
  log?: (msg: string) => void;
  /** Max concurrent jobs without workdir (workdir jobs always serialize). */
  maxParallel?: number;
}

/**
 * Start the cron loop. Returns a stop function.
 */
export function startCronScheduler(options: SchedulerOptions): () => void {
  const intervalMs = options.intervalMs ?? 60_000;
  const log = options.log || ((m: string) => console.log(`[cron] ${m}`));
  let stopped = false;
  let ticking = false;

  const tick = async () => {
    if (stopped || ticking) return;
    ticking = true;
    try {
      await withTickLock(async () => {
        const due = await dueJobs(Date.now(), options.baseDir);
        if (!due.length) return;

        log(`${due.length} job(s) due`);

        // Serialize workdir jobs; parallelize the rest (capped)
        const withWd = due.filter((j) => j.workdir);
        const without = due.filter((j) => !j.workdir);

        for (const job of withWd) {
          if (stopped) break;
          await executeOne(job, options, log);
        }

        const maxP = options.maxParallel ?? 3;
        for (let i = 0; i < without.length; i += maxP) {
          if (stopped) break;
          const batch = without.slice(i, i + maxP);
          await Promise.all(batch.map((job) => executeOne(job, options, log)));
        }
      }, options.baseDir);
    } catch (err: any) {
      log(`tick error: ${err?.message || err}`);
    } finally {
      ticking = false;
    }
  };

  // Fire soon, then on interval
  const first = setTimeout(() => void tick(), 2_000);
  const handle = setInterval(() => void tick(), intervalMs);

  return () => {
    stopped = true;
    clearTimeout(first);
    clearInterval(handle);
  };
}

async function executeOne(
  job: CronJob,
  options: SchedulerOptions,
  log: (m: string) => void,
): Promise<void> {
  log(`running job ${job.id}${job.name ? ` (${job.name})` : ''}`);
  let result: JobRunResult;
  try {
    result = await options.runJob(job);
  } catch (err: any) {
    result = {
      ok: false,
      output: '',
      error: err?.message || String(err),
    };
  }
  try {
    await completeJobRun(job.id, result, options.baseDir);
  } catch (err: any) {
    log(`failed to record run for ${job.id}: ${err?.message || err}`);
  }
  if (result.ok) {
    log(`job ${job.id} completed`);
  } else {
    log(`job ${job.id} failed: ${result.error || 'unknown'}`);
  }
}
