/**
 * Append-only JSONL transcript writer with batched write queue.
 *
 * Entries are enqueued and drained in batches every 100ms (or on explicit flush),
 * reducing I/O syscalls while maintaining durability. The write queue is per-file
 * so multiple sessions can write concurrently without interleaving.
 *
 * On process exit, the cleanup handler flushes pending writes and re-appends
 * metadata entries (customTitle, tag, lastPrompt) to ensure they remain within
 * the 64KB tail window that the reader uses for lite metadata extraction.
 *
 * @module transcript-writer
 */

import { appendFile, mkdir } from 'fs/promises';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { UUID } from 'crypto';
import type { Entry } from './transcript-types.js';

// ─── Constants ──────────────────────────────────────────────────

/** Maximum size of a single append chunk before splitting. */
const MAX_CHUNK_BYTES = 100 * 1024 * 1024; // 100 MB

/** How often to drain the write queue (ms). */
const FLUSH_INTERVAL_MS = 100;

// ─── Synchronous Append ─────────────────────────────────────────

/**
 * Append a single entry to a file synchronously.
 * Used for metadata re-append during cleanup where async I/O is unsafe.
 */
export function appendEntryToFile(filePath: string, entry: Entry): void {
  const line = JSON.stringify(entry) + '\n';
  try {
    writeFileSync(filePath, line, { flag: 'a', mode: 0o600 });
  } catch {
    // Directory may not exist — create it and retry
    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
    writeFileSync(filePath, line, { flag: 'a', mode: 0o600 });
  }
}

// ─── Transcript Writer ──────────────────────────────────────────

/**
 * Batched append-only writer for JSONL transcript files.
 *
 * Usage:
 *   const writer = new TranscriptWriter();
 *   writer.enqueueWrite('/path/to/session.jsonl', userEntry);
 *   await writer.flush(); // explicit drain
 *   // On process exit, registered cleanup handler flushes automatically
 */
export class TranscriptWriter {
  private writeQueues = new Map<string, Array<{ entry: Entry; resolve: () => void }>>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private activeDrain: Promise<void> | null = null;
  private pendingWriteCount = 0;
  private flushResolvers: Array<() => void> = [];

  // ─── Session Metadata Cache ───────────────────────────────────

  /** Current session's custom title, cached for re-append on exit. */
  currentSessionTitle: string | undefined;
  /** Current session's tag. */
  currentSessionTag: string | undefined;
  /** Current session's last user prompt. */
  currentSessionLastPrompt: string | undefined;
  /** The file path for the active session transcript. */
  sessionFile: string | null = null;
  /** The current session ID (for resume hint). */
  private sessionId: string | null = null;

  // ─── Public API ───────────────────────────────────────────────

  /**
   * Set the current session ID (for resume hint and metadata).
   */
  setSessionId(id: string): void {
    this.sessionId = id;
  }

  /**
   * Get the current session ID.
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Enqueue an entry for writing to a transcript file.
   * Returns a promise that resolves once the entry is persisted to disk.
   */
  enqueueWrite(filePath: string, entry: Entry): Promise<void> {
    return new Promise<void>((resolve) => {
      let queue = this.writeQueues.get(filePath);
      if (!queue) {
        queue = [];
        this.writeQueues.set(filePath, queue);
      }
      queue.push({ entry, resolve });
      this.pendingWriteCount++;
      this.scheduleDrain();
    });
  }

