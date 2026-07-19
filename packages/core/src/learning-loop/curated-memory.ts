/**
 * Hermes-style bounded curated memory:
 *   MEMORY.md  — environment / project / lessons (agent notes)
 *   USER.md    — user preferences / profile
 *
 * Frozen at session start for prompt stability; tool writes persist immediately.
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

const SEP = ' § ';

export class CuratedMemoryStore {
  private baseDir: string;
  private memoryLimit: number;
  private userLimit: number;
  private enabled: boolean;
  /** Frozen snapshot for system prompt (session start). */
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

  private fileFor(target: CuratedTarget): string {
    return path.join(this.baseDir, target === 'user' ? 'USER.md' : 'MEMORY.md');
  }

  private limitFor(target: CuratedTarget): number {
    return target === 'user' ? this.userLimit : this.memoryLimit;
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  /** Parse entries separated by § or double newlines. */
  parseEntries(raw: string): string[] {
    if (!raw.trim()) return [];
    if (raw.includes('§')) {
      return raw
        .split(/\s*§\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return raw
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async loadEntries(target: CuratedTarget): Promise<string[]> {
    try {
      const raw = await fs.readFile(this.fileFor(target), 'utf-8');
      // Strip markdown header if present
      const body = raw.replace(/^#.*\n+/m, '');
      return this.parseEntries(body);
    } catch {
      return [];
    }
  }

  private async writeEntries(target: CuratedTarget, entries: string[]): Promise<void> {
    await this.ensureDir();
    const title = target === 'user' ? '# USER PROFILE' : '# MEMORY';
    const body = entries.length ? entries.join(SEP) : '';
    await fs.writeFile(this.fileFor(target), `${title}\n\n${body}\n`, 'utf-8');
  }

  private usage(entries: string[], limit: number): string {
    const chars = entries.join(SEP).length;
    const pct = Math.min(100, Math.round((chars / limit) * 100));
    return `${pct}% — ${chars}/${limit} chars`;
  }

  /**
   * Freeze current disk state for system-prompt injection (call once per session).
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

  /** Render frozen blocks for system prompt. */
  formatForSystemPrompt(): string {
    if (!this.enabled || !this.frozen) return '';
    const parts: string[] = [];
    if (this.frozen.memory.length) {
      parts.push(
        `══════════════════════════════════════════════\n` +
          `MEMORY (your notes) [${this.usage(this.frozen.memory, this.memoryLimit)}]\n` +
          `══════════════════════════════════════════════\n` +
          this.frozen.memory.join(SEP),
      );
    }
    if (this.frozen.user.length) {
      parts.push(
        `══════════════════════════════════════════════\n` +
          `USER PROFILE [${this.usage(this.frozen.user, this.userLimit)}]\n` +
          `══════════════════════════════════════════════\n` +
          this.frozen.user.join(SEP),
      );
    }
    return parts.join('\n\n');
  }

  async add(
    target: CuratedTarget,
    content: string,
  ): Promise<{ success: boolean; message: string; usage?: string; entries?: string[] }> {
    const entry = content.trim();
    if (!entry) return { success: false, message: 'Empty content' };

    const entries = await this.loadEntries(target);
    // Exact duplicate
    if (entries.some((e) => e === entry)) {
      return { success: true, message: 'Already present (no duplicate added)' };
    }

    const limit = this.limitFor(target);
    const next = [...entries, entry];
    const chars = next.join(SEP).length;
    if (chars > limit) {
      return {
        success: false,
        message:
          `Memory at ${entries.join(SEP).length}/${limit} chars. ` +
          `Adding this entry (${entry.length} chars) would exceed the limit. ` +
          `Consolidate with replace/remove, then retry.`,
        usage: this.usage(entries, limit),
        entries,
      };
    }
    await this.writeEntries(target, next);
    return {
      success: true,
      message: `Added to ${target}`,
      usage: this.usage(next, limit),
      entries: next,
    };
  }

  async replace(
    target: CuratedTarget,
    oldText: string,
    content: string,
  ): Promise<{ success: boolean; message: string; usage?: string }> {
    const entries = await this.loadEntries(target);
    const matches = entries
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.includes(oldText));
    if (matches.length === 0) {
      return { success: false, message: `No entry matched old_text "${oldText}"` };
    }
    if (matches.length > 1) {
      return {
        success: false,
        message: `Ambiguous old_text matched ${matches.length} entries — be more specific`,
      };
    }
    const next = entries.slice();
    next[matches[0]!.i] = content.trim();
    const limit = this.limitFor(target);
    if (next.join(SEP).length > limit) {
      return {
        success: false,
        message: `Replace would exceed ${limit} chars. Shorten content or remove another entry.`,
        usage: this.usage(entries, limit),
      };
    }
    await this.writeEntries(target, next);
    return {
      success: true,
      message: `Replaced in ${target}`,
      usage: this.usage(next, limit),
    };
  }

  async remove(
    target: CuratedTarget,
    oldText: string,
  ): Promise<{ success: boolean; message: string }> {
    const entries = await this.loadEntries(target);
    const matches = entries
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.includes(oldText));
    if (matches.length === 0) {
      return { success: false, message: `No entry matched "${oldText}"` };
    }
    if (matches.length > 1) {
      return {
        success: false,
        message: `Ambiguous match (${matches.length}). Be more specific.`,
      };
    }
    const next = entries.filter((_, i) => i !== matches[0]!.i);
    await this.writeEntries(target, next);
    return { success: true, message: `Removed from ${target}` };
  }
}
