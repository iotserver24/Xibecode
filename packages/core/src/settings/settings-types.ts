/**
 * Settings type definitions for XibeCode.
 *
 * Multi-source settings with priority: user < project < local < policy.
 * Arrays are concatenated and deduplicated across sources. Objects are deep-merged.
 */

import type { PermissionMode } from '../permissions.js';

// ─── Hook types (forward declaration) ─────────────────────────────

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

export interface HookMatcher {
  matcher?: string;
  hooks: HookConfig[];
}

export type HookConfig = CommandHook | PromptHook | AgentHook | HttpHook;

export interface BaseHook {
  type: string;
  /** Optional permission-rule filter, e.g. "Bash(git *)" */
  if?: string;
  /** Timeout in seconds */
  timeout?: number;
  /** Status message shown while hook runs */
  statusMessage?: string;
  /** Run once then remove */
  once?: boolean;
}

export interface CommandHook extends BaseHook {
  type: 'command';
  command: string;
  shell?: 'bash' | 'powershell';
  /** Non-blocking execution */
  async?: boolean;
}

export interface PromptHook extends BaseHook {
  type: 'prompt';
  prompt: string;
  model?: string;
}

export interface AgentHook extends BaseHook {
  type: 'agent';
  prompt: string;
  model?: string;
}

export interface HttpHook extends BaseHook {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
  allowedEnvVars?: string[];
}

// ─── Permission types ─────────────────────────────────────────────

export interface PermissionSettings {
  allow?: string[];
  deny?: string[];
  ask?: string[];
  defaultMode?: PermissionMode;
  disableBypassPermissionsMode?: boolean;
  additionalDirectories?: string[];
}

// ─── Main settings schema ─────────────────────────────────────────

export interface SettingsSchema {
  /** Permission rules and mode */
  permissions?: PermissionSettings;
  /** Lifecycle hooks */
  hooks?: Partial<Record<HookEvent, HookMatcher[]>>;
  /** Environment variables for sessions */
  env?: Record<string, string>;
  /** Default model override */
  model?: string;
  /** Whether auto-memory is enabled (default: true) */
  autoMemoryEnabled?: boolean;
  /** Token threshold for auto-compaction (default: 13000 from context window edge) */
  autoCompactThreshold?: number;
  /** Whether auto-compact is enabled (default: true) */
  autoCompactEnabled?: boolean;
  /** Custom status line command */
  statusLine?: string;
  /** Transcript retention period in days */
  cleanupPeriodDays?: number;
  /** Whether to disable all hooks (policy only) */
  disableAllHooks?: boolean;
  /** Whether to only allow managed hooks (policy only) */
  allowManagedHooksOnly?: boolean;
  /** HTTP hook URL allowlist (policy only) */
  allowedHttpHookUrls?: string[];
  /** HTTP hook env var allowlist (policy only) */
  httpHookAllowedEnvVars?: string[];
}

// ─── Settings source types ────────────────────────────────────────

export type SettingsSource = 'user' | 'project' | 'local' | 'policy';

export interface SettingsSourceEntry {
  source: SettingsSource;
  path: string;
  settings: SettingsSchema;
}
