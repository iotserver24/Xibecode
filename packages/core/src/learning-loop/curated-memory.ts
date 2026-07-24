/**
 * Bounded curated memory:
 *   MEMORY.md  — environment / project / lessons (agent notes)
 *   USER.md    — user preferences / profile
 *
 * Frozen at session start for prompt stability (prefix-cache friendly).
 * Tool writes persist to disk immediately but do NOT mutate the frozen
 * system-prompt snapshot mid-session — it refreshes on the next session.
 *
 * Success responses are intentionally TERMINAL (done + "Write saved…")
 * and do not echo the full entry list (avoids model thrash / re-saves).
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

export type CuratedTarget = 'memory' | 'user';

export interface CuratedMemoryConfig {
  /** Base dir; default ~/.xibecode/memories */
  baseDir?: string;
  memoryCharLimit?: number;
  userCharLimit?: number;
  enabled?: boolean;
}

/** Entry delimiter — multiline-safe (§ on its own between entries). */
export const ENTRY_DELIMITER = '\n§\n';

export type CuratedMemoryResult = {
  success: boolean;
  /** When true, model should stop memory ops and continue answering. */
  done?: boolean;
  target?: CuratedTarget;
  message?: string;
  /** e.g. "42% — 900/2,200 chars" */
  usage?: string;
  entry_count?: number;
  /** Always present on successful durable writes. */
  note?: string;
  /** Only on error / over-budget paths — full list for consolidation. */
  entries?: string[];
  error?: boolean;
};

const SAVED_NOTE = 'Write saved. This update is complete — do not repeat it.';

export class CuratedMemoryStore {
  private baseDir: string;
  private memoryLimit: number;
  private userLimit: number;
  private enabled: boolean;
  /** Frozen snapshot for system prompt (session start). Never mutated by tool writes. */
  private frozen: { memory: string[]; user: string[] } | null = null;

