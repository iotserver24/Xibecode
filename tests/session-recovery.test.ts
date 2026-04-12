import { describe, expect, it } from 'vitest';
import { recoverConversation } from '../src/core/conversation-recovery.js';

describe('conversation recovery', () => {
  it('drops empty assistant messages and appends continuation on interruption', () => {
    const session: any = {
      id: 'session-test',
      title: 'Test',
      model: 'claude',
      cwd: '/tmp',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: '   ' },
      ],
    };

    const recovered = recoverConversation(session);
    expect(recovered.wasRecovered).toBe(true);
    expect(recovered.session.messages.length).toBe(2);
    expect((recovered.session.messages[1] as any).content).toContain('Continue from where you left off');
  });
});
