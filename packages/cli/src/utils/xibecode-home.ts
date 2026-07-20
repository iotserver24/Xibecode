/**
 * XibeCode home directory layout (single source of truth).
 *
 * Default: ~/.xibecode  (override with XIBECODE_HOME)
 *
 * Layout (aligned with a long-running agent home + interactive CLI):
 *
 *   $XIBECODE_HOME/
 *     profile-*.json     config profiles
 *     meta.json          active profile metadata
 *     .env               secrets (preferred)
 *     daemon.env         secrets for Xibe Daemon (preferred over legacy gateway.env)
 *     gateway.env        legacy secrets file (still read)
 *     daemon/            Xibe Daemon runtime state
 *       sessions/        messaging chat sessions
 *       logs/            daemon.log
 *       pairing.json
 *       delivery-ledger.json
 *       daemon.pid
 *     cron/              scheduled jobs
 *     memories/          curated MEMORY.md / USER.md
 *     skills/            learned + user skills
 *     logs/              shared agent logs
 *     sessions/          legacy session dumps
 *     projects/          JSONL chat transcripts per cwd
 *     file-history/      edit checkpoints
 *     pairing/           reserved (Hermes-style pairing dir; JSON still under daemon/)
 *     cache/
 *     pending/           write-approval queue
 *
 * Product name for the 24/7 process: **Xibe Daemon**
 * CLI: `xibecode daemon` (alias: `xibecode gateway`)
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { existsSync, renameSync, mkdirSync, readFileSync } from 'fs';

const DIR_MODE = 0o700;

export const DAEMON_PRODUCT_NAME = 'Xibe Daemon';
export const DAEMON_SERVICE_NAME = 'xibecode-daemon';
/** Legacy systemd unit kept for start/stop fallback */
export const DAEMON_SERVICE_LEGACY = 'xibecode-gateway';

export function getXibecodeHome(): string {
  const env = process.env.XIBECODE_HOME?.trim();
  if (env) return path.resolve(env);
  return path.join(os.homedir(), '.xibecode');
}

export function paths(home = getXibecodeHome()) {
  const daemon = path.join(home, 'daemon');
  const legacyGateway = path.join(home, 'gateway');
  return {
    home,
    meta: path.join(home, 'meta.json'),
    envFile: path.join(home, '.env'),
    daemonEnv: path.join(home, 'daemon.env'),
    /** @deprecated use daemonEnv; still read for BC */
    gatewayEnv: path.join(home, 'gateway.env'),
    daemon,
    daemonSessions: path.join(daemon, 'sessions'),
    daemonLogs: path.join(daemon, 'logs'),
    daemonLogFile: path.join(daemon, 'logs', 'daemon.log'),
    daemonPid: path.join(daemon, 'daemon.pid'),
    pairingFile: path.join(daemon, 'pairing.json'),
    deliveryLedger: path.join(daemon, 'delivery-ledger.json'),
    cron: path.join(home, 'cron'),
    memories: path.join(home, 'memories'),
    skills: path.join(home, 'skills'),
    learnedSkills: path.join(home, 'skills', 'learned'),
    logs: path.join(home, 'logs'),
    sessions: path.join(home, 'sessions'),
    projects: path.join(home, 'projects'),
    fileHistory: path.join(home, 'file-history'),
    pairingDir: path.join(home, 'pairing'),
    cache: path.join(home, 'cache'),
    pending: path.join(home, 'pending'),
    sessionIndex: path.join(home, 'session-index'),
    legacyGateway,
  } as const;
}

/**
 * One-time migrate ~/.xibecode/gateway → ~/.xibecode/daemon when needed.
 */
export function migrateLegacyGatewayDir(home = getXibecodeHome()): void {
  const p = paths(home);
  try {
    if (existsSync(p.legacyGateway) && !existsSync(p.daemon)) {
      renameSync(p.legacyGateway, p.daemon);
    }
  } catch {
    /* best-effort */
  }
  // If both exist, leave both; readers prefer daemon/
}

