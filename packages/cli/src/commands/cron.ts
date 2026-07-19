/**
 * xibecode cron — manage scheduled agent tasks .
 */

import chalk from 'chalk';
import {
  listJobs,
  createJob,
  removeJob,
  pauseJob,
  resumeJob,
  getJob,
  updateJob,
} from 'xibecode-core';

export interface CronCliOptions {
  profile?: string;
  name?: string;
  deliver?: string;
  workdir?: string;
  model?: string;
  provider?: string;
  schedule?: string;
  prompt?: string;
}

function printJob(j: any): void {
  const next = j.nextRunAt
    ? new Date(j.nextRunAt).toISOString()
    : 'n/a';
  console.log(
    chalk.cyan(j.id) +
      (j.name ? chalk.white(`  ${j.name}`) : '') +
      chalk.dim(`  [${j.status}]`),
  );
  console.log(chalk.dim(`  schedule: ${j.schedule}  next: ${next}`));
  console.log(chalk.dim(`  deliver: ${j.deliver}  runs: ${j.runCount}`));
  if (j.workdir) console.log(chalk.dim(`  workdir: ${j.workdir}`));
  console.log(chalk.dim(`  prompt: ${String(j.prompt).slice(0, 120)}${j.prompt.length > 120 ? '…' : ''}`));
  if (j.lastError) console.log(chalk.red(`  last error: ${j.lastError}`));
  if (j.lastOutputPath) console.log(chalk.dim(`  last output: ${j.lastOutputPath}`));
  console.log('');
}

export async function cronCommand(
  action: string | undefined,
  args: string[],
  options: CronCliOptions,
): Promise<void> {
  const act = (action || 'list').toLowerCase();

  if (act === 'list' || act === 'ls') {
    const jobs = await listJobs();
    if (!jobs.length) {
      console.log(chalk.dim('No cron jobs. Create one:'));
      console.log(
        chalk.cyan(
          '  xibecode cron create "every 1d" "Summarize git status" --name daily',
        ),
      );
      return;
    }
    console.log(chalk.white(`${jobs.length} job(s):\n`));
    for (const j of jobs) printJob(j);
    return;
  }

  if (act === 'create' || act === 'add') {
    // positional: schedule prompt  OR flags
    const schedule = options.schedule || args[0];
    const prompt = options.prompt || args.slice(1).join(' ') || args[1];
    if (!schedule || !prompt) {
      console.error(
        chalk.red(
          'Usage: xibecode cron create <schedule> <prompt> [--name N] [--deliver local|telegram] [--workdir PATH]',
        ),
      );
      console.error(chalk.dim('  schedules: "30m", "every 2h", "0 9 * * *", ISO timestamp'));
      process.exitCode = 1;
      return;
    }
    const job = await createJob({
      schedule,
      prompt,
      name: options.name,
      deliver: (options.deliver as any) || 'local',
      workdir: options.workdir,
      model: options.model,
      provider: options.provider,
    });
    console.log(chalk.green(`Created job ${job.id}`));
    printJob(job);
    console.log(
      chalk.dim(
        'Jobs run when `xibecode gateway` is running (or the systemd service).',
      ),
    );
    return;
  }

  if (act === 'remove' || act === 'rm' || act === 'delete') {
    const id = args[0];
    if (!id) {
      console.error(chalk.red('Usage: xibecode cron remove <id|name>'));
      process.exitCode = 1;
      return;
    }
    const ok = await removeJob(id);
    console.log(ok ? chalk.green(`Removed ${id}`) : chalk.red(`Not found: ${id}`));
    return;
  }

  if (act === 'pause') {
    const id = args[0];
    if (!id) {
      console.error(chalk.red('Usage: xibecode cron pause <id|name>'));
      process.exitCode = 1;
      return;
    }
    printJob(await pauseJob(id));
    return;
  }

  if (act === 'resume') {
    const id = args[0];
    if (!id) {
      console.error(chalk.red('Usage: xibecode cron resume <id|name>'));
      process.exitCode = 1;
      return;
    }
    printJob(await resumeJob(id));
    return;
  }

  if (act === 'show' || act === 'get') {
    const id = args[0];
    if (!id) {
      console.error(chalk.red('Usage: xibecode cron show <id|name>'));
      process.exitCode = 1;
      return;
    }
    const job = await getJob(id);
    if (!job) {
      console.error(chalk.red(`Not found: ${id}`));
      process.exitCode = 1;
      return;
    }
    printJob(job);
    return;
  }

  if (act === 'edit') {
    const id = args[0];
    if (!id) {
      console.error(chalk.red('Usage: xibecode cron edit <id> [--schedule S] [--prompt P] ...'));
      process.exitCode = 1;
      return;
    }
    const patch: any = {};
    if (options.schedule) patch.schedule = options.schedule;
    if (options.prompt) patch.prompt = options.prompt;
    if (options.deliver) patch.deliver = options.deliver;
    if (options.workdir) patch.workdir = options.workdir;
    if (options.model) patch.model = options.model;
    if (options.provider) patch.provider = options.provider;
    if (options.name) patch.name = options.name;
    printJob(await updateJob(id, patch));
    return;
  }

  console.error(chalk.red(`Unknown cron action: ${act}`));
  console.error(
    chalk.dim(
      'Actions: list | create | remove | pause | resume | show | edit',
    ),
  );
  process.exitCode = 1;
}
