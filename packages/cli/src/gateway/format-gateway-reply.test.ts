import { describe, expect, it } from 'vitest';
import {
  formatGatewayReply,
  formatToolProgress,
  formatToolResult,
} from './format.js';

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

describe('memory progress / saved lines', () => {
  it('shows saving… for curated_memory', () => {
    const line = formatToolProgress('curated_memory', {
      action: 'add',
      target: 'user',
      content: 'Prefers pnpm over npm',
    });
    expect(line).toMatch(/saving USER/i);
    expect(line).toMatch(/pnpm/);
  });

  it('shows 💾 Saved with usage on success', () => {
    const line = formatToolResult('curated_memory', true, 'Added to memory', {
      success: true,
      done: true,
      target: 'memory',
      usage: '12% — 200/2,200 chars',
      entry_count: 3,
      message: 'Added to memory',
      note: 'Write saved. This update is complete — do not repeat it.',
    });
    expect(line).toMatch(/💾 Saved/);
    expect(line).toMatch(/MEMORY/);
    expect(line).toMatch(/12%/);
  });

  it('shows staged approval clearly', () => {
    const line = formatToolResult('curated_memory', true, 'staged', {
      success: true,
      staged: true,
      id: 'abc',
    });
    expect(line).toMatch(/staged/i);
  });
});
