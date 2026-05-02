/**
 * AutoMemoryManager - Main entry point for the auto-memory system.
 *
 * Coordinates memory scanning, extraction, and dream consolidation.
 * Integrates with the agent loop for turn-end extraction and
 * context injection of relevant memories.
 */

import type { AutoMemoryConfig, ExtractedMemory, MemoryFile, DreamConsolidationResult } from './memory-types.js';
import { scanMemories, ensureMemoryDir, getMemoryEntrypoint } from './memory-scan.js';
import { findRelevantMemories, formatMemoriesForContext } from './find-relevant.js';
import { extractMemoriesFromTurn, writeExtractedMemories } from './extract-memories.js';
import { runDreamConsolidation, shouldRunDream } from './dream.js';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

export type { MemoryFile, MemoryFrontmatter, MemoryType, ExtractedMemory, DreamConsolidationResult, AutoMemoryConfig } from './memory-types.js';

const DEFAULT_CONFIG: AutoMemoryConfig = {
  enabled: true,
  maxContextMemories: 5,
  maxExtractionTurns: 5,
  dreamEnabled: true,
  pruneMinAgeHours: 168,
};

export class AutoMemoryManager {
  private config: AutoMemoryConfig;
  private cwd: string;
  private baseDir?: string;
  private extractionTurnCount = 0;
  private sessionId?: string;

  constructor(options: { cwd?: string; baseDir?: string; config?: Partial<AutoMemoryConfig>; sessionId?: string }) {
    this.cwd = options.cwd || process.cwd();
    this.baseDir = options.baseDir;
    this.sessionId = options.sessionId;
    this.config = { ...DEFAULT_CONFIG, ...options.config };
  }

  /**
   * Get the memory directory path.
   */
  getMemoryDir(): string {
    return getMemoryEntrypoint(this.cwd, this.baseDir).replace('/MEMORY.md', '');
  }

  /**
   * Get the MEMORY.md entrypoint path.
   */
  getMemoryEntrypoint(): string {
    return getMemoryEntrypoint(this.cwd, this.baseDir);
  }

  /**
   * Get relevant memories formatted for injection into the agent context.
   * Returns a formatted string or empty string if no memories or disabled.
   */
  async getContextMemories(task?: string): Promise<string> {
    if (!this.config.enabled) return '';

    const result = await scanMemories(this.cwd, this.baseDir);
    const relevant = findRelevantMemories(result.memories, {
      task,
      maxResults: this.config.maxContextMemories,
    });

    return formatMemoriesForContext(relevant);
  }

  /**
   * Run memory extraction for the current conversation turn.
   * Called by the agent at the end of each turn.
   */
  async extractFromTurn(messages: MessageParam[]): Promise<number> {
    if (!this.config.enabled) return 0;
    if (this.extractionTurnCount >= this.config.maxExtractionTurns) return 0;

    this.extractionTurnCount++;

    const extracted = extractMemoriesFromTurn(messages);
    if (extracted.length === 0) return 0;

    return writeExtractedMemories(extracted, {
      cwd: this.cwd,
      baseDir: this.baseDir,
      sessionId: this.sessionId,
    });
  }

  /**
   * Write a single memory manually.
   */
  async writeMemory(memory: ExtractedMemory): Promise<void> {
    if (!this.config.enabled) return;

    await writeExtractedMemories([memory], {
      cwd: this.cwd,
      baseDir: this.baseDir,
      sessionId: this.sessionId,
    });
  }

  /**
   * Run dream consolidation if conditions are met.
   */
  async maybeDream(): Promise<DreamConsolidationResult | null> {
    if (!this.config.enabled || !this.config.dreamEnabled) return null;

    const should = await shouldRunDream({ cwd: this.cwd, baseDir: this.baseDir });
    if (!should) return null;

    return runDreamConsolidation({
      cwd: this.cwd,
      baseDir: this.baseDir,
      pruneMinAgeHours: this.config.pruneMinAgeHours,
    });
  }

  /**
   * Force dream consolidation (for manual trigger).
   */
  async dream(): Promise<DreamConsolidationResult> {
    return runDreamConsolidation({
      cwd: this.cwd,
      baseDir: this.baseDir,
      pruneMinAgeHours: this.config.pruneMinAgeHours,
    });
  }

  /**
   * Initialize the memory directory (called on session start).
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) return;
    await ensureMemoryDir(this.cwd, this.baseDir);
  }

  /**
   * Get all memories (for listing/diagnostics).
   */
  async listMemories(): Promise<MemoryFile[]> {
    if (!this.config.enabled) return [];
    const result = await scanMemories(this.cwd, this.baseDir);
    return result.memories;
  }

  /**
   * Get the current configuration.
   */
  getConfig(): AutoMemoryConfig {
    return { ...this.config };
  }

  /**
   * Update configuration at runtime.
   */
  updateConfig(updates: Partial<AutoMemoryConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}
