import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

export type PlanSessionStatus =
  | 'drafting'
  | 'awaiting_answers'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed';

export interface PlanSession {
  id: string;
  request: string;
  status: PlanSessionStatus;
  createdAt: string;
  updatedAt: string;
  answers: Record<string, string>;
  artifactPath?: string;
  metadata?: Record<string, string>;
}

export class PlanSessionManager {
  private readonly sessionDir: string;

  constructor(private readonly workingDir: string = process.cwd()) {
    this.sessionDir = path.join(workingDir, '.xibecode', 'plan-sessions');
  }

  async create(request: string, metadata?: Record<string, string>): Promise<PlanSession> {
    const now = new Date().toISOString();
    const session: PlanSession = {
      id: `plan-${randomUUID()}`,
      request,
      status: 'drafting',
      createdAt: now,
      updatedAt: now,
      answers: {},
      metadata,
    };
    await this.save(session);
    return session;
  }

  async load(sessionId: string): Promise<PlanSession | null> {
    const filePath = this.getSessionPath(sessionId);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw) as PlanSession;
    } catch {
      return null;
    }
  }

  async updateStatus(sessionId: string, status: PlanSessionStatus): Promise<PlanSession | null> {
    const session = await this.load(sessionId);
    if (!session) return null;
    session.status = status;
    session.updatedAt = new Date().toISOString();
    await this.save(session);
    return session;
  }

  async attachArtifact(sessionId: string, artifactPath: string): Promise<PlanSession | null> {
    const session = await this.load(sessionId);
    if (!session) return null;
    session.artifactPath = artifactPath;
    session.updatedAt = new Date().toISOString();
    await this.save(session);
    return session;
  }

  async addAnswers(sessionId: string, answers: Record<string, string>): Promise<PlanSession | null> {
    const session = await this.load(sessionId);
    if (!session) return null;
    session.answers = { ...session.answers, ...answers };
    session.updatedAt = new Date().toISOString();
    await this.save(session);
    return session;
  }

  async listRecent(limit = 20): Promise<PlanSession[]> {
    let files: string[];
    try {
      files = await fs.readdir(this.sessionDir);
    } catch {
      return [];
    }
    const sessions: PlanSession[] = [];
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    // Use bounded concurrency to read files in parallel without hitting EMFILE
    const batchSize = 100;
    for (let i = 0; i < jsonFiles.length; i += batchSize) {
      const batch = jsonFiles.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (file) => {
          try {
            const raw = await fs.readFile(path.join(this.sessionDir, file), 'utf8');
            return JSON.parse(raw) as PlanSession;
          } catch {
            return null; // Ignore malformed session files to avoid breaking the list.
          }
        })
      );
      sessions.push(...batchResults.filter((s): s is PlanSession => s !== null));
    }

    return sessions
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, limit);
  }

  private async save(session: PlanSession): Promise<void> {
    await fs.mkdir(this.sessionDir, { recursive: true });
    const filePath = this.getSessionPath(session.id);
    await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf8');
  }

  private getSessionPath(sessionId: string): string {
    return path.join(this.sessionDir, `${sessionId}.json`);
  }
}
