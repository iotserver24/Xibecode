import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

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
  const v = process.env.XIBECODE_DISABLE_UPDATE_CHECK;
  return v === '1' || v === 'true';
}

function cachePath(): string {
  return join(homedir(), '.xibecode', CACHE_NAME);
}

async function readCache(): Promise<UpdateCheckCache | null> {
  if (updateCheckDisabled()) return null;
  try {
    const p = cachePath();
    const raw = await readFile(p, 'utf8');
    return JSON.parse(raw) as UpdateCheckCache;
  } catch {
    return null;
  }
}

async function writeCache(data: UpdateCheckCache): Promise<void> {
  try {
    const dir = join(homedir(), '.xibecode');
    await mkdir(dir, { recursive: true });
    await writeFile(cachePath(), JSON.stringify(data), 'utf8');
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
  const cached = await readCache();

  if (
    !options?.forceRefresh &&
    cached?.latest &&
    now - cached.checkedAt < cacheTtlMs
  ) {
    return { latest: cached.latest, fromCache: true };
  }

  try {
    const latest = await fetchLatestNpmVersion({ timeoutMs: options?.timeoutMs });
    await writeCache({ checkedAt: now, latest });
    return { latest, fromCache: false };
  } catch {
    await writeCache({ checkedAt: now, latest: cached?.latest });
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
