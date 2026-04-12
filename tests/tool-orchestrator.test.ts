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
});
