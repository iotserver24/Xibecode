import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';

export interface ToolExecutionUpdate {
  toolUse: ToolUseBlock;
  index: number;
  result: any;
  success: boolean;
}

export type ToolExecutorCallback = (toolUse: ToolUseBlock, index: number) => Promise<ToolExecutionUpdate>;

const CONCURRENCY_SAFE_TOOLS = new Set([
  'read_file',
  'read_multiple_files',
  'list_directory',
  'search_files',
  'get_context',
  'get_git_status',
  'get_git_changed_files',
  'get_git_diff_summary',
  'fetch_url',
  'web_search',
  'get_test_status',
  'find_files',
  'grep_code',
]);

type ToolBatch = {
  isConcurrent: boolean;
  blocks: Array<{ toolUse: ToolUseBlock; index: number }>;
};

export class ToolOrchestrator {
  partition(toolUseBlocks: ToolUseBlock[]): ToolBatch[] {
    const batches: ToolBatch[] = [];
    for (let index = 0; index < toolUseBlocks.length; index += 1) {
      const toolUse = toolUseBlocks[index]!;
      const isConcurrent = this.isConcurrencySafe(toolUse.name);
      const lastBatch = batches[batches.length - 1];
      if (isConcurrent && lastBatch?.isConcurrent) {
        lastBatch.blocks.push({ toolUse, index });
      } else {
        batches.push({
          isConcurrent,
          blocks: [{ toolUse, index }],
        });
      }
    }
    return batches;
  }

  async executeBatches(
    toolUseBlocks: ToolUseBlock[],
    executeTool: ToolExecutorCallback,
  ): Promise<ToolExecutionUpdate[]> {
    const updates: ToolExecutionUpdate[] = [];
    const batches = this.partition(toolUseBlocks);
    for (const batch of batches) {
      if (batch.isConcurrent) {
        const batchUpdates = await Promise.all(
          batch.blocks.map(({ toolUse, index }) => executeTool(toolUse, index)),
        );
        updates.push(...batchUpdates);
      } else {
        for (const { toolUse, index } of batch.blocks) {
          updates.push(await executeTool(toolUse, index));
        }
      }
    }

    updates.sort((a, b) => a.index - b.index);
    return updates;
  }

  private isConcurrencySafe(toolName: string): boolean {
    return CONCURRENCY_SAFE_TOOLS.has(toolName);
  }
}
