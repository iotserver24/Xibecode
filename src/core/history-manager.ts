/**
 * Chat History Manager
 *
 * Manages persistent chat conversations stored per-project in:
 * ~/.xibecode/history/{project-hash}/
 *
 * Each conversation is stored as a JSON file with full message history.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

export interface HistoryMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  source?: 'tui' | 'webui';
  toolName?: string;
  toolStatus?: 'running' | 'success' | 'error';
  timestamp: number;
}

export interface SavedConversation {
  id: string;
  title: string;
  projectPath: string;
  projectName: string;
  created: string;
  updated: string;
  model: string;
  mode: string;
  messages: HistoryMessage[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  created: string;
  updated: string;
  messageCount: number;
  model: string;
}

export class HistoryManager {
  private baseDir: string;
  private projectDir: string;

  constructor(private workingDir: string) {
    this.baseDir = path.join(os.homedir(), '.xibecode', 'history');
    this.projectDir = path.join(this.baseDir, this.getProjectHash());
  }

  /**
   * Generate a safe directory name from the project path
   */
  private getProjectHash(): string {
    // Use a short hash of the absolute path + the project name for readability
    const absPath = path.resolve(this.workingDir);
    const hash = crypto.createHash('sha256').update(absPath).digest('hex').substring(0, 12);
    const projectName = path.basename(absPath).replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${projectName}_${hash}`;
  }

  /**
   * Ensure the history directory exists
   */
  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.projectDir, { recursive: true });
  }

  /**
   * Generate a title from the first user message
   */
  static summarizeTitle(firstMessage: string): string {
    // Take the first sentence or first 80 chars
    const cleaned = firstMessage.replace(/\n/g, ' ').trim();
    const firstSentence = cleaned.match(/^[^.!?]*[.!?]/);
    if (firstSentence && firstSentence[0].length <= 80) {
      return firstSentence[0].trim();
    }
    if (cleaned.length <= 80) {
      return cleaned;
    }
    return cleaned.substring(0, 77) + '...';
  }

  /**
   * Save a conversation (create or update)
   */
  async save(conversation: SavedConversation): Promise<void> {
    await this.ensureDir();
    const filePath = path.join(this.projectDir, `${conversation.id}.json`);
    conversation.updated = new Date().toISOString();
    await fs.writeFile(filePath, JSON.stringify(conversation, null, 2), 'utf-8');
  }

  /**
   * Load a conversation by ID
   */
  async load(id: string): Promise<SavedConversation | null> {
    try {
      const filePath = path.join(this.projectDir, `${id}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as SavedConversation;
    } catch {
      return null;
    }
  }

  /**
   * List all conversations for this project (sorted by updated, newest first)
   */
  async list(): Promise<ConversationSummary[]> {
    await this.ensureDir();
    try {
      const files = await fs.readdir(this.projectDir);
      const summaries: ConversationSummary[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const filePath = path.join(this.projectDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const conv = JSON.parse(content) as SavedConversation;
          summaries.push({
            id: conv.id,
            title: conv.title,
            created: conv.created,
            updated: conv.updated,
            messageCount: conv.messages.length,
            model: conv.model,
          });
        } catch {
          // Skip corrupted files
        }
      }

      // Sort by updated time, newest first
      summaries.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
      return summaries;
    } catch {
      return [];
    }
  }

  /**
   * Delete a conversation
   */
  async delete(id: string): Promise<boolean> {
    try {
      const filePath = path.join(this.projectDir, `${id}.json`);
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a new conversation with a generated ID
   */
  static createConversation(
    projectPath: string,
    firstMessage: string,
    model: string = '',
    mode: string = 'agent'
  ): SavedConversation {
    const now = new Date().toISOString();
    return {
      id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      title: HistoryManager.summarizeTitle(firstMessage),
      projectPath,
      projectName: path.basename(projectPath),
      created: now,
      updated: now,
      model,
      mode,
      messages: [],
    };
  }
}
