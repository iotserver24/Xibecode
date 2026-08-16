import { describe, expect, it } from 'vitest';
import { recoverDsmlToolCalls, stripDsmlMarkup } from './dsml-tools.js';

const FW = '\uFF5C';

describe('recoverDsmlToolCalls', () => {
  it('parses fullwidth DeepSeek DSML and strips markup', () => {
    const text = [
      'Opening the site now.',
      '',
      `<${FW}DSML${FW}tool_calls>`,
      `<${FW}DSML${FW}invoke name="run_command">`,
      `<${FW}DSML${FW}parameter name="command" string="true">agent-browser open https://anisurge.lol</${FW}DSML${FW}parameter>`,
      `<${FW}DSML${FW}parameter name="timeout" string="false">15</${FW}DSML${FW}parameter>`,
      `</${FW}DSML${FW}invoke>`,
      `</${FW}DSML${FW}tool_calls>`,
    ].join('\n');

    const { text: cleaned, tools } = recoverDsmlToolCalls(text);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('run_command');
    expect(tools[0].input.command).toBe('agent-browser open https://anisurge.lol');
    expect(tools[0].input.timeout).toBe(15);
    expect(cleaned).toBe('Opening the site now.');
    expect(cleaned).not.toMatch(/DSML/i);
  });

  it('handles ASCII pipe variant', () => {
    const text =
      'hi\n<|DSML|tool_calls>\n<|DSML|invoke name="read_file">\n<|DSML|parameter name="path" string="true">a.ts</|DSML|parameter>\n</|DSML|invoke>\n</|DSML|tool_calls>';
    // ASCII uses single | without spaces — our regex accepts |
    const alt =
      'hi\n<|DSML|tool_calls>\n'.replace(/\|/g, '|') +
      '<|DSML|invoke name="read_file">\n'.replace(/\|/g, '|');
    // Use explicit ASCII form matching P = (?:FW|||)
    const ascii = [
      'hi',
      '<|DSML|tool_calls>',
      '<|DSML|invoke name="read_file">',
      '<|DSML|parameter name="path" string="true">a.ts</|DSML|parameter>',
      '</|DSML|invoke>',
      '</|DSML|tool_calls>',
    ].join('\n');
    // Our parser expects ｜ or | between markers like <|DSML| — that's < | DSML | with no spaces: <|DSML|
    // Pattern is: <\s*(?:FW|||)s*DSML\s*(?:FW|||)
    // For `<|DSML|invoke` : < then | then DSML then | then invoke — yes
    const { tools, text: cleaned } = recoverDsmlToolCalls(ascii);
    expect(tools.length).toBeGreaterThanOrEqual(1);
    expect(tools[0].name).toBe('read_file');
    expect(tools[0].input.path).toBe('a.ts');
    expect(cleaned).toContain('hi');
    expect(cleaned).not.toMatch(/DSML/i);
  });

  it('stripDsmlMarkup removes without requiring tools', () => {
    const text = `x<${FW}DSML${FW}tool_calls>junk</${FW}DSML${FW}tool_calls>y`;
    expect(stripDsmlMarkup(text)).toMatch(/^x\s*y$/);
  });

  it('recovers <bash>…</bash> as run_command so the agent loop continues', () => {
    const text = [
      "I'll create the folder:",
      '',
      '<bash>',
      'cd /home/r3ap3reditz/codes && mkdir -p dis-test',
      '</bash>',
    ].join('\n');
    const { text: cleaned, tools } = recoverDsmlToolCalls(text);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('run_command');
    expect(tools[0].input.command).toBe(
      'cd /home/r3ap3reditz/codes && mkdir -p dis-test',
    );
    expect(cleaned).toContain("I'll create the folder");
    expect(cleaned).not.toMatch(/<bash>/i);
  });
});
