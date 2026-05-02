/**
 * Settings source loading from filesystem.
 *
 * Sources in priority order (lowest to highest):
 *   1. User settings:   ~/.xibecode/settings.json
 *   2. Project settings: <cwd>/.xibecode/settings.json
 *   3. Local settings:   <cwd>/.xibecode/settings.local.json  (gitignored)
 *   4. Policy settings:  ~/.xibecode/managed-settings.json    (enterprise/MDM)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { SettingsSchema, SettingsSource, SettingsSourceEntry } from './settings-types.js';

export interface SourceLoadOptions {
  /** Working directory for project/local settings. Defaults to process.cwd(). */
  cwd?: string;
  /** Base directory for user/policy settings. Defaults to ~/.xibecode. */
  baseDir?: string;
}

/**
 * Get the file paths for each settings source.
 */
export function getSourcePaths(options?: SourceLoadOptions): Record<SettingsSource, string> {
  const cwd = options?.cwd || process.cwd();
  const baseDir = options?.baseDir || path.join(os.homedir(), '.xibecode');

  return {
    user: path.join(baseDir, 'settings.json'),
    project: path.join(cwd, '.xibecode', 'settings.json'),
    local: path.join(cwd, '.xibecode', 'settings.local.json'),
    policy: path.join(baseDir, 'managed-settings.json'),
  };
}

/**
 * Load settings from a single source file.
 * Returns null if the file doesn't exist or is malformed.
 */
export async function loadSourceFile(
  filePath: string,
  source: SettingsSource,
): Promise<SettingsSourceEntry | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as SettingsSchema;
    return { source, path: filePath, settings: parsed };
  } catch {
    return null;
  }
}

/**
 * Load all settings sources in priority order (lowest first).
 * Skips sources that don't exist or can't be parsed.
 */
export async function loadAllSources(
  options?: SourceLoadOptions,
): Promise<SettingsSourceEntry[]> {
  const paths = getSourcePaths(options);
  const sources: SettingsSource[] = ['user', 'project', 'local', 'policy'];
  const entries: SettingsSourceEntry[] = [];

  for (const source of sources) {
    const entry = await loadSourceFile(paths[source], source);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

/**
 * Write settings to a specific source file.
 * Creates the parent directory if it doesn't exist.
 */
export async function writeSourceFile(
  filePath: string,
  settings: SettingsSchema,
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const payload = JSON.stringify(settings, null, 2) + '\n';
  await fs.writeFile(filePath, payload, 'utf-8');
}
