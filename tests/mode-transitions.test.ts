import { describe, expect, it } from 'vitest';
import { ModeOrchestrator, createModeState } from '../src/core/modes.js';

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
