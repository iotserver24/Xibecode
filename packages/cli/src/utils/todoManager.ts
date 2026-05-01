import * as fs from 'fs/promises';
import * as path from 'path';

export type TodoStatus = 'pending' | 'in_progress' | 'done';

export interface TodoItem {
  id: string;
  title: string;
  status: TodoStatus;
}

export interface TodoDocument {
  pending: TodoItem[];
  inProgress: TodoItem[];
  done: TodoItem[];
}

const TODO_FILE_NAME = 'todo.md';

/**
 * Very small, opinionated format:
 *
 * ## Pending
 * - [ ] [id:feature-1] Implement feature X
 *
 * ## In Progress
 * - [ ] [id:bugfix-2] Fix bug Y
 *
 * ## Done
 * - [x] [id:chore-3] Cleanup
 */
export class TodoManager {
  constructor(private readonly rootDir: string) {}

  private get filePath() {
    return path.join(this.rootDir, TODO_FILE_NAME);
  }

  async load(): Promise<TodoDocument> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      return this.parse(content);
    } catch {
      // If file does not exist or cannot be parsed, start with an empty doc
      return { pending: [], inProgress: [], done: [] };
    }
  }

  async save(doc: TodoDocument): Promise<void> {
    const markdown = this.serialize(doc);
    await fs.writeFile(this.filePath, markdown, 'utf-8');
  }

  /**
   * Merge new tasks into the existing document.
   * - Reuses items with the same id (updates title if changed).
   * - Adds unknown ids into the pending section.
   */
  async mergeNewTasks(newTasks: Array<Omit<TodoItem, 'status'>>): Promise<TodoDocument> {
    const current = await this.load();
    const byId = new Map<string, TodoItem>();

    for (const item of [...current.pending, ...current.inProgress, ...current.done]) {
      byId.set(item.id, { ...item });
    }

    for (const t of newTasks) {
      const existing = byId.get(t.id);
      if (existing) {
        existing.title = t.title;
        byId.set(t.id, existing);
      } else {
        byId.set(t.id, { id: t.id, title: t.title, status: 'pending' });
      }
    }

    const updated: TodoDocument = {
      pending: [],
      inProgress: [],
      done: [],
    };

    for (const item of byId.values()) {
      if (item.status === 'in_progress') {
        updated.inProgress.push(item);
      } else if (item.status === 'done') {
        updated.done.push(item);
      } else {
        updated.pending.push(item);
      }
    }

    await this.save(updated);
    return updated;
  }

  /**
   * Get the next pending task, if any.
   */
  getNextPending(doc: TodoDocument): TodoItem | undefined {
    return doc.pending[0];
  }

  /**
   * Update the status for a specific id and return the updated doc.
   */
  async updateStatus(id: string, status: TodoStatus): Promise<TodoDocument> {
    const doc = await this.load();
    const all: TodoItem[] = [...doc.pending, ...doc.inProgress, ...doc.done];
    const updatedAll = all.map(item => (item.id === id ? { ...item, status } : item));

    const updated: TodoDocument = {
      pending: [],
      inProgress: [],
      done: [],
    };

    for (const item of updatedAll) {
      if (item.status === 'in_progress') {
        updated.inProgress.push(item);
      } else if (item.status === 'done') {
        updated.done.push(item);
      } else {
        updated.pending.push(item);
      }
    }

    await this.save(updated);
    return updated;
  }

  /**
   * Parse a markdown todo.md into a TodoDocument.
   */
  private parse(markdown: string): TodoDocument {
    const lines = markdown.split('\n');
    let section: 'pending' | 'in_progress' | 'done' | null = null;

    const doc: TodoDocument = {
      pending: [],
      inProgress: [],
      done: [],
    };

    for (const raw of lines) {
      const line = raw.trim();
      if (line.toLowerCase().startsWith('## pending')) {
        section = 'pending';
        continue;
      }
      if (line.toLowerCase().startsWith('## in progress')) {
        section = 'in_progress';
        continue;
      }
      if (line.toLowerCase().startsWith('## done')) {
        section = 'done';
        continue;
      }

      const match = /^-\s*\[([ xX])\]\s*(.*)$/.exec(line);
      if (!match || !section) continue;

      const checked = match[1].toLowerCase() === 'x';
      const rest = match[2].trim();

      // Extract id tag: [id:xyz]
      let id = '';
      let title = rest;
      const idMatch = rest.match(/\[id:([^\]]+)\]/);
      if (idMatch) {
        id = idMatch[1].trim();
        title = rest.replace(idMatch[0], '').trim();
      }

      // Fallback id if missing
      if (!id) {
        id = this.generateIdFromTitle(title);
      }

      const item: TodoItem = {
        id,
        title,
        status: checked ? 'done' : section === 'in_progress' ? 'in_progress' : 'pending',
      };

      if (section === 'pending') doc.pending.push(item);
      if (section === 'in_progress') doc.inProgress.push(item);
      if (section === 'done') doc.done.push(item);
    }

    return doc;
  }

  /**
   * Serialize a TodoDocument back into markdown.
   */
  private serialize(doc: TodoDocument): string {
    const lines: string[] = [];

    const pushSection = (title: string, items: TodoItem[]) => {
      lines.push(`## ${title}`);
      lines.push('');
      if (items.length === 0) {
        lines.push('_(none)_');
      } else {
        for (const item of items) {
          const checked = item.status === 'done' ? 'x' : ' ';
          lines.push(`- [${checked}] [id:${item.id}] ${item.title}`);
        }
      }
      lines.push('');
    };

    pushSection('Pending', doc.pending);
    pushSection('In Progress', doc.inProgress);
    pushSection('Done', doc.done);

    return lines.join('\n').trimEnd() + '\n';
  }

  private generateIdFromTitle(title: string): string {
    const base = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'task';
    const timestamp = Date.now().toString(36);
    return `${base}-${timestamp}`;
  }
}

