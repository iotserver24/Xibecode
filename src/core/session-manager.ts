import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

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
  }): Promise<ChatSession> {
    await this.ensureDir();

    const now = new Date().toISOString();
    const id = this.generateId();

    const session: ChatSession = {
      id,
      title: options.title?.trim() || 'Untitled Session',
      model: options.model,
      cwd: options.cwd || process.cwd(),
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
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Save an existing session (updates timestamp automatically).
   */
  async saveSession(session: ChatSession): Promise<void> {
    const updated: ChatSession = {
      ...session,
      updated: new Date().toISOString(),
    };
    await this.writeSessionFile(updated);
  }

  /**
   * Update a session's messages and stats in one call.
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

    // Optionally derive title from the very first user message
    if (params.titleFromFirstMessage && updated.messages.length > 0) {
      const first = updated.messages[0];
      if (first.role === 'user' && typeof first.content === 'string') {
        updated.title = this.deriveTitleFromText(first.content, existing.title);
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

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const fullPath = path.join(this.sessionsDir, file);
      try {
        const raw = await fs.readFile(fullPath, 'utf-8');
        const data = JSON.parse(raw) as ChatSession;
        const { messages: _messages, stats: _stats, ...meta } = data;
        metas.push(meta);
      } catch {
        // Ignore malformed files
        continue;
      }
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
}

