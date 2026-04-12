import type { Tool } from '@anthropic-ai/sdk/resources/messages';

export type AgentExecutionRole = 'coordinator' | 'worker';

const WORKER_BLOCKLIST = new Set([
  'create_git_checkpoint',
  'revert_to_git_checkpoint',
  'git_commit',
  'run_background_task',
  'delegate_subtask',
  'run_swarm',
]);

export function applyAgentToolPolicy(tools: Tool[], role: AgentExecutionRole): Tool[] {
  if (role === 'coordinator') {
    return tools;
  }
  return tools.filter((tool) => !WORKER_BLOCKLIST.has(tool.name));
}

export function getWorkerBlockedTools(): string[] {
  return Array.from(WORKER_BLOCKLIST.values());
}