  /**
   * Flush all pending writes to disk immediately.
   * Returns a promise that resolves when all currently queued writes are done.
   */
  async flush(): Promise<void> {
    // If a drain is already in progress, wait for it then flush again
    if (this.activeDrain) {
      await this.activeDrain;
    }

    // If there are still pending writes, wait for them
    if (this.pendingWriteCount > 0) {
      await new Promise<void>((resolve) => {
        this.flushResolvers.push(resolve);
      });
    }

    // Clear the timer since we just flushed
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Re-append cached session metadata to the end of the transcript file.
   * Ensures metadata stays within the 64KB tail window that
   * readLiteMetadata reads during progressive loading.
   *
   * Called during cleanup on session exit.
   */
  reAppendSessionMetadata(): void {
    if (!this.sessionFile) return;

    const sessionId = this.lastSessionId;
    if (!sessionId) return;

    // Write lastPrompt first so title/tag land closer to EOF
    if (this.currentSessionLastPrompt) {
      appendEntryToFile(this.sessionFile, {
        type: 'last-prompt',
        lastPrompt: this.currentSessionLastPrompt,
        uuid: this.generateEntryUuid(),
        parentUuid: null,
        timestamp: new Date().toISOString(),
        sessionId,
      });
    }
    if (this.currentSessionTitle) {
      appendEntryToFile(this.sessionFile, {
        type: 'custom-title',
        customTitle: this.currentSessionTitle,
        uuid: this.generateEntryUuid(),
        parentUuid: null,
        timestamp: new Date().toISOString(),
        sessionId,
      });
    }
    if (this.currentSessionTag) {
      appendEntryToFile(this.sessionFile, {
        type: 'tag',
        tag: this.currentSessionTag,
        uuid: this.generateEntryUuid(),
        parentUuid: null,
        timestamp: new Date().toISOString(),
        sessionId,
      });
    }
  }

  /** Reset the session file pointer (used when switching sessions). */
  resetSessionFile(): void {
    this.sessionFile = null;
  }

  // ─── Internal ─────────────────────────────────────────────────

  private lastSessionId: string | undefined;

  /** Track the session ID from entries for metadata re-append. */
  private captureSessionId(entry: Entry): void {
    if (entry.sessionId) {
      this.lastSessionId = entry.sessionId;
    }
  }

  private scheduleDrain(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(async () => {
      this.flushTimer = null;
      this.activeDrain = this.drainWriteQueue();
      await this.activeDrain;
      this.activeDrain = null;
      // If more items arrived during drain, schedule again
      if (this.writeQueues.size > 0) {
        this.scheduleDrain();
      }
    }, FLUSH_INTERVAL_MS);
  }

  private async appendToFile(filePath: string, data: string): Promise<void> {
    try {
      await appendFile(filePath, data, { mode: 0o600 });
    } catch {
      // Directory may not exist — create it and retry
      await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
      await appendFile(filePath, data, { mode: 0o600 });
    }
  }

  private async drainWriteQueue(): Promise<void> {
    for (const [filePath, queue] of this.writeQueues) {
      if (queue.length === 0) continue;
      const batch = queue.splice(0);

      let content = '';
      const resolvers: Array<() => void> = [];

      for (const { entry, resolve } of batch) {
        this.captureSessionId(entry);
        const line = JSON.stringify(entry) + '\n';

        if (content.length + line.length >= MAX_CHUNK_BYTES) {
          // Flush current chunk and resolve its entries before starting a new one
          await this.appendToFile(filePath, content);
          for (const r of resolvers) r();
          resolvers.length = 0;
          content = '';
        }

        content += line;
        resolvers.push(resolve);
      }

      if (content.length > 0) {
        await this.appendToFile(filePath, content);
        for (const r of resolvers) r();
      }

      // Decrement pending count for the drained entries
      this.pendingWriteCount -= batch.length;
      if (this.pendingWriteCount <= 0) {
        this.pendingWriteCount = 0;
        for (const resolve of this.flushResolvers) resolve();
        this.flushResolvers = [];
      }
    }

    // Clean up empty queues
    for (const [filePath, queue] of this.writeQueues) {
      if (queue.length === 0) {
        this.writeQueues.delete(filePath);
      }
    }
  }

  /** Generate a UUID for metadata entries. */
  private generateEntryUuid(): UUID {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID() as UUID;
    }
    const bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as UUID;
  }
}

// ─── Singleton ──────────────────────────────────────────────────

let writerInstance: TranscriptWriter | null = null;

/** Get the global TranscriptWriter singleton. */
export function getTranscriptWriter(): TranscriptWriter {
  if (!writerInstance) {
    writerInstance = new TranscriptWriter();
  }
  return writerInstance;
}

/** Reset the singleton for testing. */
export function resetTranscriptWriter(): void {
  writerInstance = null;
}
