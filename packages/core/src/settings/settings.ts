/**
 * SettingsManager - Multi-source settings with layered merge.
 *
 * Loads settings from 4 sources in priority order, merges them,
 * and provides a single unified view. Supports caching, invalidation,
 * and per-source writes.
 *
 * Usage:
 *   const mgr = new SettingsManager();
 *   const settings = await mgr.getSettings();
 *   await mgr.updateSource('project', { permissions: { allow: ['Read(*)'] } });
 */

import type { SettingsSchema, SettingsSource, SettingsSourceEntry } from './settings-types.js';
import { mergeSettings, mergeSettingsStack } from './settings-merge.js';
import { getSourcePaths, loadAllSources, writeSourceFile } from './settings-sources.js';

export interface SettingsManagerOptions {
  /** Working directory for project/local settings. */
  cwd?: string;
  /** Base directory for user/policy settings. */
  baseDir?: string;
}

export class SettingsManager {
  private options: SettingsManagerOptions;
  private cache: SettingsSchema | null = null;
  private sourceEntries: SettingsSourceEntry[] = [];
  private cacheValid = false;

  constructor(options?: SettingsManagerOptions) {
    this.options = options || {};
  }

  /**
   * Get the merged settings from all sources.
   * Results are cached for the session; call reload() to refresh.
   */
  async getSettings(): Promise<SettingsSchema> {
    if (this.cacheValid && this.cache) {
      return this.cache;
    }

    this.sourceEntries = await loadAllSources({
      cwd: this.options.cwd,
      baseDir: this.options.baseDir,
    });

    const stack = this.sourceEntries.map((e) => e.settings);
    this.cache = mergeSettingsStack(stack);
    this.cacheValid = true;
    return this.cache;
  }

  /**
   * Get settings from a specific source only.
   */
  async getSourceSettings(source: SettingsSource): Promise<SettingsSchema | null> {
    if (!this.cacheValid) {
      await this.getSettings();
    }
    const entry = this.sourceEntries.find((e) => e.source === source);
    return entry?.settings ?? null;
  }

  /**
   * Get all loaded source entries (for diagnostics).
   */
  async getSourceEntries(): Promise<SettingsSourceEntry[]> {
    if (!this.cacheValid) {
      await this.getSettings();
    }
    return [...this.sourceEntries];
  }

  /**
   * Update settings for a specific source. Merges with existing source settings.
   */
  async updateSource(source: SettingsSource, updates: SettingsSchema): Promise<void> {
    const paths = getSourcePaths({
      cwd: this.options.cwd,
      baseDir: this.options.baseDir,
    });
    const filePath = paths[source];

    // Load existing source settings, merge updates, write back
    const existing = this.sourceEntries.find((e) => e.source === source);
    const currentSourceSettings = existing?.settings ?? {};
    const merged = mergeSettings(currentSourceSettings, updates);

    await writeSourceFile(filePath, merged);

    // Invalidate cache so next read picks up the change
    this.invalidate();
  }

  /**
   * Replace settings for a specific source entirely (no merge).
   */
  async replaceSource(source: SettingsSource, settings: SettingsSchema): Promise<void> {
    const paths = getSourcePaths({
      cwd: this.options.cwd,
      baseDir: this.options.baseDir,
    });
    const filePath = paths[source];
    await writeSourceFile(filePath, settings);
    this.invalidate();
  }

  /**
   * Invalidate the cache, forcing a reload on next access.
   */
  invalidate(): void {
    this.cache = null;
    this.cacheValid = false;
    this.sourceEntries = [];
  }

  /**
   * Force a reload from disk.
   */
  async reload(): Promise<SettingsSchema> {
    this.invalidate();
    return this.getSettings();
  }

  /**
   * Get a single setting value by key.
   */
  async get<K extends keyof SettingsSchema>(key: K): Promise<SettingsSchema[K] | undefined> {
    const settings = await this.getSettings();
    return settings[key];
  }

  /**
   * Get the file paths for all sources.
   */
  getSourcePaths(): Record<SettingsSource, string> {
    return getSourcePaths({
      cwd: this.options.cwd,
      baseDir: this.options.baseDir,
    });
  }
}
