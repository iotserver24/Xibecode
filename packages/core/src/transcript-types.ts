/**
 * Types for the append-only JSONL transcript system.
 *
 * Each line in a .jsonl transcript file is a JSON object representing an Entry.
 * Entries form a linked list via parentUuid, enabling chain-walking for resume
 * and sidechain support. Only TranscriptMessage entries participate in the
 * parentUuid chain; metadata entries (summary, tag, etc.) are standalone.
 *
 * @module transcript-types
 */

import type { UUID } from 'crypto';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

// ─── Base Entry Fields ──────────────────────────────────────────

/** Fields present on every entry in the JSONL transcript. */
export interface BaseEntry {
  /** Unique identifier for this entry. */
  uuid: UUID;
  /** Parent entry uuid — forms the linked list chain. null for the first entry. */
  parentUuid: UUID | null;
  /** ISO 8601 timestamp when the entry was created. */
  timestamp: string;
  /** Session this entry belongs to. */
  sessionId: string;
}

// ─── Transcript Message Types ───────────────────────────────────

/** User message entry. */
export interface UserTranscriptEntry extends BaseEntry {
  type: 'user';
  message: MessageParam;
}

/** Assistant message entry. */
export interface AssistantTranscriptEntry extends BaseEntry {
  type: 'assistant';
  message: MessageParam;
}

/** System message entry (compaction boundaries, meta messages). */
export interface SystemTranscriptEntry extends BaseEntry {
  type: 'system';
  message: MessageParam;
}

/** Attachment entry (files, images, skill listings). */
export interface AttachmentTranscriptEntry extends BaseEntry {
  type: 'attachment';
  attachment: {
    type: string;
    [key: string]: unknown;
  };
}

/** Messages that participate in the conversation chain. */
export type TranscriptMessage =
  | UserTranscriptEntry
  | AssistantTranscriptEntry
  | SystemTranscriptEntry
  | AttachmentTranscriptEntry;

// ─── Metadata Entry Types ───────────────────────────────────────

/** Summary entry — written by compaction. */
export interface SummaryTranscriptEntry extends BaseEntry {
  type: 'summary';
  summary: string;
}

/** Custom title entry — set by user or auto-derived. */
export interface CustomTitleTranscriptEntry extends BaseEntry {
  type: 'custom-title';
  customTitle: string;
}

/** Tag entry — user-assigned tag for the session. */
export interface TagTranscriptEntry extends BaseEntry {
  type: 'tag';
  tag: string;
}

/** Last prompt entry — tracks the most recent user prompt for session listing. */
export interface LastPromptTranscriptEntry extends BaseEntry {
  type: 'last-prompt';
  lastPrompt: string;
}

/** Compact boundary marker — marks where compaction occurred. */
export interface CompactBoundaryTranscriptEntry extends BaseEntry {
  type: 'compact-boundary';
  /** Number of messages removed by compaction. */
  removedCount: number;
  /** Token count before compaction. */
  tokensBefore?: number;
  /** Token count after compaction. */
  tokensAfter?: number;
}

/** File history snapshot — tracks which backup versions exist at each message. */
export interface FileHistorySnapshotEntry extends BaseEntry {
  type: 'file-history-snapshot';
  messageId: UUID;
  trackedFileBackups: Record<string, FileHistoryBackupRef>;
}

/** Session metadata entry — written at session start. */
export interface SessionMetaTranscriptEntry extends BaseEntry {
  type: 'session-meta';
  model: string;
  cwd: string;
  gitBranch?: string;
  version?: string;
}

/** Tool attempt record — replaces session-memory attempt tracking. */
export interface AttemptTranscriptEntry extends BaseEntry {
  type: 'attempt';
  tool: string;
  success: boolean;
  message: string;
}

/** Learning record — replaces session-memory learning tracking. */
export interface LearningTranscriptEntry extends BaseEntry {
  type: 'learning';
  learning: string;
}

/** Mode entry — tracks agent mode for session resume. */
export interface ModeTranscriptEntry extends BaseEntry {
  type: 'mode';
  mode: string;
}

/** All metadata entry types that do NOT participate in the parentUuid chain. */
export type MetadataEntry =
  | SummaryTranscriptEntry
  | CustomTitleTranscriptEntry
  | TagTranscriptEntry
  | LastPromptTranscriptEntry
  | CompactBoundaryTranscriptEntry
  | FileHistorySnapshotEntry
  | SessionMetaTranscriptEntry
  | AttemptTranscriptEntry
  | LearningTranscriptEntry
  | ModeTranscriptEntry;

// ─── Union Types ────────────────────────────────────────────────

/** Any entry that can appear in a JSONL transcript file. */
export type Entry = TranscriptMessage | MetadataEntry;

