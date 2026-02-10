import { TodoManager, TodoItem, TodoDocument } from '../utils/todoManager.js';

export interface PlanResult {
  doc: TodoDocument;
  tasks: TodoItem[];
  isLarge: boolean;
}

/**
 * Lightweight \"plan mode\" that decides whether a task is large/complex
 * and, if so, creates/updates todo.md with a structured list of tasks.
 *
 * This first implementation is intentionally heuristic and deterministic:
 * it does not call the LLM yet, but prepares a solid path for that later.
 */
export class PlanMode {
  constructor(private readonly rootDir: string) {}

  /**
   * Decide whether a task should go through plan mode.
   * Very simple heuristic based on length and obvious multi-step language.
   */
  isLargeTask(description: string): boolean {
    const text = description.trim();
    if (text.length > 400) return true;

    const lower = text.toLowerCase();
    const multiStepHints = [' and ', ' then ', ' followed by ', ' as well as ', 'step 1', 'step 2', 'first,', 'second,'];
    let hits = 0;
    for (const hint of multiStepHints) {
      if (lower.includes(hint)) {
        hits++;
      }
    }
    if (hits >= 2 || (hits >= 1 && text.length > 60)) {
      return true;
    }

    // Multiple bullet-like lines also indicate a larger request
    const lines = text.split('\n').map(l => l.trim());
    const bulletLines = lines.filter(l => /^[-*]\s+/.test(l)).length;
    if (bulletLines >= 2) return true;

    return false;
  }

  /**
   * Build or extend a TODO plan for the given description.
   * Returns the updated document plus the tasks it just added/updated.
   */
  async buildPlan(description: string): Promise<PlanResult> {
    const todoManager = new TodoManager(this.rootDir);

    // Split description into candidate task titles.
    const candidates = this.extractCandidateTasks(description);
    if (candidates.length === 0) {
      // Fallback: treat whole description as one task
      candidates.push(description.trim());
    }

    const newItems: Array<Omit<TodoItem, 'status'>> = candidates.map(title => ({
      id: this.generateDeterministicId(title),
      title: title.trim(),
    }));

    const doc = await todoManager.mergeNewTasks(newItems);

    // Return the concrete items (merged into the doc) corresponding to these ids
    const byId = new Map<string, TodoItem>();
    for (const item of [...doc.pending, ...doc.inProgress, ...doc.done]) {
      byId.set(item.id, item);
    }
    const tasks: TodoItem[] = [];
    for (const t of newItems) {
      const found = byId.get(t.id);
      if (found) tasks.push(found);
    }

    return {
      doc,
      tasks,
      isLarge: this.isLargeTask(description),
    };
  }

  private extractCandidateTasks(description: string): string[] {
    const text = description.trim();
    const lines = text.split('\n');
    const tasks: string[] = [];

    // 1) Use bullet-style lines as tasks when present
    for (const raw of lines) {
      const line = raw.trim();
      const bulletMatch = /^[-*]\s+(.*)$/.exec(line);
      if (bulletMatch) {
        const title = bulletMatch[1].trim();
        if (title.length >= 10) {
          tasks.push(title);
        }
      }
    }

    if (tasks.length > 0) return tasks;

    // 2) Fallback: split by sentences and keep reasonably sized chunks
    const sentenceLike = text
      .split(/[.!?]/)
      .map(s => s.trim())
      .filter(s => s.length >= 15);

    if (sentenceLike.length > 1) {
      return sentenceLike;
    }

    // 3) Last resort: single task with the full description
    if (text.length > 0) return [text];
    return [];
  }

  /**
   * Generate a deterministic id for a title within this plan.
   * We deliberately *do not* include timestamps here so the same
   * title maps to the same id when re-planning.
   */
  private generateDeterministicId(title: string): string {
    const base = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'task';
    return base;
  }
}

