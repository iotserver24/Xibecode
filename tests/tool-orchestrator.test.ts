import { describe, expect, it } from 'vitest';
import { ToolOrchestrator } from '../src/core/tool-orchestrator.js';

describe('ToolOrchestrator', () => {
  it('partitions read-only tools into concurrent batches', () => {
    const orchestrator = new ToolOrchestrator();
    const batches = orchestrator.partition([
      { id: '1', name: 'read_file', type: 'tool_use', input: {} } as any,
      { id: '2', name: 'search_files', type: 'tool_use', input: {} } as any,
      { id: '3', name: 'write_file', type: 'tool_use', input: {} } as any,
    ]);

    expect(batches.length).toBe(2);
    expect(batches[0]?.isConcurrent).toBe(true);
    expect(batches[1]?.isConcurrent).toBe(false);
  });

  it('limits concurrent read-only execution and preserves result order', async () => {
    const orchestrator = new ToolOrchestrator({ localConcurrency: 2, networkConcurrency: 1 });
    let active = 0;
    let maxActive = 0;

    const updates = await orchestrator.executeBatches(
      [
        { id: '1', name: 'read_file', type: 'tool_use', input: {} } as any,
        { id: '2', name: 'read_file', type: 'tool_use', input: {} } as any,
        { id: '3', name: 'read_file', type: 'tool_use', input: {} } as any,
      ],
      async (toolUse, index) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { toolUse, index, result: toolUse.id, success: true };
      },
    );

    expect(maxActive).toBe(2);
    expect(updates.map((u) => u.toolUse.id)).toEqual(['1', '2', '3']);
  });

  it('runs mutating tools sequentially between read-only batches', async () => {
    const orchestrator = new ToolOrchestrator({ localConcurrency: 3 });
    const order: string[] = [];

    await orchestrator.executeBatches(
      [
        { id: '1', name: 'read_file', type: 'tool_use', input: {} } as any,
        { id: '2', name: 'write_file', type: 'tool_use', input: {} } as any,
        { id: '3', name: 'read_file', type: 'tool_use', input: {} } as any,
      ],
      async (toolUse, index) => {
        order.push(toolUse.id);
        return { toolUse, index, result: toolUse.id, success: true };
      },
    );

    expect(order).toEqual(['1', '2', '3']);
  });
});
