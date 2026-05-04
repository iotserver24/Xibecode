/**
 * Persistent session memory for a single run (and optionally across runs).
 * Records tool attempts, failures, and "what we learned" to avoid repeating mistakes.
 *
 * Now uses JSONL transcript entries as the primary persistence mechanism.
 * Falls back to the legacy `.xibecode/sessions/` directory for backward compat.
 * When a transcript file is available, attempts and learnings are written as
 * `attempt` and `learning` entry types in the JSONL, eliminating the need
 * for separate session files.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { UUID } from 'crypto';
import { generateUuid } from './transcript-types.js';
import { getTranscriptWriter } from './transcript-writer.js';

export interface AttemptRecord {
  tool: string;
  success: boolean;
  message?: string;
  ts: number;
}

export interface SessionMemoryData {
  sessionId: string;
  startedAt: number;
  attempts: AttemptRecord[];
  learnings: string[];
}

const MAX_ATTEMPTS_IN_SUMMARY = 15;
const MAX_LEARNINGS_IN_SUMMARY = 5;
const SUMMARY_FAILURE_CAP = 8;

/**
 * Session memory: persists for the run and optionally to the JSONL transcript
 * or legacy `.xibecode/sessions/` so future runs can load "what we learned"
 * and recent failures.
 */
export class SessionMemory {
  private sessionId: string;
  private startedAt: number;
  private attempts: AttemptRecord[] = [];
  private learnings: string[] = [];
  private persistDir: string;
  /** If set, writes to JSONL transcript instead of separate files. */
  private transcriptFilePath: string | null = null;

  constructor(
    private workingDir: string,
    sessionId?: string
  ) {
    this.sessionId = sessionId ?? `run_${Date.now()}`;
    this.startedAt = Date.now();
    this.persistDir = path.join(workingDir, '.xibecode', 'sessions');
  }

  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Enable JSONL transcript persistence for this session memory.
   * When set, attempts and learnings are written to the transcript file
   * instead of separate `.xibecode/sessions/` files.
   */
  setTranscriptPath(filePath: string): void {
    this.transcriptFilePath = filePath;
  }

  /** Record a tool attempt (success or failure). */
  recordAttempt(tool: string, success: boolean, message?: string): void {
    const attempt: AttemptRecord = {
      tool,
      success,
      message: message && message.slice(0, 500),
      ts: Date.now(),
    };
    this.attempts.push(attempt);

    // Write to transcript if available
    if (this.transcriptFilePath) {
      const writer = getTranscriptWriter();
      writer.enqueueWrite(this.transcriptFilePath, {
        type: 'attempt',
        uuid: generateUuid(),
        parentUuid: null,
        timestamp: new Date(attempt.ts).toISOString(),
        sessionId: this.sessionId,
        tool: attempt.tool,
        success: attempt.success,
        message: attempt.message || '',
      }).catch(() => {
        // Non-fatal — transcript writes are best-effort
      });
    }
  }

  /** Record a short "what we learned" note (e.g. after a failure or retry). */
  recordLearning(summary: string): void {
    const s = summary.trim().slice(0, 500);
    if (!s) return;
    this.learnings.push(s);

    // Write to transcript if available
    if (this.transcriptFilePath) {
      const writer = getTranscriptWriter();
      writer.enqueueWrite(this.transcriptFilePath, {
        type: 'learning',
        uuid: generateUuid(),
        parentUuid: null,
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        learning: s,
      }).catch(() => {
        // Non-fatal
      });
    }
  }

  /**
   * Compact summary for the system prompt: recent failures + learnings
   * so the agent can avoid repeating the same mistakes.
   */
  getSummary(): string {
    const failures = this.attempts
      .filter(a => !a.success)
      .slice(-SUMMARY_FAILURE_CAP)
      .map(a => `- ${a.tool}${a.message ? `: ${a.message}` : ''}`);

    const recentLearnings = this.learnings.slice(-MAX_LEARNINGS_IN_SUMMARY);

    const parts: string[] = [];
    if (failures.length > 0) {
      parts.push('Recent failures to avoid repeating:\n' + failures.join('\n'));
    }
    if (recentLearnings.length > 0) {
      parts.push('Session learnings:\n' + recentLearnings.map(l => `- ${l}`).join('\n'));
    }
    if (parts.length === 0) return '';
    return '\n## Session memory (this run)\n\n' + parts.join('\n\n') + '\n';
  }

  /** Persist session — uses transcript if available, otherwise legacy file. */
  async persist(): Promise<void> {
    if (this.transcriptFilePath) {
      // Transcript persistence is handled incrementally by recordAttempt/recordLearning.
      // Just flush the writer to ensure everything is on disk.
      const writer = getTranscriptWriter();
      await writer.flush();
      return;
    }

    // Legacy fallback: persist to .xibecode/sessions/<sessionId>.json
    try {
      await fs.mkdir(this.persistDir, { recursive: true });
      const data: SessionMemoryData = {
        sessionId: this.sessionId,
        startedAt: this.startedAt,
        attempts: this.attempts.slice(-MAX_ATTEMPTS_IN_SUMMARY * 2),
        learnings: this.learnings,
      };
      const file = path.join(this.persistDir, `${this.sessionId}.json`);
      await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // Non-fatal
    }
  }

  /** Load a previous session's learnings. Tries transcript first, then legacy. */
  async loadPreviousLearnings(limit: number = MAX_LEARNINGS_IN_SUMMARY): Promise<void> {
    // Try to load from transcript entries (if a transcript path is set)
    if (this.transcriptFilePath) {
      try {
        const { loadTranscriptFile } = await import('./transcript-reader.js');
        const { entries } = await loadTranscriptFile(this.transcriptFilePath);
        const learningEntries = entries.filter((e) => e.type === 'learning');
        if (learningEntries.length > 0) {
          const recentLearnings = learningEntries
            .slice(-limit)
            .map((e) => (e as { learning: string }).learning);
          this.learnings.push(...recentLearnings);
          return;
        }
      } catch {
        // Fall through to legacy loading
      }
    }

    // Legacy fallback: load from .xibecode/sessions/
    try {
      const entries = await fs.readdir(this.persistDir).catch(() => []);
      const jsonFiles = entries.filter(f => f.endsWith('.json')).sort().reverse();
      for (const f of jsonFiles.slice(0, 3)) {
        const content = await fs.readFile(path.join(this.persistDir, f), 'utf-8');
        const data = JSON.parse(content) as SessionMemoryData;
        if (data.learnings?.length) {
          this.learnings.push(...data.learnings.slice(-limit));
          break;
        }
      }
    } catch {
      // Non-fatal
    }
  }
}
