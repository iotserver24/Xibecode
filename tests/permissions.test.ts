import { describe, expect, it } from 'vitest';
import { PermissionManager } from '../src/core/permissions.js';

describe('PermissionManager', () => {
  it('allows high-risk tools by default in agent mode', () => {
    const manager = new PermissionManager('agent');
    const decision = manager.evaluateToolExecution({}, 'run_command', 'shell_command');
    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(false);
  });

  it('allows confirmed high-risk tool execution', () => {
    const manager = new PermissionManager('agent');
    const decision = manager.evaluateToolExecution({ confirm: true }, 'run_command', 'shell_command');
    expect(decision.allowed).toBe(true);
  });

  it('stores and reuses session-scoped approvals', () => {
    const manager = new PermissionManager('agent');
    manager.grantToolApproval('run_command', 'shell_command', 'session');
    const decision = manager.evaluateToolExecution({}, 'run_command', 'shell_command');
    expect(decision.allowed).toBe(true);
  });

  it('blocks high-risk operations in plan permission mode', () => {
    const manager = new PermissionManager('plan');
    const decision = manager.evaluateToolExecution({}, 'write_file', 'write_fs');
    expect(decision.allowed).toBe(false);
    expect(decision.requiresApproval).toBe(false);
  });

  it('requires explicit approval for unknown category tools', () => {
    const manager = new PermissionManager('agent');
    const denied = manager.evaluateToolExecution({}, 'custom_dynamic_tool');
    expect(denied.allowed).toBe(false);
    expect(denied.requiresApproval).toBe(true);

    const approved = manager.evaluateToolExecution({ confirm: true }, 'custom_dynamic_tool');
    expect(approved.allowed).toBe(true);
  });
});
