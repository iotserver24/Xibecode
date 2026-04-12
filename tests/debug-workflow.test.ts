import { describe, expect, it } from 'vitest';
import { buildDebugSnapshot } from '../src/core/debug-workflow.js';

describe('buildDebugSnapshot', () => {
  it('creates bounded debug snapshot from session', () => {
    const snapshot = buildDebugSnapshot({
      id: 'session-1',
      title: 'Debug',
      model: 'claude',
      cwd: '/tmp',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      messages: [
        { role: 'user', content: 'Investigate failure' },
        { role: 'assistant', content: 'Looking into it' },
      ] as any,
    } as any, ['note-a']);

    expect(snapshot.sessionId).toBe('session-1');
    expect(snapshot.messageCount).toBe(2);
    expect(snapshot.notes).toContain('note-a');
  });
});
