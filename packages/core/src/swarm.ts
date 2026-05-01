import { BackgroundAgentManager } from './background-agent.js';
import { AgentMode } from './modes.js';
import { getWorkerBlockedTools } from './agent-tool-policies.js';

export interface SubtaskResult {
    success: boolean;
    result: string;
    taskId: string;
    status: 'completed' | 'failed' | 'timeout' | 'killed';
    /** Set when returned from parallel swarm runs */
    worker_type?: AgentMode;
}

/** Default cap on concurrent background agent processes (overridable via `run_swarm` max_parallel). */
export const DEFAULT_SWARM_MAX_PARALLEL = 6;

async function runWithConcurrency<T, R>(
    items: readonly T[],
    maxConcurrent: number,
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    if (items.length === 0) return [];
    const limit = Math.max(1, Math.floor(maxConcurrent));
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    async function worker(): Promise<void> {
        while (true) {
            const i = nextIndex++;
            if (i >= items.length) return;
            results[i] = await fn(items[i], i);
        }
    }

    const poolSize = Math.min(limit, items.length);
    await Promise.all(Array.from({ length: poolSize }, () => worker()));
    return results;
}

export class SwarmOrchestrator {
    constructor(private backgroundAgent: BackgroundAgentManager) { }

    /**
     * Delegates a task to a specialized agent mode.
     * Starts a background agent with specific mode instructions and waits for completion.
     */
    async delegateSubtask(
        mode: AgentMode,
        task: string,
        timeoutMs: number = 60000 * 5 // 5 minutes default timeout
    ): Promise<SubtaskResult> {

        // Construct the prompt to force mode switch and structured completion
        const prompt = `[[REQUEST_MODE: ${mode} | reason=Delegated Swarm Task]]

TASK DESCRIPTION:
${task}

IMPORTANT INSTRUCTIONS:
1. You are a specialized worker in '${mode}' mode.
2. Focus ONLY on this task.
3. When finished, you MUST output the following tag:
[[TASK_COMPLETE | summary=Task finished successfully]]
4. Never call restricted coordinator tools: ${getWorkerBlockedTools().join(', ')}.
`;

        try {
            const taskId = await this.backgroundAgent.startTask(prompt);
            return this.pollTask(taskId, timeoutMs);
        } catch (error: any) {
            return {
                success: false,
                result: `Failed to start subtask: ${error.message}`,
                taskId: '',
                status: 'failed'
            };
        }
    }

    private async pollTask(taskId: string, timeoutMs: number): Promise<SubtaskResult> {
        const startTime = Date.now();
        const pollInterval = 2000; // 2 seconds

        while (Date.now() - startTime < timeoutMs) {
            const task = await this.backgroundAgent.getTask(taskId);

            if (!task) {
                // Task might be initializing or file lock issue?
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                continue;
            }

            // Check provided status
            if (task.status === 'completed' || task.status === 'failed' || task.status === 'killed') {
                const logs = await this.backgroundAgent.getTaskLogs(taskId);
                return {
                    success: task.status === 'completed',
                    result: logs,
                    taskId,
                    status: task.status
                };
            }

            // Also check logs for [[TASK_COMPLETE]] even if process is still running
            // BackgroundAgent implementation relies on process exit for 'completed' status usually.
            // But if the agent keeps running (e.g. infinite loop), we might want to catch the completion tag.
            // However, BackgroundAgent logic only updates status when process exits or is killed.
            // Let's rely on status for now, assuming the sub-agent exits after notify_user?
            // Wait, notify_user exits task mode, but not the process if run with `xibecode run`.
            // `xibecode run` keeps running until input exhausted or explicit exit?
            // Actually `xibecode run` is interactive REPL usually.
            // If run non-interactively with prompt, it runs once and exits?
            // Let's assume it exits.

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        return {
            success: false,
            result: 'Task timed out waiting for completion.',
            taskId,
            status: 'timeout'
        };
    }

    /**
     * Run multiple delegated subtasks with bounded concurrency (parallel when there are multiple workers).
     * Each subtask is an isolated background `xibecode run` process; overlapping writes to the same files can conflict.
     */
    async delegateSubtasksParallel(
        subtasks: { mode: AgentMode; task: string }[],
        options?: { timeoutMs?: number; maxConcurrent?: number },
    ): Promise<SubtaskResult[]> {
        const timeoutMs = options?.timeoutMs ?? 60000 * 5;
        const maxConcurrent = options?.maxConcurrent ?? DEFAULT_SWARM_MAX_PARALLEL;
        return runWithConcurrency(subtasks, maxConcurrent, async (s) => {
            const r = await this.delegateSubtask(s.mode, s.task, timeoutMs);
            return { ...r, worker_type: s.mode };
        });
    }
}
