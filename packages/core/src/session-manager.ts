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

const MAX_SANITIZED_LENGTH = 60;

/**
 * Convert a directory path into a filesystem-safe directory name.
 * Mirrors OpenClaude's sanitizePath pattern: non-alphanumeric chars become `-`,
 * and long paths are truncated with a hash suffix to stay unique.
 */
function sanitizePath(dirPath: string): string {
  const sanitized = dirPath.replace(/[^a-zA-Z0-9]/g, '-');
  if (sanitized.length <= MAX_SANITIZED_LENGTH) {
    return sanitized;
  }
  // Simple hash for when Bun is not available
  let hash = 0;
  for (let i = 0; i < dirPath.length; i++) {
    const chr = dirPath.charCodeAt(i);
    hash = ((hash << 5) - hash + chr) | 0;
  }
  return `${sanitized.slice(0, MAX_SANITIZED_LENGTH)}-${Math.abs(hash).toString(36)}`;
}

/**
 * JSON-based session persistence for chat conversations.
 *
 * Sessions are stored under:
 *   ~/.xibecode/projects/<sanitized-cwd>/<session-id>.json
 *
 * This mirrors OpenClaude's per-project directory layout, so sessions
 * from different working directories are naturally separated.
 */
export class SessionManager {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    const defaultDir = path.join(os.homedir(), '.xibecode');
    this.baseDir = baseDir || defaultDir;
  }

  /** Root directory for all project-scoped sessions. */
  private getProjectsDir(): string {
    return path.join(this.baseDir, 'projects');
  }

  /** Directory for sessions belonging to a specific project (cwd). */
  private getProjectDir(cwd: string): string {
    return path.join(this.getProjectsDir(), sanitizePath(cwd));
  }

  /**
   * Ensure the project directory exists.
   */
  private async ensureProjectDir(cwd: string): Promise<void> {
    await fs.mkdir(this.getProjectDir(cwd), { recursive: true });
  }

  /**
   * Generate a stable path for a given session id within its project dir.
   */
  private getSessionPath(id: string, cwd: string): string {
    return path.join(this.getProjectDir(cwd), `${id}.json`);
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
    const cwd = options.cwd || process.cwd();
    await this.ensureProjectDir(cwd);

    const now = new Date().toISOString();
    const id = this.generateId();

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

    await this.writeSessionFile(session);
    return session;
  }

  /**
   * Load a full session by id.
   * Searches across all project directories since the cwd is not always known.
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
      const filePath = path.join(projectsDir, projectDir, `${id}.json`);
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(raw) as ChatSession;
        return recoverConversation(data).session;
      } catch {
        // Not in this directory, continue searching
      }
    }

    return null;
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
   * List sessions for a specific project directory, sorted by most recently updated.
   * If no cwd is provided, lists sessions across all projects.
   */
  async listSessions(cwd?: string): Promise<SessionMetadata[]> {
    const metas: SessionMetadata[] = [];

    if (cwd) {
      // List sessions for a specific project only
      await this.collectSessionsFromDir(this.getProjectDir(cwd), metas);
    } else {
      // List sessions across all projects
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
   * Delete a session permanently.
   */
  async deleteSession(id: string): Promise<boolean> {
    const session = await this.loadSession(id);
    if (!session) return false;

    try {
      await fs.unlink(this.getSessionPath(id, session.cwd));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Utility for callers that want to know where sessions live for a given project.
   */
  getSessionsDirectory(cwd?: string): string {
    if (cwd) return this.getProjectDir(cwd);
    return this.getProjectsDir();
  }

  // ─── Internal helpers ─────────────────────────────────────────

  private async collectSessionsFromDir(dir: string, metas: SessionMetadata[]): Promise<void> {
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch {
      return;
    }

    const jsonFiles = files.filter((file) => file.endsWith('.json'));

    // Bounded concurrency (chunks of 20) to prevent EMFILE errors
    const CONCURRENCY_LIMIT = 20;
    for (let i = 0; i < jsonFiles.length; i += CONCURRENCY_LIMIT) {
      const chunk = jsonFiles.slice(i, i + CONCURRENCY_LIMIT);

      await Promise.all(
        chunk.map(async (file) => {
          const fullPath = path.join(dir, file);
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
  }

  private async writeSessionFile(session: ChatSession): Promise<void> {
    await this.ensureProjectDir(session.cwd);
    const filePath = this.getSessionPath(session.id, session.cwd);
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