/**
 * Ensure standard home subdirs exist (owner-only on POSIX).
 */
export async function ensureXibecodeHome(home = getXibecodeHome()): Promise<string> {
  migrateLegacyGatewayDir(home);
  const p = paths(home);
  const dirs = [
    p.home,
    p.daemon,
    p.daemonSessions,
    p.daemonLogs,
    p.cron,
    p.memories,
    p.skills,
    p.learnedSkills,
    p.logs,
    p.sessions,
    p.projects,
    p.fileHistory,
    p.pairingDir,
    p.cache,
    p.pending,
    p.sessionIndex,
  ];
  for (const d of dirs) {
    await fs.mkdir(d, { recursive: true, mode: DIR_MODE });
    try {
      await fs.chmod(d, DIR_MODE);
    } catch {
      /* windows / no-op */
    }
  }
  return home;
}

/** Sync ensure for early boot (systemd install path). */
export function ensureXibecodeHomeSync(home = getXibecodeHome()): string {
  migrateLegacyGatewayDir(home);
  const p = paths(home);
  for (const d of [
    p.home,
    p.daemon,
    p.daemonSessions,
    p.daemonLogs,
    p.cron,
    p.memories,
    p.skills,
    p.logs,
  ]) {
    try {
      mkdirSync(d, { recursive: true, mode: DIR_MODE });
    } catch {
      /* */
    }
  }
  return home;
}

/** Daemon runtime root (after migration). */
export function daemonHome(home = getXibecodeHome()): string {
  migrateLegacyGatewayDir(home);
  const p = paths(home);
  if (existsSync(p.daemon)) return p.daemon;
  if (existsSync(p.legacyGateway)) return p.legacyGateway;
  return p.daemon;
}

/** @deprecated alias — prefer daemonHome */
export const gatewayHome = daemonHome;

/**
 * Env files for secrets — prefer .env, then daemon.env, then legacy gateway.env.
 */
export function secretEnvFiles(home = getXibecodeHome()): string[] {
  const p = paths(home);
  return [p.envFile, p.daemonEnv, p.gatewayEnv];
}

/**
 * Load `~/.xibecode/.env`, `daemon.env`, and legacy `gateway.env` into process.env.
 * Does not overwrite keys already set in the environment (systemd / shell win).
 * Returns paths that were successfully loaded.
 */
export function loadSecretEnvFiles(home = getXibecodeHome()): string[] {
  const loaded: string[] = [];
  for (const file of secretEnvFiles(home)) {
    if (!existsSync(file)) continue;
    try {
      const raw = readFileSync(file, 'utf-8');
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
        let val = trimmed.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
      loaded.push(file);
    } catch {
      /* ignore unreadable env files */
    }
  }
  return loaded;
}

/** Redact bot tokens / API keys from log lines (Telegram URLs embed the token). */
export function redactSecrets(text: string): string {
  if (!text) return text;
  return text
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot***')
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})/g, 'sk-***')
    .replace(/\b(xox[baprs]-[A-Za-z0-9-]+)/g, 'xox***')
    .replace(/\b(xapp-[A-Za-z0-9-]+)/g, 'xapp-***')
    .replace(/(api[_-]?key|token|password|secret)\s*[:=]\s*\S+/gi, '$1=***');
}

/** Primary path to write new daemon secrets. */
export function primarySecretEnvPath(home = getXibecodeHome()): string {
  const p = paths(home);
  // Prefer existing file so we don't split secrets
  if (existsSync(p.gatewayEnv)) return p.gatewayEnv;
  if (existsSync(p.daemonEnv)) return p.daemonEnv;
  if (existsSync(p.envFile)) return p.envFile;
  return p.daemonEnv;
}

export function profilePath(profile: string, home = getXibecodeHome()): string {
  return path.join(home, `profile-${profile}.json`);
}

/** systemd unit names to try (new first, legacy fallback). */
export function daemonServiceNames(): string[] {
  return [DAEMON_SERVICE_NAME, DAEMON_SERVICE_LEGACY];
}
