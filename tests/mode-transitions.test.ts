import { describe, expect, it } from 'vitest';
import {
  ModeOrchestrator,
  createModeState,
  getToolCategory,
  isToolAllowed,
  parseTaskComplete,
} from '../src/core/modes.js';

describe('ModeOrchestrator policy defaults', () => {
  it('defaults to prompt-only auto-approval policy', () => {
    const orchestrator = new ModeOrchestrator();
    expect(orchestrator.getPolicy().autoApprovalPolicy).toBe('prompt-only');
  });

  it('requires confirmation for model escalation to write mode', () => {
    const orchestrator = new ModeOrchestrator();
    const requested = orchestrator.requestModeChange(
      createModeState('plan'),
      'agent',
      'Need to implement changes',
      'model',
    );
    const evaluation = orchestrator.evaluateModeChangeRequest(requested);
    expect(evaluation.approved).toBe(false);
    expect(evaluation.requiresConfirmation).toBe(true);
  });

  it('approves user-requested mode changes', () => {
    const orchestrator = new ModeOrchestrator();
    const requested = orchestrator.requestModeChange(
      createModeState('plan'),
      'agent',
      'User requested implementation',
      'user',
    );
    const evaluation = orchestrator.evaluateModeChangeRequest(requested);
    expect(evaluation.approved).toBe(true);
    expect(evaluation.requiresConfirmation).toBe(false);
  });
});

describe('dynamic tool categorization', () => {
  it('infers MCP-style dynamic tools as network by default', () => {
    expect(getToolCategory('filesystem::read')).toBe('network');
    expect(isToolAllowed('agent', 'filesystem::read').allowed).toBe(true);
  });

  it('infers dangerous dynamic names as shell commands', () => {
    expect(getToolCategory('plugin_exec_shell')).toBe('shell_command');
  });

  it('parses task complete tags with extra metadata', () => {
    const parsed = parseTaskComplete(
      'done [[TASK_COMPLETE | summary=Implemented feature | evidence=read_file:src/a.ts]]',
    );
    expect(parsed).toEqual({
      summary: 'Implemented feature',
      evidence: 'read_file:src/a.ts',
    });
  });
});
