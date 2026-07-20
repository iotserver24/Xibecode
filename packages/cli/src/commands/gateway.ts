/**
 * Xibe Daemon — 24/7 coding agent (cron + Telegram / Discord / Slack).
 *
 * Primary command: `xibecode daemon`
 * Alias: `xibecode gateway` (same implementation)
 */

import chalk from 'chalk';
import { GatewayRunner, installSystemdUserService } from '../gateway/runner.js';
import { execSync } from 'child_process';
import {
  DAEMON_PRODUCT_NAME,
  DAEMON_SERVICE_NAME,
  DAEMON_SERVICE_LEGACY,
  daemonServiceNames,
  ensureXibecodeHome,
  getXibecodeHome,
  paths,
  primarySecretEnvPath,
} from '../utils/xibecode-home.js';

export interface GatewayCliOptions {
  profile?: string;
  workdir?: string;
  cronOnly?: boolean;
  install?: boolean;
  start?: boolean;
  stop?: boolean;
  status?: boolean;
}

function trySystemctl(args: string): { ok: boolean; out: string } {
  try {
    // stdio ignore stderr so missing units don't dump scary "Unit not loaded"
    const out = execSync(`systemctl --user ${args}`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out: out || '' };
  } catch (err: any) {
    return {
      ok: false,
      out: (err.stdout || err.stderr || err.message || '').toString(),
    };
  }
}

function unitIsLoaded(name: string): boolean {
  const r = trySystemctl(`show ${name} -p LoadState --value`);
  return r.ok && r.out.trim() === 'loaded';
}

export async function gatewayCommand(options: GatewayCliOptions): Promise<void> {
  await ensureXibecodeHome();
  const home = getXibecodeHome();
  const p = paths(home);
  const secretPath = primarySecretEnvPath(home);

  if (options.install) {
    const unitPath = await installSystemdUserService({
      profile: options.profile,
      workdir: options.workdir || process.cwd(),
    });
    console.log(chalk.green(`Wrote systemd user unit: ${unitPath}`));
    console.log('');
    console.log(chalk.white('Enable and start (survives logout with linger):'));
    console.log(chalk.cyan('  systemctl --user daemon-reload'));
    console.log(chalk.cyan(`  systemctl --user enable --now ${DAEMON_SERVICE_NAME}`));
    console.log(chalk.cyan('  sudo loginctl enable-linger $USER   # optional, boot without login'));
    console.log('');
    console.log(chalk.white(`${DAEMON_PRODUCT_NAME} home: ${home}`));
    console.log(chalk.white(`Put secrets in ${secretPath}, e.g.:`));
    console.log(chalk.dim('  ANTHROPIC_API_KEY=...'));
    console.log(chalk.dim('  TELEGRAM_BOT_TOKEN=...'));
    console.log(chalk.dim('  TELEGRAM_ALLOWED_USERS=123456789'));
    console.log(chalk.dim('  XIBECODE_FALLBACK_PROVIDERS=openrouter|anthropic/claude-sonnet-4|sk-or-...'));
    console.log('');
    console.log(chalk.dim(`Runtime state: ${p.daemon}/ (sessions, logs, pairing, ledger)`));
    return;
  }

  if (options.status) {
    let any = false;
    for (const name of daemonServiceNames()) {
      const r = trySystemctl(`status ${name} --no-pager`);
      if (r.out) {
        console.log(r.out);
        any = true;
        if (r.ok) break;
      }
    }
    if (!any) {
      console.log('Service not installed or inactive');
      process.exitCode = 1;
    }
    return;
  }

  if (options.start) {
    let started = false;
    for (const name of daemonServiceNames()) {
      const r = trySystemctl(`start ${name}`);
      if (r.ok) {
        console.log(chalk.green(`Started ${name}`));
        started = true;
        break;
      }
    }
    if (!started) {
      console.error(chalk.red(`Failed to start. Run: xibecode daemon --install first`));
      process.exitCode = 1;
    }
    return;
  }

  if (options.stop) {
    let stopped = false;
    for (const name of daemonServiceNames()) {
      if (!unitIsLoaded(name)) continue;
      const r = trySystemctl(`stop ${name}`);
      if (r.ok) {
        console.log(chalk.green(`Stopped ${name}`));
        stopped = true;
      } else if (r.out && !/not loaded|not found/i.test(r.out)) {
        console.error(chalk.dim(`${name}: ${r.out.trim().slice(0, 200)}`));
      }
    }
    if (!stopped) {
      console.log(chalk.dim('No active xibecode daemon/gateway unit to stop.'));
    }
    return;
  }

  // Foreground daemon
  console.log(chalk.cyan(`${DAEMON_PRODUCT_NAME} — 24/7 coding agent`));
  console.log(chalk.dim('  cron + Telegram / Discord / Slack + skills'));
  console.log(chalk.dim(`  home: ${home}`));
  console.log(chalk.dim(`  daemon state: ${p.daemon}`));
  console.log(chalk.dim('  Ctrl+C to stop\n'));
  console.log(chalk.white(`Env (loaded from ${secretPath} if present):`));
  console.log(chalk.dim('  TELEGRAM_BOT_TOKEN + TELEGRAM_ALLOWED_USERS'));
  console.log(chalk.dim('  DISCORD_BOT_TOKEN + DISCORD_ALLOWED_USERS  (Message Content Intent on)'));
  console.log(chalk.dim('  SLACK_BOT_TOKEN + SLACK_APP_TOKEN + SLACK_ALLOWED_USERS'));
  console.log(chalk.dim('  Skills: /skills · /skill <name> · agent list_skills/view_skill'));
  console.log('');

  const runner = new GatewayRunner({
    profile: options.profile,
    workdir: options.workdir,
    cronOnly: options.cronOnly,
  });

  await runner.start();
}

/** Explicit alias export for `xibecode daemon` */
export const daemonCommand = gatewayCommand;