  constructor(config: CuratedMemoryConfig = {}) {
    this.baseDir = config.baseDir || path.join(os.homedir(), '.xibecode', 'memories');
    this.memoryLimit = config.memoryCharLimit ?? 2200;
    this.userLimit = config.userCharLimit ?? 1375;
    this.enabled = config.enabled !== false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getBaseDir(): string {
    return this.baseDir;
  }

  private fileFor(target: CuratedTarget): string {
    return path.join(this.baseDir, target === 'user' ? 'USER.md' : 'MEMORY.md');
  }

  private limitFor(target: CuratedTarget): number {
    return target === 'user' ? this.userLimit : this.memoryLimit;
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  /**
   * Parse entries. Prefer `\n§\n`; also accept legacy ` § ` / bare § splits.
   */
  parseEntries(raw: string): string[] {
    if (!raw.trim()) return [];
    // Strip markdown header if present
    let body = raw.replace(/^#\s*(MEMORY|USER(?: PROFILE)?)\s*\n+/im, '');
    body = body.trim();
    if (!body) return [];

    if (body.includes(ENTRY_DELIMITER.trim()) || body.includes('§')) {
      // Normalize: split on § with optional surrounding whitespace/newlines
      return body
        .split(/\s*§\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return body
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async loadEntries(target: CuratedTarget): Promise<string[]> {
    try {
      const raw = await fs.readFile(this.fileFor(target), 'utf-8');
      // Deduplicate, keep first occurrence
      return [...new Set(this.parseEntries(raw))];
    } catch {
      return [];
    }
  }

  private async writeEntries(target: CuratedTarget, entries: string[]): Promise<void> {
    await this.ensureDir();
    const title = target === 'user' ? '# USER PROFILE' : '# MEMORY';
    const body = entries.length ? entries.join(ENTRY_DELIMITER) : '';
    // Atomic-ish: write then rename would be better; single write is fine for small files
    await fs.writeFile(this.fileFor(target), `${title}\n\n${body}\n`, 'utf-8');
  }

  private charCount(entries: string[]): number {
    if (!entries.length) return 0;
    return entries.join(ENTRY_DELIMITER).length;
  }

  private usage(entries: string[], limit: number): string {
    const chars = this.charCount(entries);
    const pct = limit > 0 ? Math.min(100, Math.round((chars / limit) * 100)) : 0;
    return `${pct}% — ${chars.toLocaleString()}/${limit.toLocaleString()} chars`;
  }

  private success(
    target: CuratedTarget,
    entries: string[],
    message?: string,
  ): CuratedMemoryResult {
    const limit = this.limitFor(target);
    return {
      success: true,
      done: true,
      target,
      usage: this.usage(entries, limit),
      entry_count: entries.length,
      message,
      note: SAVED_NOTE,
    };
  }

  /**
   * Freeze current disk state for system-prompt injection (call once per session).
   * Mid-session tool writes must NOT call this again — keeps the prompt prefix stable.
   */
  async freezeSnapshot(): Promise<void> {
    if (!this.enabled) {
      this.frozen = { memory: [], user: [] };
      return;
    }
    this.frozen = {
      memory: await this.loadEntries('memory'),
      user: await this.loadEntries('user'),
    };
  }

  /** Whether freezeSnapshot has been called. */
  hasFrozenSnapshot(): boolean {
    return this.frozen != null;
  }

  /** Render frozen blocks for system prompt (never live disk mid-session). */
  formatForSystemPrompt(): string {
    if (!this.enabled || !this.frozen) return '';
    const parts: string[] = [];
    if (this.frozen.memory.length) {
      parts.push(
        `══════════════════════════════════════════════\n` +
          `MEMORY (your notes) [${this.usage(this.frozen.memory, this.memoryLimit)}]\n` +
          `══════════════════════════════════════════════\n` +
          this.frozen.memory.join(ENTRY_DELIMITER),
      );
    }
    if (this.frozen.user.length) {
      parts.push(
        `══════════════════════════════════════════════\n` +
          `USER PROFILE (who the user is) [${this.usage(this.frozen.user, this.userLimit)}]\n` +
          `══════════════════════════════════════════════\n` +
          this.frozen.user.join(ENTRY_DELIMITER),
      );
    }
    return parts.join('\n\n');
  }

  async add(target: CuratedTarget, content: string): Promise<CuratedMemoryResult> {
    const entry = content.trim();
    if (!entry) {
      return { success: false, error: true, message: 'Empty content', target };
    }

    const entries = await this.loadEntries(target);
    if (entries.some((e) => e === entry)) {
      return {
        success: true,
        done: true,
        target,
        message: 'Already present (no duplicate added)',
        usage: this.usage(entries, this.limitFor(target)),
        entry_count: entries.length,
        note: SAVED_NOTE,
      };
    }

    const limit = this.limitFor(target);
    const next = [...entries, entry];
    if (this.charCount(next) > limit) {
      return {
        success: false,
        error: true,
        target,
        message:
          `Memory at ${this.charCount(entries).toLocaleString()}/${limit.toLocaleString()} chars. ` +
          `Adding this entry (${entry.length} chars) would exceed the limit. ` +
          `Reissue as ONE batch that removes/shortens stale entries and adds the new one together.`,
        usage: this.usage(entries, limit),
        entry_count: entries.length,
        entries, // show list only when over budget
      };
    }
    await this.writeEntries(target, next);
    return this.success(target, next, `Added to ${target}`);
  }

  async replace(
    target: CuratedTarget,
    oldText: string,
    content: string,
  ): Promise<CuratedMemoryResult> {
    const needle = oldText.trim();
    if (!needle) {
      return { success: false, error: true, message: 'old_text required', target };
    }
    const entries = await this.loadEntries(target);
    const matches = entries
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.includes(needle));
    if (matches.length === 0) {
      return {
        success: false,
        error: true,
        target,
        message: `No entry matched old_text "${needle.slice(0, 80)}"`,
        entries,
      };
    }
    if (matches.length > 1) {
      return {
        success: false,
        error: true,
        target,
        message: `Ambiguous old_text matched ${matches.length} entries — be more specific`,
        entries: matches.map((m) => m.e),
      };
    }
    const next = entries.slice();
    next[matches[0]!.i] = content.trim();
    const limit = this.limitFor(target);
    if (this.charCount(next) > limit) {
      return {
        success: false,
        error: true,
        target,
        message: `Replace would exceed ${limit.toLocaleString()} chars. Shorten content or remove another entry.`,
        usage: this.usage(entries, limit),
        entry_count: entries.length,
        entries,
      };
    }
    await this.writeEntries(target, next);
    return this.success(target, next, `Replaced in ${target}`);
  }

  async remove(target: CuratedTarget, oldText: string): Promise<CuratedMemoryResult> {
    const needle = oldText.trim();
    if (!needle) {
      return { success: false, error: true, message: 'old_text required', target };
    }
    const entries = await this.loadEntries(target);
    const matches = entries
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.includes(needle));
    if (matches.length === 0) {
      return {
        success: false,
        error: true,
        target,
        message: `No entry matched "${needle.slice(0, 80)}"`,
        entries,
      };
    }
    if (matches.length > 1) {
      return {
        success: false,
        error: true,
        target,
        message: `Ambiguous match (${matches.length}). Be more specific.`,
        entries: matches.map((m) => m.e),
      };
    }
    const next = entries.filter((_, i) => i !== matches[0]!.i);
    await this.writeEntries(target, next);
    return this.success(target, next, `Removed from ${target}`);
  }

  /**
   * Apply multiple ops atomically against the FINAL char budget.
   * Ops: { action, content?, old_text? }
   */
  async applyBatch(
    target: CuratedTarget,
    operations: Array<{ action: string; content?: string; old_text?: string }>,
  ): Promise<CuratedMemoryResult> {
    if (!operations?.length) {
      return { success: false, error: true, message: 'operations array required', target };
    }

    let next = await this.loadEntries(target);
    const limit = this.limitFor(target);

    for (const op of operations) {
      const action = String(op.action || '').toLowerCase();
      if (action === 'add') {
        const entry = String(op.content || '').trim();
        if (!entry) {
          return {
            success: false,
            error: true,
            target,
            message: 'batch: add requires content',
            entries: next,
          };
        }
        if (!next.some((e) => e === entry)) next = [...next, entry];
      } else if (action === 'replace') {
        const needle = String(op.old_text || '').trim();
        const content = String(op.content || '').trim();
        if (!needle || !content) {
          return {
            success: false,
            error: true,
            target,
            message: 'batch: replace requires old_text and content',
            entries: next,
          };
        }
        const matches = next
          .map((e, i) => ({ e, i }))
          .filter(({ e }) => e.includes(needle));
        if (matches.length !== 1) {
          return {
            success: false,
            error: true,
            target,
            message: `batch: replace matched ${matches.length} entries for "${needle.slice(0, 60)}"`,
            entries: next,
          };
        }
        next = next.slice();
        next[matches[0]!.i] = content;
      } else if (action === 'remove') {
        const needle = String(op.old_text || '').trim();
        if (!needle) {
          return {
            success: false,
            error: true,
            target,
            message: 'batch: remove requires old_text',
            entries: next,
          };
        }
        const matches = next
          .map((e, i) => ({ e, i }))
          .filter(({ e }) => e.includes(needle));
        if (matches.length !== 1) {
          return {
            success: false,
            error: true,
            target,
            message: `batch: remove matched ${matches.length} entries for "${needle.slice(0, 60)}"`,
            entries: next,
          };
        }
        next = next.filter((_, i) => i !== matches[0]!.i);
      } else {
        return {
          success: false,
          error: true,
          target,
          message: `batch: unknown action "${action}"`,
          entries: next,
        };
      }
    }

    if (this.charCount(next) > limit) {
      return {
        success: false,
        error: true,
        target,
        message:
          `Batch would exceed ${limit.toLocaleString()} chars ` +
          `(${this.charCount(next).toLocaleString()}). Remove or shorten more entries.`,
        usage: this.usage(next, limit),
        entry_count: next.length,
        entries: next,
      };
    }

    await this.writeEntries(target, next);
    return this.success(target, next, `Batch applied (${operations.length} ops) to ${target}`);
  }
}
