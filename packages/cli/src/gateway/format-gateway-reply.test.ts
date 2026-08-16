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

  it('strips leaked DSML tool_calls markup (Discord UX)', () => {
    const leaked = [
      "I'll open the site and take a screenshot.",
      '',
      '< | DSML | tool_calls>',
      '< | DSML | invoke name="run_command">',
      '< | DSML | parameter name="command" string="true">agent-browser open "https://anisurge.lol/"</ | DSML | parameter>',
      '</ | DSML | invoke>',
      '</ | DSML | tool_calls>',
      '',
      'Opening now…',
    ].join('\n');
    const out = formatGatewayReply(leaked);
    expect(out).not.toMatch(/DSML/i);
    expect(out).not.toMatch(/tool_calls/i);
    expect(out).not.toMatch(/invoke name/i);
    expect(out).toContain("I'll open the site");
    expect(out).toContain('Opening now');
  });

  it('strips DeepSeek fullwidth ｜ DSML (real session leak)', () => {
    const FW = '\uFF5C';
    const leaked = [
      "I'll open anisurge.lol in the browser.",
      '',
      `<${FW}DSML${FW}tool_calls>`,
      `<${FW}DSML${FW}invoke name="run_command">`,
      `<${FW}DSML${FW}parameter name="command" string="true">agent-browser open "https://anisurge.lol"</${FW}DSML${FW}parameter>`,
      `</${FW}DSML${FW}invoke>`,
      `</${FW}DSML${FW}tool_calls>`,
    ].join('\n');
    const out = formatGatewayReply(leaked);
    expect(out).not.toMatch(/DSML/i);
    expect(out).not.toContain(FW);
    expect(out).toContain("I'll open anisurge.lol");
  });

  it('strips compact <|DSML|…|> style tags', () => {
    const out = formatGatewayReply(
      'Done.\n<|DSML|tool_calls><|DSML|invoke name="x">y</|DSML|invoke></|DSML|tool_calls>\nOK',
    );
    expect(out).not.toMatch(/DSML/i);
    expect(out).toContain('Done.');
    expect(out).toContain('OK');
  });

  it('strips <bash> tags from chat (not shown as raw markup)', () => {
    const out = formatGatewayReply(
      "I'll create the folder:\n\n<bash>\nmkdir -p dis-test\n</bash>",
    );
    expect(out).not.toMatch(/<bash>/i);
    expect(out).toContain("I'll create the folder");
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
