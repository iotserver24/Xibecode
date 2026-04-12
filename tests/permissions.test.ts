import { describe, expect, it } from 'vitest';
import { PermissionManager } from '../src/core/permissions.js';

describe('PermissionManager', () => {
  it('requires confirmation for high-risk tools in default mode', () => {
    const manager = new PermissionManager('agent');
    const decision = manager.evaluateToolExecution({}, 'run_command', 'shell_command');
    expect(decision.allowed).toBe(false);
    expect(decision.requiresApproval).toBe(true);
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
});
