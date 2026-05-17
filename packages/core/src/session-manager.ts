/**
 * Session manager using append-only JSONL transcripts.
 *
 * Sessions are stored under:
 *   ~/.xibecode/projects/<sanitized-cwd>/<session-id>.jsonl
 *
 * This replaces the old monolithic JSON format with an append-only JSONL
 * approach that provides:
 * - Crash safety: partial writes only corrupt the last line
 * - Incremental durability: each message is persisted immediately
 * - Efficient listing: head/tail reads without full file parse
 * - Backward compatibility: can still read old .json session files
 *
 * @module session-manager
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { UUID } from 'crypto';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { recoverConversation } from './conversation-recovery.js';
import { recoverConversationV2 } from './conversation-recovery-v2.js';
import type { Entry, FileHistorySnapshotEntry } from './transcript-types.js';
import { generateUuid, validateUuid, isTranscriptMessage, extractJsonStringField, extractLastJsonStringField } from './transcript-types.js';
import {
  loadTranscriptFile,
  findMainConversationTip,
  buildConversationChain,
  listSessionsLite,
  readHeadAndTail,
  extractFirstPromptFromHead,
} from './transcript-reader.js';
import {
  getTranscriptWriter,
  appendEntryToFile,
} from './transcript-writer.js';
import { registerCleanup } from './graceful-shutdown.js';

// ─── Types ──────────────────────────────────────────────────────

export interface SessionStats {
  iterations: number;
  toolCalls: number;
  filesChanged: number;
  changedFiles?: string[];
}

export interface SessionMetadata {
  id: string;
  title: string;
  model: string;
  cwd: string;
  parentSessionId?: string;
  created: string;
  updated: string;
}

export interface ChatSession extends SessionMetadata {
  messages: MessageParam[];
  stats?: SessionStats;
}

// ─── Constants ──────────────────────────────────────────────────

const MAX_SANITIZED_LENGTH = 60;

// ─── Path Helpers ───────────────────────────────────────────────

function sanitizePath(dirPath: string): string {
  const sanitized = dirPath.replace(/[^a-zA-Z0-9]/g, '-');
  if (sanitized.length <= MAX_SANITIZED_LENGTH) {
    return sanitized;
  }
  let hash = 0;
  for (let i = 0; i < dirPath.length; i++) {
    const chr = dirPath.charCodeAt(i);
    hash = ((hash << 5) - hash + chr) | 0;
  }
  return `${sanitized.slice(0, MAX_SANITIZED_LENGTH)}-${Math.abs(hash).toString(36)}`;
}

// ─── Session Manager ────────────────────────────────────────────

export class SessionManager {
  private readonly baseDir: string;
  private cleanupRegistered = false;

  constructor(baseDir?: string) {
    const defaultDir = path.join(os.homedir(), '.xibecode');
    this.baseDir = baseDir || defaultDir;
  }

  private getProjectsDir(): string {
    return path.join(this.baseDir, 'projects');
  }

  private getProjectDir(cwd: string): string {
    return path.join(this.getProjectsDir(), sanitizePath(cwd));
  }

  private async ensureProjectDir(cwd: string): Promise<void> {
    await fs.mkdir(this.getProjectDir(cwd), { recursive: true, mode: 0o700 });
  }

  /** Get the JSONL path for a session. */
  private getSessionPath(id: string, cwd: string): string {
    return path.join(this.getProjectDir(cwd), `${id}.jsonl`);
  }

  /** Get the legacy JSON path for a session. */
  private getLegacySessionPath(id: string, cwd: string): string {
    return path.join(this.getProjectDir(cwd), `${id}.json`);
  }

  /**
   * Create a new session with an optional title.
   * Writes the initial session-meta entry to the JSONL file.
   */
  async createSession(options: {
    title?: string;
    model: string;
    cwd?: string;
    parentSessionId?: string;
  }): Promise<ChatSession> {
    const cwd = options.cwd || process.cwd();
    await this.ensureProjectDir(cwd);

    const now = new Date().toISOString();
    const id = generateUuid();

    const session: ChatSession = {
      id,
      title: options.title?.trim() || 'Untitled Session',
      model: options.model,
      cwd,
      parentSessionId: options.parentSessionId,
      created: now,
      updated: now,
      messages: [],
    };

    // Write initial session-meta entry
    const transcriptPath = this.getSessionPath(id, cwd);
    const writer = getTranscriptWriter();
    writer.sessionFile = transcriptPath;

    await writer.enqueueWrite(transcriptPath, {
      type: 'session-meta',
      uuid: generateUuid(),
      parentUuid: null,
      timestamp: now,
      sessionId: id,
      model: options.model,
      cwd,
    });

    // Register cleanup handler on first use
    this.ensureCleanupRegistered(writer);

    return session;
  }

  /**
   * Load a full session by id.
   * Supports both .jsonl (new format) and .json (legacy format).
   * Searches across all project directories.
   */
  async loadSession(id: string): Promise<ChatSession | null> {
    // Try to find the session across all project directories
    const projectsDir = this.getProjectsDir();
    let projectDirs: string[];
    try {
      projectDirs = (await fs.readdir(projectsDir, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      return null;
    }

    for (const projectDir of projectDirs) {
      // Try JSONL first (new format)
      const jsonlPath = path.join(projectsDir, projectDir, `${id}.jsonl`);
      try {
        await fs.access(jsonlPath);
        return await this.loadJsonlSession(jsonlPath, id);
      } catch {
        // Not a JSONL file, try legacy JSON
      }

      // Try legacy JSON
      const jsonPath = path.join(projectsDir, projectDir, `${id}.json`);
      try {
        const raw = await fs.readFile(jsonPath, 'utf-8');
        const data = JSON.parse(raw) as ChatSession;
        return recoverConversation(data).session;
      } catch {
        // Not in this directory, continue searching
      }
    }

    return null;
  }

  /**
   * Save an existing session by appending entries to the JSONL file.
   * Only appends new messages that haven't been persisted yet.
   */
  async saveSession(session: ChatSession): Promise<void> {
    let title = session.title;
    if ((!title || title === 'Untitled Session') && session.messages.length > 0) {
      const firstUserMsg = session.messages.find((m) => m.role === 'user');
      if (firstUserMsg) {
        const derived = this.deriveTitleFromMessage(firstUserMsg);
        if (derived) title = derived;
      }
    }

    const transcriptPath = this.getSessionPath(session.id, session.cwd);
    const writer = getTranscriptWriter();
    writer.sessionFile = transcriptPath;

    // Update title if it changed
    if (title && title !== 'Untitled Session' && title !== writer.currentSessionTitle) {
      writer.currentSessionTitle = title;
      await writer.enqueueWrite(transcriptPath, {
        type: 'custom-title',
        customTitle: title,
        uuid: generateUuid(),
        parentUuid: null,
        timestamp: new Date().toISOString(),
        sessionId: session.id,
      });
    }

    // Append messages that haven't been persisted yet
    // (In a full integration, each message would be written as it arrives,
    //  so saveSession just handles the metadata. This provides backward compat.)
    await this.appendMessagesToTranscript(session.id, session.cwd, session.messages);
  }

  /**
   * Update a session's messages and stats.
   * Appends new messages to the JSONL file.
   */
  async saveMessagesAndStats(params: {
    id: string;
    messages: MessageParam[];
    stats?: SessionStats;
    titleFromFirstMessage?: boolean;
    cwd: string;
  }): Promise<ChatSession | null> {
    const transcriptPath = this.getSessionPath(params.id, params.cwd);
    const writer = getTranscriptWriter();
    writer.sessionFile = transcriptPath;

    // Append messages
    await this.appendMessagesToTranscript(params.id, params.cwd, params.messages);

    // Derive title from first user message if needed
    const shouldDerive = params.titleFromFirstMessage !== false;
    if (shouldDerive && params.messages.length > 0) {
      const first = params.messages.find((m) => m.role === 'user');
      if (first) {
        const derived = this.deriveTitleFromMessage(first);
        if (derived && derived !== 'Untitled Session' && derived !== writer.currentSessionTitle) {
          writer.currentSessionTitle = derived;
          await writer.enqueueWrite(transcriptPath, {
            type: 'custom-title',
            customTitle: derived,
            uuid: generateUuid(),
            parentUuid: null,
            timestamp: new Date().toISOString(),
            sessionId: params.id,
          });
        }
      }
    }

    // Load the session to return updated metadata
    return this.loadSession(params.id);
  }

  /**
   * List sessions for a specific project directory.
   * Uses efficient head/tail reads for JSONL files.
   * Falls back to full JSON parse for legacy .json files.
   */
  async listSessions(cwd?: string): Promise<SessionMetadata[]> {
    const metas: SessionMetadata[] = [];

    if (cwd) {
      await this.collectSessionsFromDir(this.getProjectDir(cwd), metas);
    } else {
      const projectsDir = this.getProjectsDir();
      let projectDirs: string[];
      try {
        projectDirs = (await fs.readdir(projectsDir, { withFileTypes: true }))
          .filter((d) => d.isDirectory())
          .map((d) => d.name);
      } catch {
        return [];
      }

      for (const projectDir of projectDirs) {
        await this.collectSessionsFromDir(path.join(projectsDir, projectDir), metas);
      }
    }

    metas.sort((a, b) => b.updated.localeCompare(a.updated));
    return metas;
  }

  /**
   * Load file-history snapshot metadata entries for a session.
   */
  async loadFileHistorySnapshots(id: string): Promise<FileHistorySnapshotEntry[]> {
    const projectsDir = this.getProjectsDir();
    let projectDirs: string[];
    try {
      projectDirs = (await fs.readdir(projectsDir, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      return [];
    }

    for (const projectDir of projectDirs) {
      const jsonlPath = path.join(projectsDir, projectDir, `${id}.jsonl`);
      try {
        await fs.access(jsonlPath);
      } catch {
        continue;
      }

      try {
        const { entries } = await loadTranscriptFile(jsonlPath);
        return entries
          .filter((entry): entry is FileHistorySnapshotEntry => entry.type === 'file-history-snapshot')
          .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
      } catch {
        return [];
      }
    }

    return [];
  }

  /**
   * Delete a session permanently.
   */
  async deleteSession(id: string): Promise<boolean> {
    const session = await this.loadSession(id);
    if (!session) return false;

    // Try both JSONL and JSON
    const jsonlPath = this.getSessionPath(id, session.cwd);
    const jsonPath = this.getLegacySessionPath(id, session.cwd);

    try {
      await fs.unlink(jsonlPath);
      return true;
    } catch {
      // Try legacy
    }

    try {
      await fs.unlink(jsonPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the directory where sessions live for a given project.
   */
  getSessionsDirectory(cwd?: string): string {
    if (cwd) return this.getProjectDir(cwd);
    return this.getProjectsDir();
  }

  // ─── Internal: JSONL Loading ──────────────────────────────────

  /**
   * Load a session from a JSONL file.
   * Reads the full transcript, walks the chain, and extracts metadata.
   */
  private async loadJsonlSession(filePath: string, sessionId: string): Promise<ChatSession | null> {
    try {
      const { byUuid, leafUuids, entries } = await loadTranscriptFile(filePath);
      const tip = findMainConversationTip(byUuid, leafUuids);

      if (!tip) {
        // Empty or metadata-only session
        return this.buildSessionFromMetadata(entries, sessionId, filePath);
      }

      const chain = buildConversationChain(byUuid, tip);
      const messages = chain
        .filter((e) => isTranscriptMessage(e))
        .map((e) => (e as { message: MessageParam }).message)
        .filter((m): m is MessageParam => m != null);

      // Apply enhanced recovery
      const recovered = recoverConversationV2(chain);

      // Extract metadata from entries
      const metadata = this.extractMetadataFromEntries(entries, sessionId);

      return {
        id: sessionId,
        title: metadata.customTitle || this.deriveTitleFromMessages(recovered.messages) || 'Untitled Session',
        model: metadata.model || 'unknown',
        cwd: metadata.cwd || '',
        created: metadata.created || new Date().toISOString(),
        updated: new Date().toISOString(),
        messages: recovered.messages,
      };
    } catch {
      return null;
    }
  }

  /**
   * Build a minimal ChatSession from metadata entries (when no conversation chain exists).
   */
  private buildSessionFromMetadata(
    entries: Entry[],
    sessionId: string,
    filePath: string,
  ): ChatSession {
    const metadata = this.extractMetadataFromEntries(entries, sessionId);

    return {
      id: sessionId,
      title: metadata.customTitle || 'Untitled Session',
      model: metadata.model || 'unknown',
      cwd: metadata.cwd || '',
      created: metadata.created || new Date().toISOString(),
      updated: new Date().toISOString(),
      messages: [],
    };
  }

  /**
   * Extract metadata (title, model, cwd, etc.) from transcript entries.
   */
  private extractMetadataFromEntries(
    entries: Entry[],
    sessionId: string,
  ): {
    customTitle?: string;
    model?: string;
    cwd?: string;
    gitBranch?: string;
    created?: string;
  } {
    let customTitle: string | undefined;
    let model: string | undefined;
    let cwd: string | undefined;
    let gitBranch: string | undefined;
    let created: string | undefined;

    for (const entry of entries) {
      if (entry.type === 'custom-title') {
        customTitle = (entry as { customTitle: string }).customTitle;
      } else if (entry.type === 'session-meta') {
        const meta = entry as { model?: string; cwd?: string; gitBranch?: string; timestamp?: string };
        if (meta.model) model = meta.model;
        if (meta.cwd) cwd = meta.cwd;
        if (meta.gitBranch) gitBranch = meta.gitBranch;
        if (meta.timestamp && !created) created = meta.timestamp;
      }
    }

    return { customTitle, model, cwd, gitBranch, created };
  }

  // ─── Internal: Writing ────────────────────────────────────────

  /**
   * Append messages to a transcript file.
   * Each message becomes a separate entry with a parentUuid chain.
   */
  private async appendMessagesToTranscript(
    sessionId: string,
    cwd: string,
    messages: MessageParam[],
  ): Promise<void> {
    if (messages.length === 0) return;

    const transcriptPath = this.getSessionPath(sessionId, cwd);
    const writer = getTranscriptWriter();

    // We need to track the last uuid for the parentUuid chain.
    // In a full integration, each message is written as it arrives,
    // so the chain is built incrementally. For backward compat with
    // the old saveSession API, we load the existing transcript to find
    // the last entry uuid, then append new messages.
    let lastUuid: UUID | null = null;
    try {
      const { byUuid, leafUuids } = await loadTranscriptFile(transcriptPath);
      for (const uuid of leafUuids) {
        const entry = byUuid.get(uuid);
        if (entry && !lastUuid) {
          lastUuid = uuid;
        }
      }
    } catch {
      // File doesn't exist yet — lastUuid stays null
    }

    for (const message of messages) {
      const entryUuid = generateUuid();
      const entryType = message.role === 'user' ? 'user' : message.role === 'assistant' ? 'assistant' : 'system';

      await writer.enqueueWrite(transcriptPath, {
        type: entryType,
        uuid: entryUuid,
        parentUuid: lastUuid,
        timestamp: new Date().toISOString(),
        sessionId,
        message,
      } as Entry);

      lastUuid = entryUuid;
    }
  }

  // ─── Internal: Session Listing ────────────────────────────────

  private async collectSessionsFromDir(dir: string, metas: SessionMetadata[]): Promise<void> {
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch {
      return;
    }

    // Collect JSONL sessions using lite reads
    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
    if (jsonlFiles.length > 0) {
      const sessions = await listSessionsLite(dir);
      for (const info of sessions) {
        metas.push({
          id: info.sessionId,
          title: info.summary || 'Untitled Session',
          model: info.model || 'unknown',
          cwd: info.cwd || '',
          created: info.createdAt ? new Date(info.createdAt).toISOString() : new Date().toISOString(),
          updated: new Date(info.lastModified).toISOString(),
        });
      }
    }

    // Collect legacy JSON sessions
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    // ⚡ Bolt: Pre-compute Set for O(1) lookups instead of O(N^2) array.some() string replacement in the inner loop
    const jsonlBaseNames = new Set(jsonlFiles.map((f) => f.slice(0, -6)));
    const CONCURRENCY_LIMIT = 20;
    for (let i = 0; i < jsonFiles.length; i += CONCURRENCY_LIMIT) {
      const chunk = jsonFiles.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.all(
        chunk.map(async (file) => {
          const fullPath = path.join(dir, file);
          try {
            const raw = await fs.readFile(fullPath, 'utf-8');
            const data = JSON.parse(raw) as ChatSession;
            // Skip if already have a JSONL version
            if (jsonlBaseNames.has(file.slice(0, -5))) return;
            const { messages: _messages, stats: _stats, ...meta } = data;
            metas.push(meta);
          } catch {
            // Ignore malformed files
          }
        }),
      );
    }
  }

  // ─── Internal: Cleanup Registration ───────────────────────────

  private ensureCleanupRegistered(writer: ReturnType<typeof getTranscriptWriter>): void {
    if (this.cleanupRegistered) return;
    this.cleanupRegistered = true;

    registerCleanup(async () => {
      await writer.flush();
      try {
        writer.reAppendSessionMetadata();
      } catch {
        // Best-effort — don't let metadata re-append crash the cleanup
      }
    });
  }

  // ─── Internal: Title Derivation ───────────────────────────────

  private deriveTitleFromMessages(messages: MessageParam[]): string {
    const firstUserMsg = messages.find((m) => m.role === 'user');
    if (!firstUserMsg) return 'Untitled Session';
    return this.deriveTitleFromMessage(firstUserMsg);
  }

  private deriveTitleFromMessage(message: MessageParam): string {
    const content = message.content;
    let text = '';

    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      const textParts: string[] = [];
      for (const block of content) {
        if (typeof block === 'string') {
          textParts.push(block);
        } else if (block && typeof block === 'object' && 'type' in block) {
          if (block.type === 'text' && 'text' in block && typeof block.text === 'string') {
            textParts.push(block.text);
          }
        }
      }
      text = textParts.join(' ').trim();
    }

    const cleaned = text.trim().replace(/\s+/g, ' ');
    if (!cleaned) return 'Untitled Session';
    const maxLen = 80;
    return cleaned.length <= maxLen ? cleaned : cleaned.slice(0, maxLen - 1) + '…';
  }
}
