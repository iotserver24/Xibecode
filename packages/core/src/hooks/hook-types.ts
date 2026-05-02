/**
 * Hook type definitions for XibeCode lifecycle hooks.
 *
 * Supports 4 hook types (command, prompt, agent, HTTP) across
 * 9 lifecycle events. Hooks can approve/block tool calls,
 * inject system messages, and modify agent behavior.
 */

// ─── Hook Events ──────────────────────────────────────────────────

export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'SessionStart'
  | 'SessionEnd'
  | 'UserPromptSubmit'
  | 'Stop'
  | 'StopFailure'
  | 'PreCompact'
  | 'PostCompact';

export const HOOK_EVENTS: HookEvent[] = [
  'PreToolUse',
  'PostToolUse',
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'Stop',
  'StopFailure',
  'PreCompact',
  'PostCompact',
];

// ─── Hook Config Types ────────────────────────────────────────────

export interface BaseHookConfig {
  type: string;
  /** Optional permission-rule filter, e.g. "Bash(git *)" */
  if?: string;
  /** Timeout in seconds (default: 60) */
  timeout?: number;
  /** Status message shown while hook runs */
  statusMessage?: string;
  /** Run once then remove */
  once?: boolean;
}

export interface CommandHookConfig extends BaseHookConfig {
  type: 'command';
  command: string;
  shell?: 'bash' | 'powershell';
  /** Non-blocking execution */
  async?: boolean;
}

export interface PromptHookConfig extends BaseHookConfig {
  type: 'prompt';
  prompt: string;
  model?: string;
}

export interface AgentHookConfig extends BaseHookConfig {
  type: 'agent';
  prompt: string;
  model?: string;
}

export interface HttpHookConfig extends BaseHookConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
  allowedEnvVars?: string[];
}

export type HookConfig =
  | CommandHookConfig
  | PromptHookConfig
  | AgentHookConfig
  | HttpHookConfig;

/** Function hook -- in-memory only, not persisted */
export interface FunctionHookConfig {
  type: 'function';
  fn: (context: HookContext) => Promise<HookResult | void>;
  /** Optional event filter */
  if?: string;
}

// ─── Hook Context ─────────────────────────────────────────────────

export interface HookContext {
  event: HookEvent;
  /** Tool name for PreToolUse/PostToolUse */
  toolName?: string;
  /** Tool input for PreToolUse/PostToolUse */
  toolInput?: Record<string, unknown>;
  /** Tool result for PostToolUse */
  toolResult?: unknown;
  /** Session ID */
  sessionId?: string;
  /** User prompt for UserPromptSubmit */
  userPrompt?: string;
  /** Stop reason for Stop/StopFailure */
  stopReason?: string;
  /** Error message for StopFailure */
  error?: string;
  /** Compaction trigger for PreCompact/PostCompact */
  compactTrigger?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ─── Hook Result ──────────────────────────────────────────────────

export interface HookResult {
  /** Whether to continue processing (default: true) */
  continue?: boolean;
  /** Whether to suppress output from the hook */
  suppressOutput?: boolean;
  /** Reason for stopping (when continue=false) */
  stopReason?: string;
  /** For PreToolUse: approve or block the tool call */
  decision?: 'approve' | 'block';
  /** Reason for the decision */
  reason?: string;
  /** System message to inject into the conversation */
  systemMessage?: string;
  /** Updated input for the tool (PostToolUse) */
  updatedInput?: Record<string, unknown>;
}

// ─── Hook Matcher (for settings.json) ─────────────────────────────

export interface HookMatcher {
  /** Filter by the event's matcher field (e.g., tool_name for PreToolUse) */
  matcher?: string;
  hooks: HookConfig[];
}

// ─── Hook Registration ────────────────────────────────────────────

export interface RegisteredHook {
  id: string;
  event: HookEvent;
  matcher?: string;
  config: HookConfig | FunctionHookConfig;
  source: 'settings' | 'session' | 'plugin';
  /** Whether this hook has been consumed (once=true) */
  consumed?: boolean;
}
