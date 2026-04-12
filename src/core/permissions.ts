import * as path from 'path';
import type { AgentMode } from './modes.js';
import { MODE_CONFIG } from './modes.js';

export type PermissionMode = 'default' | 'plan' | 'acceptEdits' | 'dontAsk';
export type ApprovalScope = 'single' | 'session' | 'directory';

export interface ToolPermissionContext {
  permissionMode: PermissionMode;
  mode: AgentMode;
  sessionApprovals: Set<string>;
  directoryApprovals: Set<string>;
}

export interface ToolPermissionDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
}

export interface ModeTransitionDecision {
  approved: boolean;
  requiresConfirmation: boolean;
  reason?: string;
}

const HIGH_RISK_CATEGORIES = new Set(['write_fs', 'git_mutation', 'shell_command']);

function normalizeDirectory(dirPath: string): string {
  return path.resolve(dirPath);
}

export class PermissionManager {
  private context: ToolPermissionContext;

  constructor(initialMode: AgentMode) {
    this.context = {
      permissionMode: this.getDefaultPermissionMode(initialMode),
      mode: initialMode,
      sessionApprovals: new Set<string>(),
      directoryApprovals: new Set<string>(),
    };
  }

  getContext(): ToolPermissionContext {
    return this.context;
  }

  setMode(mode: AgentMode): void {
    this.context = {
      ...this.context,
      mode,
      permissionMode: this.getDefaultPermissionMode(mode),
    };
  }

  setPermissionMode(permissionMode: PermissionMode): void {
    this.context = {
      ...this.context,
      permissionMode,
    };
  }

  clearSessionApprovals(): void {
    this.context.sessionApprovals.clear();
    this.context.directoryApprovals.clear();
  }

  evaluateModeTransition(fromMode: AgentMode, toMode: AgentMode): ModeTransitionDecision {
    const fromConfig = MODE_CONFIG[fromMode];
    const toConfig = MODE_CONFIG[toMode];

    if (this.context.permissionMode === 'dontAsk') {
      return { approved: true, requiresConfirmation: false };
    }

    if (this.context.permissionMode === 'acceptEdits') {
      return { approved: true, requiresConfirmation: false };
    }

    if (toConfig.requiresConfirmation) {
      return {
        approved: false,
        requiresConfirmation: true,
        reason: `${toMode} mode requires confirmation`,
      };
    }

    if (!fromConfig.canModify && toConfig.canModify) {
      return {
        approved: false,
        requiresConfirmation: true,
        reason: 'Escalating to write-capable mode requires confirmation',
      };
    }

    return { approved: true, requiresConfirmation: false };
  }

  evaluateToolExecution(input: Record<string, any>, toolName: string, category?: string): ToolPermissionDecision {
    if (!category) {
      // Unknown category (for plugin/MCP/dynamic tools): allow and defer to tool-level checks.
      return { allowed: true, requiresApproval: false };
    }

    if (this.context.permissionMode === 'dontAsk') {
      return { allowed: true, requiresApproval: false };
    }

    if (this.context.permissionMode === 'plan' && HIGH_RISK_CATEGORIES.has(category)) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: `Permission mode '${this.context.permissionMode}' blocks ${category} operations`,
      };
    }

    if (!HIGH_RISK_CATEGORIES.has(category)) {
      return { allowed: true, requiresApproval: false };
    }

    if (this.context.permissionMode === 'acceptEdits') {
      return { allowed: true, requiresApproval: false };
    }

    if (input.confirm === true || input.approved === true) {
      return { allowed: true, requiresApproval: false };
    }

    const sessionKey = `${toolName}:${category}`;
    if (this.context.sessionApprovals.has(sessionKey)) {
      return { allowed: true, requiresApproval: false };
    }

    const inputPath = typeof input.path === 'string' ? normalizeDirectory(input.path) : null;
    if (inputPath && this.hasDirectoryApprovalFor(inputPath)) {
      return { allowed: true, requiresApproval: false };
    }

    return {
      allowed: false,
      requiresApproval: true,
      reason: `Tool '${toolName}' (${category}) requires explicit approval. Re-run with { \"confirm\": true } to approve once, or include { \"approval_scope\": \"session\" | \"directory\" }.`,
    };
  }

  grantToolApproval(toolName: string, category: string, scope: ApprovalScope, inputPath?: string): void {
    if (scope === 'single') return;

    if (scope === 'session') {
      this.context.sessionApprovals.add(`${toolName}:${category}`);
      return;
    }

    if (scope === 'directory' && inputPath) {
      this.context.directoryApprovals.add(normalizeDirectory(inputPath));
    }
  }

  private hasDirectoryApprovalFor(inputPath: string): boolean {
    for (const approvedDir of this.context.directoryApprovals) {
      if (inputPath.startsWith(approvedDir)) {
        return true;
      }
    }
    return false;
  }

  private getDefaultPermissionMode(mode: AgentMode): PermissionMode {
    if (mode === 'plan') return 'plan';
    if (mode === 'agent' || mode === 'engineer') return 'default';
    if (!MODE_CONFIG[mode].canModify) return 'plan';
    return 'default';
  }
}
