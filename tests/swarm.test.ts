import { describe, expect, it, vi } from 'vitest';
import { SwarmOrchestrator } from '../src/core/swarm.js';

describe('SwarmOrchestrator', () => {
  it('injects worker restrictions in delegated prompt', async () => {
    const startTask = vi.fn(async () => 'task-1');
    const getTask = vi.fn(async () => ({ status: 'completed' }));
    const getTaskLogs = vi.fn(async () => 'done');
    const orchestrator = new SwarmOrchestrator({
      startTask,
      getTask,
      getTaskLogs,
    } as any);

    const result = await orchestrator.delegateSubtask('agent', 'Implement feature', 1000);

    expect(result.success).toBe(true);
    const prompt = startTask.mock.calls[0]?.[0] as string;
    expect(prompt).toContain('Never call restricted coordinator tools');
  });
});
