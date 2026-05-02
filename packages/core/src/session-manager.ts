import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { recoverConversation } from './conversation-recovery.js';

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

/**
 * JSON-based session persistence for chat conversations.
 *
 * Sessions are stored under:
 *   ~/.xibecode/sessions/<session-id>.json
 */
export class SessionManager {
  private readonly sessionsDir: string;

  constructor(baseDir?: string) {
    const defaultDir = path.join(os.homedir(), '.xibecode', 'sessions');
    this.sessionsDir = baseDir || defaultDir;
  }

  /**
   * Ensure the sessions directory exists.
   */
  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
  }

  /**
   * Generate a stable path for a given session id.
   */
  private getSessionPath(id: string): string {
    return path.join(this.sessionsDir, `${id}.json`);
  }

  /**
   * Create a new session with an optional title.
   */
  async createSession(options: {
    title?: string;
    model: string;
    cwd?: string;
    parentSessionId?: string;
  }): Promise<ChatSession> {
    await this.ensureDir();

    const now = new Date().toISOString();
    const id = this.generateId();

    const session: ChatSession = {
      id,
      title: options.title?.trim() || 'Untitled Session',
      model: options.model,
      cwd: options.cwd || process.cwd(),
      parentSessionId: options.parentSessionId,
      created: now,
      updated: now,
      messages: [],
    };

    await this.writeSessionFile(session);
    return session;
  }

  /**
   * Load a full session by id.
   */
  async loadSession(id: string): Promise<ChatSession | null> {
    try {
      const raw = await fs.readFile(this.getSessionPath(id), 'utf-8');
      const data = JSON.parse(raw) as ChatSession;
      return recoverConversation(data).session;
    } catch {
      return null;
    }
  }

  /**
   * Save an existing session (updates timestamp automatically).
   * If the title is still the default placeholder, derives it from the
   * first user message so sessions are never left unnamed.
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

    const updated: ChatSession = {
      ...session,
      title,
      updated: new Date().toISOString(),
    };
    await this.writeSessionFile(updated);
  }

  /**
   * Update a session's messages and stats in one call.
   * By default, derives the title from the first user message if it's
   * still the placeholder "Untitled Session".
   */
  async saveMessagesAndStats(params: {
    id: string;
    messages: MessageParam[];
    stats?: SessionStats;
    titleFromFirstMessage?: boolean;
  }): Promise<ChatSession | null> {
    const existing = await this.loadSession(params.id);
    if (!existing) return null;

    const updated: ChatSession = {
      ...existing,
      messages: params.messages,
      stats: params.stats ?? existing.stats,
    };

    // Derive title from first user message (default: true)
    const shouldDerive = params.titleFromFirstMessage !== false;
    if (shouldDerive && (!updated.title || updated.title === 'Untitled Session') && updated.messages.length > 0) {
      const first = updated.messages.find((m) => m.role === 'user');
      if (first) {
        const derived = this.deriveTitleFromMessage(first);
        if (derived && derived !== 'Untitled Session') {
          updated.title = derived;
        }
      }
    }

    await this.saveSession(updated);
    return updated;
  }

  /**
   * List all sessions (metadata only), sorted by most recently updated.
   */
  async listSessions(): Promise<SessionMetadata[]> {
    await this.ensureDir();

    let files: string[];
    try {
      files = await fs.readdir(this.sessionsDir);
    } catch {
      return [];
    }

    const metas: SessionMetadata[] = [];
    const jsonFiles = files.filter((file) => file.endsWith('.json'));

    // Bounded concurrency (chunks of 20) to prevent EMFILE errors while speeding up IO
    const CONCURRENCY_LIMIT = 20;
    for (let i = 0; i < jsonFiles.length; i += CONCURRENCY_LIMIT) {
      const chunk = jsonFiles.slice(i, i + CONCURRENCY_LIMIT);

      await Promise.all(
        chunk.map(async (file) => {
          const fullPath = path.join(this.sessionsDir, file);
          try {
            const raw = await fs.readFile(fullPath, 'utf-8');
            const data = JSON.parse(raw) as ChatSession;
            const { messages: _messages, stats: _stats, ...meta } = data;
            metas.push(meta);
          } catch {
            // Ignore malformed files
          }
        })
      );
    }

    metas.sort((a, b) => b.updated.localeCompare(a.updated));
    return metas;
  }

  /**
   * Delete a session permanently.
   */
  async deleteSession(id: string): Promise<boolean> {
    try {
      await fs.unlink(this.getSessionPath(id));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Utility for callers that want to know where sessions live.
   */
  getSessionsDirectory(): string {
    return this.sessionsDir;
  }

  // ─── Internal helpers ─────────────────────────────────────────

  private async writeSessionFile(session: ChatSession): Promise<void> {
    await this.ensureDir();
    const filePath = this.getSessionPath(session.id);
    const payload = JSON.stringify(session, null, 2);
    await fs.writeFile(filePath, payload, 'utf-8');
  }

  private generateId(): string {
    const ts = Date.now().toString(36);
    const rnd = Math.random().toString(36).slice(2, 8);
    return `session-${ts}-${rnd}`;
  }

  private deriveTitleFromText(text: string, fallback: string): string {
    const cleaned = text.trim().replace(/\s+/g, ' ');
    if (!cleaned) return fallback;
    const maxLen = 80;
    return cleaned.length <= maxLen ? cleaned : cleaned.slice(0, maxLen - 1) + '…';
  }

  /**
   * Derive a session title from a user message.
   * Handles both plain-string and content-block-array message formats.
   */
  private deriveTitleFromMessage(message: MessageParam): string {
    const content = message.content;
    let text = '';

    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      // Extract text from content blocks, skipping images/tool results
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

    return this.deriveTitleFromText(text, 'Untitled Session');
  }
}

