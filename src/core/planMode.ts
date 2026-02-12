import { TodoManager, TodoItem, TodoDocument } from '../utils/todoManager.js';
import { EnhancedAgent, AgentConfig, AgentEvent } from './agent.js';
import { CodingToolExecutor } from './tools.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';

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
  constructor(
    private readonly rootDir: string,
    private readonly config: AgentConfig,
    private readonly provider: 'anthropic' | 'openai'
  ) { }

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
  /**
   * Build or extend a TODO plan using the AI Architect.
   */
  async buildPlan(description: string): Promise<PlanResult> {
    console.log(chalk.cyan('\n🧠 AI Architect is analyzing the request...'));

    // Initialize the Architect Agent
    // We give it a restricted set of tools: Read access + Write access ONLY to plan/todo files
    // For now, we'll give it the standard executor but instruct it carefully.
    const toolExecutor = new CodingToolExecutor(this.rootDir, {
      dryRun: false // We want it to actually write the plan files
    });

    // Filter tools to ensure safety during planning (read-only + specific writes)
    // Actually, giving full read access is good. We just want to encourage it to write plans.
    const tools = toolExecutor.getTools();

    const architect = new EnhancedAgent(
      { ...this.config, maxIterations: 10 }, // Limit iterations for planning
      this.provider
    );

    // Forward events for visibility
    architect.on('event', (event: AgentEvent) => {
      if (event.type === 'thinking') console.log(chalk.gray(`  ${event.data.message}`));
    });

    const prompt = `
You are the AI Architect. Your goal is to analyze the user's request and create a concrete execution plan.

USER REQUEST: "${description}"

1.  **Explore**: Read files to understand the current state of the project.
2.  **Plan**: Create a detailed \`implementation_plan.md\` file.
    -   Describe the architectural changes.
    -   List files to create/modify.
    -   Identify potential risks.
3.  **Tasking**: Create or Update the \`todo.md\` file.
    -   Break the plan into small, testable tasks.
    -   Use a markdown list format with IDs if possible, or just a standard task list.
    -   The \`todo.md\` MUST be actionable.

Perform these steps now.
    `.trim();

    try {
      await architect.run(prompt, tools, toolExecutor);
    } catch (error) {
      console.error(chalk.red('Architect failed to generate plan:'), error);
    }

    // Now read the generated todo.md to return the result
    const todoManager = new TodoManager(this.rootDir);
    let doc: TodoDocument;

    try {
      // Force reload from disk in case Agent wrote it
      doc = await todoManager.load();
    } catch (e) {
      // Fallback if no todo.md was created
      doc = { pending: [], inProgress: [], done: [] };
    }

    // If doc is empty, fallback to heuristic (means Agent failed to write todo.md)
    if (doc.pending.length === 0 && doc.inProgress.length === 0 && doc.done.length === 0) {
      console.log(chalk.yellow('  (Architect did not create tasks, falling back to heuristic)'));
      return this.fallbackBuildPlan(description);
    }

    return {
      doc,
      tasks: doc.pending, // This might not be exactly "new" tasks, but "pending" ones
      isLarge: true,
    };
  }

  /**
   * Fallback to the old heuristic method if AI fails
   */
  async fallbackBuildPlan(description: string): Promise<PlanResult> {
    const todoManager = new TodoManager(this.rootDir);
    const candidates = this.extractCandidateTasks(description);
    if (candidates.length === 0) candidates.push(description.trim());

    const newItems = candidates.map((title: string) => ({
      id: this.generateDeterministicId(title),
      title: title.trim(),
    }));

    const doc = await todoManager.mergeNewTasks(newItems);

    // Re-map to find added tasks
    const byId = new Map<string, TodoItem>();
    [...doc.pending, ...doc.inProgress, ...doc.done].forEach(i => byId.set(i.id, i));

    const tasks = newItems.map((t: any) => byId.get(t.id)).filter(Boolean) as TodoItem[];

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

