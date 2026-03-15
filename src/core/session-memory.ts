/**
 * Persistent session memory for a single run (and optionally across runs).
 * Records tool attempts, failures, and "what we learned" to avoid repeating mistakes.
 * Used by the agent to inject a compact summary into the system prompt.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

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
 * Session memory: persists for the run and optionally to .xibecode/sessions/
 * so future runs can load "what we learned" and recent failures.
 */
export class SessionMemory {
  private sessionId: string;
  private startedAt: number;
  private attempts: AttemptRecord[] = [];
  private learnings: string[] = [];
  private persistDir: string;

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

  /** Record a tool attempt (success or failure). */
  recordAttempt(tool: string, success: boolean, message?: string): void {
    this.attempts.push({
      tool,
      success,
      message: message && message.slice(0, 500),
      ts: Date.now(),
    });
  }

  /** Record a short "what we learned" note (e.g. after a failure or retry). */
  recordLearning(summary: string): void {
    const s = summary.trim().slice(0, 500);
    if (s) this.learnings.push(s);
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

  /** Persist session to .xibecode/sessions/<sessionId>.json for optional cross-run loading. */
  async persist(): Promise<void> {
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

  /** Load a previous session's learnings (e.g. last run) to prime this run. */
  async loadPreviousLearnings(limit: number = MAX_LEARNINGS_IN_SUMMARY): Promise<void> {
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