// ─── File History Types ─────────────────────────────────────────

/** Reference to a file backup version within a snapshot. */
export interface FileHistoryBackupRef {
  /** Backup file name (deterministic: {hash}@v{N}). null means file didn't exist at this version. */
  backupFileName: string | null;
  /** Monotonically increasing version number. */
  version: number;
  /** When this backup was created. */
  backupTime: string;
}

/** A snapshot of file backup state at a given point in the conversation. */
export interface FileHistorySnapshot {
  messageId: UUID;
  trackedFileBackups: Record<string, FileHistoryBackupRef>;
  timestamp: Date;
}

// ─── Lite Session Types (for efficient listing) ─────────────────

/** Result of reading only the head and tail of a session file. */
export interface LiteSessionFile {
  /** First ~64KB of the file. */
  head: string;
  /** Last ~64KB of the file. */
  tail: string;
  /** File modification time (epoch ms). */
  mtime: number;
  /** File size in bytes. */
  size: number;
}

/** Session metadata extracted from lite (head/tail) reads. */
export interface SessionInfo {
  sessionId: string;
  summary: string;
  lastModified: number;
  fileSize?: number;
  customTitle?: string;
  firstPrompt?: string;
  gitBranch?: string;
  cwd?: string;
  tag?: string;
  createdAt?: number;
  model?: string;
}

// ─── Type Guards ────────────────────────────────────────────────

/** Check if an entry is a transcript message (participates in the chain). */
export function isTranscriptMessage(entry: Entry): entry is TranscriptMessage {
  return (
    entry.type === 'user' ||
    entry.type === 'assistant' ||
    entry.type === 'system' ||
    entry.type === 'attachment'
  );
}

/** Check if an entry participates in the parentUuid chain. */
export function isChainParticipant(entry: Entry): boolean {
  return isTranscriptMessage(entry);
}

/** Check if an entry is a metadata entry (not part of the conversation chain). */
export function isMetadataEntry(entry: Entry): entry is MetadataEntry {
  return !isTranscriptMessage(entry);
}

// ─── UUID Generation ────────────────────────────────────────────

/** Validate that a string is a UUID. */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUuid(maybeUuid: unknown): UUID | null {
  if (typeof maybeUuid !== 'string') return null;
  return UUID_REGEX.test(maybeUuid) ? (maybeUuid as UUID) : null;
}

/** Generate a new UUID v4. */
export function generateUuid(): UUID {
  // Use crypto.randomUUID when available (Node 19+, Bun, browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID() as UUID;
  }
  // Fallback: manual v4 UUID
  const bytes = new Uint8Array(16);
  // Node.js crypto.getRandomValues
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Last resort: Math.random (not cryptographically secure)
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  // Set version (4) and variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as UUID;
}

// ─── JSON String Field Extraction ───────────────────────────────

/**
 * Unescape a JSON string value extracted as raw text.
 * Only allocates a new string when escape sequences are present.
 */
export function unescapeJsonString(raw: string): string {
  if (!raw.includes('\\')) return raw;
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw;
  }
}

/**
 * Extract a simple JSON string field value from raw text without full parsing.
 * Looks for `"key":"value"` or `"key": "value"` patterns.
 */
export function extractJsonStringField(
  text: string,
  key: string,
): string | undefined {
  const patterns = [`"${key}":"`, `"${key}": "`];
  for (const pattern of patterns) {
    const idx = text.indexOf(pattern);
    if (idx < 0) continue;
    const valueStart = idx + pattern.length;
    let i = valueStart;
    while (i < text.length) {
      if (text[i] === '\\') {
        i += 2;
        continue;
      }
      if (text[i] === '"') {
        return unescapeJsonString(text.slice(valueStart, i));
      }
      i++;
    }
  }
  return undefined;
}

/**
 * Like extractJsonStringField but finds the LAST occurrence.
 * Useful for fields that are appended (customTitle, tag, etc.).
 */
export function extractLastJsonStringField(
  text: string,
  key: string,
): string | undefined {
  const patterns = [`"${key}":"`, `"${key}": "`];
  let lastValue: string | undefined;
  for (const pattern of patterns) {
    let searchFrom = 0;
    while (true) {
      const idx = text.indexOf(pattern, searchFrom);
      if (idx < 0) break;
      const valueStart = idx + pattern.length;
      let i = valueStart;
      while (i < text.length) {
        if (text[i] === '\\') {
          i += 2;
          continue;
        }
        if (text[i] === '"') {
          lastValue = unescapeJsonString(text.slice(valueStart, i));
          break;
        }
        i++;
      }
      searchFrom = i + 1;
    }
  }
  return lastValue;
}
