import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { evaluateStopHooks } from './stop-hooks.js';

describe('evaluateStopHooks', () => {
  const prev = process.env.XIBECODE_STOP_HOOKS;
  beforeEach(() => {
    delete process.env.XIBECODE_STOP_HOOKS;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.XIBECODE_STOP_HOOKS;
    else process.env.XIBECODE_STOP_HOOKS = prev;
  });

  it('allows short conversational answers', () => {
    const r = evaluateStopHooks({
      mode: 'balanced',
      assistantText: 'The function is defined in src/foo.ts around line 40.',
      toolCallCount: 0,
      filesChanged: [],
      recentEvidence: [],
      hasRecentGroundedEvidence: false,
      stopHookRetries: 0,
    });
    expect(r.preventContinuation).toBe(false);
  });

  it('blocks success claims without evidence', () => {
    const r = evaluateStopHooks({
      mode: 'balanced',
      assistantText: 'All tests pass and I fully fixed the bug.',
      toolCallCount: 0,
      filesChanged: [],
      recentEvidence: [],
      hasRecentGroundedEvidence: false,
      stopHookRetries: 0,
    });
    expect(r.preventContinuation).toBe(true);
    expect(r.nudgeMessage).toMatch(/Stop-hook/);
  });

  it('blocks finish when files changed without evidence', () => {
    const r = evaluateStopHooks({
      mode: 'balanced',
      assistantText: 'Updated the handler.',
      toolCallCount: 3,
      filesChanged: ['src/a.ts'],
      recentEvidence: [],
      hasRecentGroundedEvidence: false,
      stopHookRetries: 0,
    });
    expect(r.preventContinuation).toBe(true);
  });

  it('respects off mode and env disable', () => {
    expect(
      evaluateStopHooks({
        mode: 'off',
        assistantText: 'All tests pass',
        toolCallCount: 0,
        filesChanged: ['x'],
        recentEvidence: [],
        hasRecentGroundedEvidence: false,
        stopHookRetries: 0,
      }).preventContinuation,
    ).toBe(false);

    process.env.XIBECODE_STOP_HOOKS = '0';
    expect(
      evaluateStopHooks({
        mode: 'strict',
        assistantText: 'All tests pass',
        toolCallCount: 0,
        filesChanged: ['x'],
        recentEvidence: [],
        hasRecentGroundedEvidence: false,
        stopHookRetries: 0,
      }).preventContinuation,
    ).toBe(false);
  });

  it('stops after retry budget', () => {
    const r = evaluateStopHooks({
      mode: 'balanced',
      assistantText: 'All tests pass',
      toolCallCount: 0,
      filesChanged: [],
      recentEvidence: [],
      hasRecentGroundedEvidence: false,
      stopHookRetries: 5,
    });
    expect(r.preventContinuation).toBe(false);
  });
});
