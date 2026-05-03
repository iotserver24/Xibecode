import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Reads and writes the same ~/.xibecode/profile-<name>.json config file
 * that the xibecode CLI uses (via the `conf` npm package).
 *
 * The conf package stores its files at:
 *   <cwd>/<configName>.json  →  ~/.xibecode/profile-default.json
 */
export interface XibeCodeConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  provider?: string;
  maxIterations?: number;
  costMode?: 'normal' | 'economy';
  economyModel?: string;
  economyMaxIterations?: number;
  planningModel?: string;
  executionModel?: string;
  defaultVerbose?: boolean;
  showThinking?: boolean;
  preferredPackageManager?: string;
  testCommandOverride?: string;
}

export interface XibeCodeMeta {
  defaultProfile?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.xibecode');

function metaPath(): string {
  return path.join(CONFIG_DIR, 'meta.json');
}

function profilePath(profile: string): string {
  return path.join(CONFIG_DIR, `profile-${profile}.json`);
}

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/** Returns the current active profile name (mirrors CLI ConfigManager). */
export function getActiveProfile(): string {
  const meta = readJson<XibeCodeMeta>(metaPath());
  return meta?.defaultProfile?.trim() || 'default';
}

/** Returns list of all profile names found on disk. */
export function listProfiles(): string[] {
  try {
    const entries = fs.readdirSync(CONFIG_DIR);
    const names = entries
      .filter((f) => f.startsWith('profile-') && f.endsWith('.json'))
      .map((f) => f.replace(/^profile-/, '').replace(/\.json$/, ''))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return names.length ? names : ['default'];
  } catch {
    return ['default'];
  }
}

/** Sets the default profile in meta.json. */
export function setDefaultProfile(name: string): void {
  const existing = readJson<XibeCodeMeta>(metaPath()) || {};
  writeJson(metaPath(), { ...existing, defaultProfile: name });
}

/** Reads config for a given profile. */
export function readConfig(profile?: string): XibeCodeConfig {
  const p = profile || getActiveProfile();
  return readJson<XibeCodeConfig>(profilePath(p)) || {};
}

/** Writes (merges) config for a given profile. */
export function writeConfig(updates: Partial<XibeCodeConfig>, profile?: string): void {
  const p = profile || getActiveProfile();
  const existing = readConfig(p);
  const merged = { ...existing, ...updates };
  // Remove undefined / empty-string values so the file stays clean
  for (const k of Object.keys(merged) as (keyof XibeCodeConfig)[]) {
    const v = merged[k];
    if (v === undefined || v === '') {
      delete merged[k];
    }
  }
  writeJson(profilePath(p), merged);
}

/** Clears all keys from a profile config. */
export function clearConfig(profile?: string): void {
  const p = profile || getActiveProfile();
  writeJson(profilePath(p), {});
}

/** Masks an API key for safe display. */
export function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return '****';
  return key.slice(0, 8) + '...' + key.slice(-4);
}
