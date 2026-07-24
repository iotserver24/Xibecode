/**
 * Opt-in self-update helpers for E2B / hosted daemons.
 * Install from npm, optionally relaunch the current daemon process.
 *
 * Sessions live under ~/.xibecode/daemon/sessions/ — restart does NOT wipe chat memory.
 */

import { execSync, spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  checkUpdateAvailable,
  compareSemverCore,
  isE2bHostedRuntime,
  updateCheckDisabled,
  type UpdateAvailability,
} from './npm-update-notice.js';
import {
  featuresForMode,
  resolveRuntimeMode,
} from './runtime-mode.js';

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

/** Path to gateway session JSON files (chat memory). Survives daemon restart. */
export function daemonSessionsDir(): string {
  const home =
    process.env.XIBECODE_HOME?.trim() || path.join(os.homedir(), '.xibecode');
  return path.join(home, 'daemon', 'sessions');
}

function runNpmInstall(
  targetVersion: string,
  opts?: { allowSudo?: boolean },
): { ok: boolean; logs: string } {
  const spec = `${packageName()}@${targetVersion}`;
  const baseArgs = ['install', '-g', spec, '--no-fund', '--no-audit'];
  const chunks: string[] = [];
  const env = { ...process.env, npm_config_update_notifier: 'false' };

  const tryOnce = (cmd: string, args: string[]): boolean => {
    chunks.push(`$ ${cmd} ${args.join(' ')}`);
    const r = spawnSync(cmd, args, {
      encoding: 'utf-8',
      env,
      timeout: 180_000,
    });
    chunks.push(`${r.stdout || ''}${r.stderr || ''}`);
    if (r.status === 0) return true;
    chunks.push(`exit ${r.status ?? '?'}`);
    return false;
  };

  // 1) Plain global npm (works when the process can write the global prefix)
  if (tryOnce('npm', baseArgs)) {
    return { ok: true, logs: chunks.join('\n') };
  }

  // 2) E2B templates often install CLI as root → need sudo
  const allowSudo =
    opts?.allowSudo ?? featuresForMode(resolveRuntimeMode().mode).preferSudoNpm;
  if (allowSudo) {
    chunks.push('--- retry with sudo ---');
    if (tryOnce('sudo', ['-n', 'npm', ...baseArgs])) {
      return { ok: true, logs: chunks.join('\n') };
    }
    // Interactive sudo may hang in headless — only -n (non-interactive)
    chunks.push('(sudo -n failed or not permitted; install as root from dashboard if needed)');
  }

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
  /** Prefer sudo npm -g (E2B templates). Default from runtime mode. */
  allowSudo?: boolean;
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

  const runtime = resolveRuntimeMode();
  const features = featuresForMode(runtime.mode);
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

  // Sessions are on disk — touch log so operators know memory is kept
  try {
    const sess = daemonSessionsDir();
    if (!fs.existsSync(sess)) fs.mkdirSync(sess, { recursive: true });
  } catch {
    /* ignore */
  }

  const allowSudo = opts?.allowSudo ?? features.preferSudoNpm;
  const install = runNpmInstall(to, { allowSudo });
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
  // E2B mode always restarts on confirm unless explicitly disabled
  const shouldRestart =
    opts?.restartDaemon === true ||
    (opts?.restartDaemon !== false &&
      features.selfUpdateWithRestart &&
      process.env.XIBECODE_UPDATE_RESTART !== '0');

  if (shouldRestart) {
    restarted = scheduleDaemonRelaunch();
  }

  return {
    ok: true,
    from,
    to,
    verified,
    logs:
      install.logs +
      `\n# sessions preserved: ${daemonSessionsDir()}` +
      (restarted ? '\n# daemon relaunch scheduled' : ''),
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
  const runtime = resolveRuntimeMode();
  const hosted = avail.hosted || runtime.isE2b || isE2bHostedRuntime();
  const lines = [
    `**Update available:** \`${avail.latest}\` (you have \`${avail.current}\`)`,
    `Runtime: **${runtime.mode}**`,
    '',
    hosted
      ? [
          '**E2B mode:** reply **`/update yes`** to run:',
          '• `npm i -g xibecode@latest` (then `sudo -n npm …` if needed)',
          '• restart the daemon automatically',
          '• **keep chat memory** (`~/.xibecode/daemon/sessions/`) + workspace + secrets',
        ].join('\n')
      : '**Default mode:** reply **`/update yes`** to install, or run `npm i -g xibecode@latest` locally (no auto-restart unless `--restart`).',
    'Dismiss: `/update no`',
  ];
  return lines.join('\n');
}

export { isE2bHostedRuntime, updateCheckDisabled };
export { resolveRuntimeMode, describeRuntimeMode, featuresForMode } from './runtime-mode.js';
export type { RuntimeMode, RuntimeModeInfo } from './runtime-mode.js';
