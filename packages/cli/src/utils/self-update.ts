/**
 * Opt-in self-update helpers for E2B / hosted daemons.
 * Install from npm, optionally relaunch the current daemon process.
 */

import { execSync, spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  checkUpdateAvailable,
  compareSemverCore,
  isE2bHostedRuntime,
  updateCheckDisabled,
  type UpdateAvailability,
} from './npm-update-notice.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version?: string; name?: string };

export function packageVersion(): string {
  return String(pkg.version || '0.0.0').trim();
}

function packageName(): string {
  return String(pkg.name || 'xibecode');
}

export async function checkCliUpdate(options?: {
  forceRefresh?: boolean;
}): Promise<UpdateAvailability> {
  return checkUpdateAvailable(packageVersion(), {
    forceRefresh: options?.forceRefresh,
    timeoutMs: 8_000,
  });
}

function runNpmInstall(targetVersion: string): { ok: boolean; logs: string } {
  const spec = `${packageName()}@${targetVersion}`;
  const args = ['install', '-g', spec, '--no-fund', '--no-audit'];
  const chunks: string[] = [`$ npm ${args.join(' ')}`];
  const r = spawnSync('npm', args, {
    encoding: 'utf-8',
    env: { ...process.env, npm_config_update_notifier: 'false' },
    timeout: 180_000,
  });
  chunks.push(`${r.stdout || ''}${r.stderr || ''}`);
  if (r.status === 0) return { ok: true, logs: chunks.join('\n') };
  chunks.push(`exit ${r.status ?? '?'}`);
  return { ok: false, logs: chunks.join('\n') };
}

function verifyInstalledVersion(): string {
  try {
    const v = execSync('xibecode -v 2>/dev/null || xibecode --version 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 15_000,
    }).trim();
    const m = v.match(/(\d+\.\d+\.\d+(?:-[^\s]+)?)/);
    return m ? m[1]! : v.split('\n')[0] || packageVersion();
  } catch {
    return packageVersion();
  }
}

export type ApplySelfUpdateResult = {
  ok: boolean;
  from: string;
  to: string;
  verified: string;
  logs: string;
  restarted?: boolean;
  error?: string;
};

/**
 * Install a specific (or latest) version. Does not restart unless requested.
 */
export async function applySelfUpdate(opts?: {
  version?: string;
  /** After success, relaunch this process as a new daemon and exit. */
  restartDaemon?: boolean;
}): Promise<ApplySelfUpdateResult> {
  if (updateCheckDisabled()) {
    return {
      ok: false,
      from: packageVersion(),
      to: '',
      verified: packageVersion(),
      logs: '',
      error: 'Update disabled (XIBECODE_DISABLE_UPDATE_CHECK)',
    };
  }

  const from = packageVersion();
  let to = (opts?.version || '').trim().replace(/^v/, '');
  if (!to) {
    const avail = await checkCliUpdate({ forceRefresh: true });
    if (!avail.updateAvailable) {
      return {
        ok: true,
        from,
        to: from,
        verified: from,
        logs: 'already_latest',
      };
    }
    to = avail.latest;
  }

  const install = runNpmInstall(to);
  const verified = verifyInstalledVersion();
  const ok =
    install.ok &&
    (compareSemverCore(verified, to) >= 0 ||
      verified === to ||
      verified.startsWith(to));

  if (!ok) {
    return {
      ok: false,
      from,
      to,
      verified,
      logs: install.logs,
      error: 'install failed or version mismatch',
    };
  }

  let restarted = false;
  if (opts?.restartDaemon) {
    restarted = scheduleDaemonRelaunch();
  }

  return {
    ok: true,
    from,
    to,
    verified,
    logs: install.logs,
    restarted,
  };
}

/**
 * Relaunch the current CLI process (same argv) in the background, then exit.
 * Used after npm -g so the new binary is what `xibecode` resolves to on PATH —
 * we re-exec via `xibecode` on PATH when possible.
 */
export function scheduleDaemonRelaunch(): boolean {
  try {
    // Prefer PATH binary (post-install); fall back to same node entrypoint.
    const workdir =
      process.env.XIBECODE_DAEMON_WORKDIR ||
      process.env.XIBECODE_GATEWAY_WORKDIR ||
      process.cwd();

    // Reconstruct daemon argv: keep flags after "daemon"
    const argv = process.argv.slice(2);
    const daemonIdx = argv.findIndex((a) => a === 'daemon' || a === 'gateway');
    const daemonArgs =
      daemonIdx >= 0
        ? argv.slice(daemonIdx)
        : ['daemon', '--workdir', workdir];

    // Ensure --workdir present
    if (!daemonArgs.some((a) => a === '--workdir' || a.startsWith('--workdir='))) {
      daemonArgs.push('--workdir', workdir);
    }

    const shellCmd = [
      'sleep 1',
      // kill any leftover self by pid file after we exit
      'if command -v xibecode >/dev/null 2>&1; then',
      `  nohup xibecode ${daemonArgs.map(shellQuote).join(' ')} >>"$HOME/.xibecode/daemon/logs/daemon.log" 2>&1 &`,
      '  echo $! > /tmp/xibecode-daemon.pid',
      'else',
      `  nohup ${shellQuote(process.execPath)} ${process.argv
        .slice(1)
        .map(shellQuote)
        .join(' ')} >>"$HOME/.xibecode/daemon/logs/daemon.log" 2>&1 &`,
      '  echo $! > /tmp/xibecode-daemon.pid',
      'fi',
    ].join('\n');

    spawn('bash', ['-c', shellCmd], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    }).unref();

    // Give the shell a moment to start, then exit so Telegram long-poll releases
    setTimeout(() => {
      try {
        process.exit(0);
      } catch {
        /* ignore */
      }
    }, 400).unref?.();

    return true;
  } catch {
    return false;
  }
}

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_./:@%=+-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function formatUpdateOffer(avail: UpdateAvailability): string {
  if (avail.disabled) {
    return 'Update checks disabled (`XIBECODE_DISABLE_UPDATE_CHECK=1`).';
  }
  if (!avail.updateAvailable) {
    return `Up to date · \`${avail.current}\``;
  }
  const hosted = avail.hosted || isE2bHostedRuntime();
  const lines = [
    `**Update available:** \`${avail.latest}\` (you have \`${avail.current}\`)`,
    '',
    hosted
      ? 'Running in E2B/hosted sandbox. Reply **`/update yes`** to install and **auto-restart** the daemon (workspace + secrets kept).'
      : 'Reply **`/update yes`** to install, or run `npm i -g xibecode@latest` locally.',
    'Dismiss: `/update no`',
  ];
  return lines.join('\n');
}

export { isE2bHostedRuntime, updateCheckDisabled };
