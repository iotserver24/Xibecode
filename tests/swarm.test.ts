import { describe, expect, it, vi } from 'vitest';
import type { BackgroundAgentManager } from '../src/core/background-agent.js';
import { SwarmOrchestrator } from '../src/core/swarm.js';
import type { AgentMode } from '../src/core/modes.js';

describe('SwarmOrchestrator.delegateSubtasksParallel', () => {
  it('respects maxConcurrent (bounded parallelism)', async () => {
    const orch = new SwarmOrchestrator({} as unknown as BackgroundAgentManager);
    let inFlight = 0;
    let maxInFlight = 0;

    vi.spyOn(orch, 'delegateSubtask').mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 15));
      inFlight -= 1;
      return {
        success: true,
        result: 'ok',
        taskId: 'mock',
        status: 'completed' as const,
      };
    });

    const subtasks = Array.from({ length: 10 }, (_, i) => ({
      mode: 'plan' as AgentMode,
      task: `task-${i}`,
    }));

    await orch.delegateSubtasksParallel(subtasks, { maxConcurrent: 3 });

    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(orch.delegateSubtask).toHaveBeenCalledTimes(10);
  });

  it('runs all subtasks when maxConcurrent exceeds count', async () => {
    const orch = new SwarmOrchestrator({} as unknown as BackgroundAgentManager);
    vi.spyOn(orch, 'delegateSubtask').mockResolvedValue({
      success: true,
      result: 'ok',
      taskId: 'mock',
      status: 'completed',
    });

    const subtasks = [
      { mode: 'plan' as AgentMode, task: 'a' },
      { mode: 'engineer' as AgentMode, task: 'b' },
    ];

    const results = await orch.delegateSubtasksParallel(subtasks, { maxConcurrent: 100 });
    expect(results).toHaveLength(2);
    expect(results[0]?.worker_type).toBe('plan');
    expect(results[1]?.worker_type).toBe('engineer');
  });
});
