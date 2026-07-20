import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Compare semver release cores (major.minor.patch), ignoring prerelease tags.
 * Returns positive if a > b.
 */
export function compareSemverCore(a: string, b: string): number {
  const coreA = a.split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const coreB = b.split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = coreA[i] ?? 0;
    const y = coreB[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

const NPM_PKG = 'xibecode';
const DEFAULT_REGISTRY = `https://registry.npmjs.org/${NPM_PKG}/latest`;
const CACHE_NAME = 'update-check.json';

export type UpdateCheckCache = {
  checkedAt: number;
  latest?: string;
};

export function updateCheckDisabled(): boolean {
  const v =
    process.env.XIBECODE_DISABLE_UPDATE_CHECK ||
    process.env.XIBECODE_DISABLE_AUTO_UPDATE;
  return v === '1' || v === 'true';
}

/**
 * True when running inside E2B / Vectra Cloud / hosted sandbox templates.
 * Used to avoid silent self-updates; dashboard/hosting drives opt-in upgrades.
 */
export function isE2bHostedRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.XIBECODE_HOSTED === '1' || env.XIBECODE_HOSTED === 'true') return true;
  if (env.XIBECODE_SANDBOX_MODE === 'e2b') return true;
  if (env.E2B === '1' || env.E2B === 'true') return true;
  if (env.E2B_SANDBOX_ID || env.E2B_SANDBOX) return true;
  // Template layout: workspace + home under /home/user
  try {
    if (
      existsSync('/home/user/workspace') &&
      (env.HOME === '/home/user' || env.USER === 'user')
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export type UpdateAvailability = {
  current: string;
  latest: string;
  updateAvailable: boolean;
  fromCache: boolean;
  hosted: boolean;
  disabled: boolean;
};

/**
 * Compare current package version to npm latest (cached).
 * Never installs — check only.
 */
export async function checkUpdateAvailable(
  currentVersion: string,
  options?: { forceRefresh?: boolean; cacheTtlMs?: number; timeoutMs?: number },
): Promise<UpdateAvailability> {
  const hosted = isE2bHostedRuntime();
  if (updateCheckDisabled()) {
    return {
      current: currentVersion,
      latest: currentVersion,
      updateAvailable: false,
      fromCache: false,
      hosted,
      disabled: true,
    };
  }
  try {
    const { latest, fromCache } = await getNpmLatestVersion({
      forceRefresh: options?.forceRefresh,
      cacheTtlMs: options?.cacheTtlMs,
      timeoutMs: options?.timeoutMs,
    });
    return {
      current: currentVersion,
      latest,
      updateAvailable: compareSemverCore(latest, currentVersion) > 0,
      fromCache,
      hosted,
      disabled: false,
    };
  } catch {
    return {
      current: currentVersion,
      latest: currentVersion,
      updateAvailable: false,
      fromCache: false,
      hosted,
      disabled: false,
    };
  }
}

function cachePath(): string {
  return join(homedir(), '.xibecode', CACHE_NAME);
}

function readCache(): UpdateCheckCache | null {
  if (updateCheckDisabled()) return null;
  try {
    const p = cachePath();
    if (!existsSync(p)) return null;
    const raw = readFileSync(p, 'utf8');
    return JSON.parse(raw) as UpdateCheckCache;
  } catch {
    return null;
  }
}

function writeCache(data: UpdateCheckCache): void {
  try {
    const dir = join(homedir(), '.xibecode');
    mkdirSync(dir, { recursive: true });
    writeFileSync(cachePath(), JSON.stringify(data), 'utf8');
  } catch {
    // best-effort
  }
}

export async function fetchLatestNpmVersion(options?: {
  timeoutMs?: number;
  registryUrl?: string;
}): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 2500;
  const url = options?.registryUrl ?? DEFAULT_REGISTRY;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`registry responded ${res.status}`);
    }
    const data = (await res.json()) as { version?: string };
    if (!data.version || typeof data.version !== 'string') {
      throw new Error('missing version in registry payload');
    }
    return data.version.trim();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Returns registry latest version, using cache when fresh unless forceRefresh.
 */
export async function getNpmLatestVersion(options?: {
  forceRefresh?: boolean;
  cacheTtlMs?: number;
  timeoutMs?: number;
}): Promise<{ latest: string; fromCache: boolean }> {
  const cacheTtlMs = options?.cacheTtlMs ?? 48 * 60 * 60 * 1000;
  const now = Date.now();
  const cached = readCache();

  if (
    !options?.forceRefresh &&
    cached?.latest &&
    now - cached.checkedAt < cacheTtlMs
  ) {
    return { latest: cached.latest, fromCache: true };
  }

  try {
    const latest = await fetchLatestNpmVersion({ timeoutMs: options?.timeoutMs });
    writeCache({ checkedAt: now, latest });
    return { latest, fromCache: false };
  } catch {
    writeCache({ checkedAt: now, latest: cached?.latest });
    if (cached?.latest) {
      return { latest: cached.latest, fromCache: true };
    }
    throw new Error('Could not reach npm registry for version check.');
  }
}

/** Where users read release context without a separate publishing workflow. */
export const NPM_PACKAGE_PAGE = 'https://www.npmjs.com/package/xibecode';

/**
 * If registry has a newer version than current, print a short notice to stderr (non-blocking UX).
 * Respects cache TTL to avoid network on every chat start.
 */
export async function maybePrintUpdateNotice(
  currentVersion: string,
  options?: { cacheTtlMs?: number; timeoutMs?: number },
): Promise<void> {
  if (updateCheckDisabled()) return;

  try {
    const { latest } = await getNpmLatestVersion({
      cacheTtlMs: options?.cacheTtlMs,
      timeoutMs: options?.timeoutMs,
    });
    if (compareSemverCore(latest, currentVersion) <= 0) {
      return;
    }
    const chalk = (await import('chalk')).default;
    const dim = (s: string) => chalk.dim(s);
    const yellow = (s: string) => chalk.yellow(s);
    console.error('');
    console.error(
      yellow(`Update available: ${latest}`) + dim(` (you have ${currentVersion})`),
    );
    console.error(dim(`npm package: ${NPM_PACKAGE_PAGE}`));
    console.error(dim('Upgrade: pnpm add -g xibecode@latest  |  npm i -g xibecode@latest'));
    console.error(dim('Disable notices: XIBECODE_DISABLE_UPDATE_CHECK=1'));
    console.error('');
  } catch {
    // ignore — offline / registry errors should never block chat
  }
}
