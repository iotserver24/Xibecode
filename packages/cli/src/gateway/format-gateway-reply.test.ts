import { describe, expect, it } from 'vitest';
import { formatGatewayReply } from './format.js';

describe('formatGatewayReply', () => {
  it('strips TASK_COMPLETE and appends Done footer', () => {
    const out = formatGatewayReply(
      'Homepage ready at http://localhost:3000\n\n[[TASK_COMPLETE | summary=Built homepage | evidence=curl 200]]',
    );
    expect(out).not.toContain('TASK_COMPLETE');
    expect(out).toContain('Homepage ready');
    expect(out).toContain('✅ **Done** — Built homepage');
    expect(out).toContain('Evidence: curl 200');
  });

  it('footer-only when body empty after strip', () => {
    const out = formatGatewayReply(
      '[[TASK_COMPLETE | summary=All green | evidence=tests]]',
    );
    expect(out).toBe('✅ **Done** — All green\n_Evidence: tests_');
  });

  it('leaves plain text alone', () => {
    expect(formatGatewayReply('just a reply')).toBe('just a reply');
  });

  it('skips evidence=none', () => {
    const out = formatGatewayReply(
      'ok\n[[TASK_COMPLETE | summary=Fixed bug | evidence=none]]',
    );
    expect(out).toContain('✅ **Done** — Fixed bug');
    expect(out).not.toContain('Evidence');
  });

  it('strips REQUEST_MODE tags', () => {
    const out = formatGatewayReply('hi\n[[REQUEST_MODE:plan]]');
    expect(out).toBe('hi');
  });
});
