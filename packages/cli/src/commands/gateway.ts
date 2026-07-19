/**
 * xibecode gateway — 24/7 daemon (cron + Telegram messaging).
 */

import chalk from 'chalk';
import { GatewayRunner, installSystemdUserService } from '../gateway/runner.js';
import { execSync } from 'child_process';

export interface GatewayCliOptions {
  profile?: string;
  workdir?: string;
  cronOnly?: boolean;
  install?: boolean;
  start?: boolean;
  stop?: boolean;
  status?: boolean;
}

export async function gatewayCommand(options: GatewayCliOptions): Promise<void> {
  if (options.install) {
    const unitPath = await installSystemdUserService({
      profile: options.profile,
      workdir: options.workdir || process.cwd(),
    });
    console.log(chalk.green(`Wrote systemd user unit: ${unitPath}`));
    console.log('');
    console.log(chalk.white('Enable and start (survives logout with linger):'));
    console.log(chalk.cyan('  systemctl --user daemon-reload'));
    console.log(chalk.cyan('  systemctl --user enable --now xibecode-gateway'));
    console.log(chalk.cyan('  sudo loginctl enable-linger $USER   # optional, boot without login'));
    console.log('');
    console.log(chalk.white('Put secrets in ~/.xibecode/gateway.env, e.g.:'));
    console.log(chalk.dim('  ANTHROPIC_API_KEY=...'));
    console.log(chalk.dim('  TELEGRAM_BOT_TOKEN=...'));
    console.log(chalk.dim('  TELEGRAM_ALLOWED_USERS=123456789'));
    console.log(chalk.dim('  XIBECODE_FALLBACK_PROVIDERS=openrouter|anthropic/claude-sonnet-4|sk-or-...'));
    return;
  }

  if (options.status) {
    try {
      const out = execSync('systemctl --user status xibecode-gateway --no-pager', {
        encoding: 'utf-8',
      });
      console.log(out);
    } catch (err: any) {
      console.log(err.stdout || err.message || 'Service not installed or inactive');
      process.exitCode = 1;
    }
    return;
  }

  if (options.start) {
    try {
      execSync('systemctl --user start xibecode-gateway', { stdio: 'inherit' });
      console.log(chalk.green('Started xibecode-gateway'));
    } catch {
      console.error(chalk.red('Failed to start. Run: xibecode gateway --install first'));
      process.exitCode = 1;
    }
    return;
  }

  if (options.stop) {
    try {
      execSync('systemctl --user stop xibecode-gateway', { stdio: 'inherit' });
      console.log(chalk.green('Stopped xibecode-gateway'));
    } catch {
      console.error(chalk.red('Failed to stop service'));
      process.exitCode = 1;
    }
    return;
  }

  // Foreground gateway
  console.log(chalk.cyan('XibeCode Gateway — 24/7 coding agent'));
  console.log(chalk.dim('  cron + Telegram / Discord / Slack'));
  console.log(chalk.dim('  Ctrl+C to stop\n'));
  console.log(chalk.white('Env (put in ~/.xibecode/gateway.env):'));
  console.log(chalk.dim('  TELEGRAM_BOT_TOKEN + TELEGRAM_ALLOWED_USERS'));
  console.log(chalk.dim('  DISCORD_BOT_TOKEN + DISCORD_ALLOWED_USERS  (Message Content Intent on)'));
  console.log(chalk.dim('  SLACK_BOT_TOKEN + SLACK_APP_TOKEN + SLACK_ALLOWED_USERS'));
  console.log('');

  const runner = new GatewayRunner({
    profile: options.profile,
    workdir: options.workdir,
    cronOnly: options.cronOnly,
  });

  await runner.start();
}
