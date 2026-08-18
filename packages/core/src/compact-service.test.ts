import { describe, expect, it, beforeEach } from 'vitest';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { compactSession, isCompactInFlight, resetCompactLocks } from './compact-service.js';
import { RunObservation } from './run-handoff.js';

function user(text: string): MessageParam {
  return { role: 'user', content: text };
}
function assistant(text: string): MessageParam {
  return { role: 'assistant', content: text };
}

function longHistory(): MessageParam[] {
  const messages: MessageParam[] = [];
  for (let i = 0; i < 24; i++) {
    messages.push(user(`please implement feature ${i} ${'x'.repeat(200)}`));
    messages.push(assistant(`did work on feature ${i} ${'y'.repeat(200)}`));
  }
  messages.push(user('[[PLAN_READY]] keep shipping the preview browser'));
  messages.push(assistant('continuing the active plan'));
  return messages;
}

describe('compactSession', () => {
  beforeEach(() => {
    resetCompactLocks();
  });

  it('skips when there is nothing to drop', async () => {
    const result = await compactSession({
      sessionId: 'tiny',
      cwd: '/tmp',
      messages: [user('hi'), assistant('hello')],
      trigger: 'manual',
      contextWindow: 120_000,
      observation: new RunObservation(),
    });
    expect(result.skipped).toBe(true);
    expect(result.droppedCount).toBe(0);
    expect(result.userStatus).toMatch(/already within/i);
  });

  it('preserves plan markers and writes a handoff summary', async () => {
    const obs = new RunObservation();
    obs.setTask('preview browser');
    obs.recordFileChange('lib/preview.dart');
    obs.recordValidation('flutter test', 'passed', 0);
    const result = await compactSession({
      sessionId: 'big',
      cwd: '/tmp',
      messages: longHistory(),
      trigger: 'manual',
      contextWindow: 8_000,
      observation: obs,
    });
    expect(result.skipped).toBe(false);
    expect(result.droppedCount).toBeGreaterThan(0);
    expect(result.handoff?.changedFiles).toContain('lib/preview.dart');
    expect(result.handoff?.validation[0]?.result).toBe('passed');
    const text = result.messages
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .join('\n');
    expect(text).toMatch(/Run Handoff|PLAN_READY/);
    expect(result.userStatus).toMatch(/Compacted context/);
  });

  it('rejects a second in-flight compact for the same session', async () => {
    const messages = longHistory();
    const first = compactSession({
      sessionId: 'lock-me',
      cwd: '/tmp',
      messages,
      trigger: 'auto',
      contextWindow: 8_000,
      observation: new RunObservation(),
      hooksManager: {
        execute: async () => {
          await new Promise((r) => setTimeout(r, 40));
        },
      },
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(isCompactInFlight('lock-me')).toBe(true);
    const second = await compactSession({
      sessionId: 'lock-me',
      cwd: '/tmp',
      messages,
      trigger: 'manual',
      contextWindow: 8_000,
      observation: new RunObservation(),
    });
    expect(second.alreadyInProgress).toBe(true);
    expect(second.skipped).toBe(true);
    await first;
  });
});
