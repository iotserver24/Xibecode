import { describe, expect, it } from 'vitest';
import {
  buildComputerFocusPayload,
  buildComputerPayload,
  classifyToolKind,
  extractCommand,
  parseAgentBrowserCommand,
  parseComputerShow,
  unwrapBrowserCli,
} from './computer-events.js';

describe('computer events', () => {
  it('unwraps pnpm exec / npx agent-browser', () => {
    expect(unwrapBrowserCli('agent-browser click @e2')).toMatch(/^agent-browser /);
    expect(unwrapBrowserCli('pnpm exec agent-browser open https://x.com')).toContain(
      'agent-browser open',
    );
    expect(unwrapBrowserCli('npx agent-browser snapshot -i')).toContain('agent-browser snapshot');
    expect(unwrapBrowserCli('ls -la')).toBeNull();
  });

  it('parses open / click / fill', () => {
    expect(parseAgentBrowserCommand('agent-browser open https://example.com/login')).toEqual({
      action: 'open',
      target: 'https://example.com/login',
      url: 'https://example.com/login',
      label: 'Open example.com/login',
    });
    expect(parseAgentBrowserCommand('agent-browser click @e2')).toMatchObject({
      action: 'click',
      target: '@e2',
      label: 'Click @e2',
    });
    expect(
      parseAgentBrowserCommand('agent-browser fill @e3 "hello world"'),
    ).toMatchObject({
      action: 'fill',
      target: '@e3',
      label: 'Type in @e3',
    });
    expect(parseAgentBrowserCommand('agent-browser screenshot shots/a.png')).toMatchObject({
      action: 'screenshot',
      label: 'Screenshot',
    });
  });

  it('classifies run_command as browser when it is agent-browser', () => {
    expect(classifyToolKind('run_command', { command: 'ls' })).toBe('shell');
    expect(
      classifyToolKind('run_command', { command: 'agent-browser click @e1' }),
    ).toBe('browser');
    expect(classifyToolKind('take_screenshot', {})).toBe('browser');
    expect(classifyToolKind('read_file', { path: 'a.ts' })).toBe('file');
  });

  it('builds terminal payload for shell and browser payload for clicks', () => {
    const shell = buildComputerPayload({
      name: 'run_command',
      state: 'start',
      input: { command: 'pnpm test' },
    });
    expect(shell.tab).toBe('terminal');
    expect(shell.kind).toBe('shell');
    expect(shell.command).toBe('pnpm test');
    expect(shell.label).toContain('pnpm test');

    const click = buildComputerPayload({
      name: 'run_command',
      state: 'start',
      input: { command: 'agent-browser click @e2' },
    });
    expect(click.tab).toBe('browser');
    expect(click.kind).toBe('browser');
    expect(click.action).toBe('click');
    expect(click.label).toBe('Click @e2');
    expect(click.focus).toBeFalsy();

    const open = buildComputerPayload({
      name: 'run_command',
      state: 'start',
      input: { command: 'agent-browser open https://example.com' },
    });
    expect(open.focus).toBe(true);
    expect(open.action).toBe('open');

    const done = buildComputerPayload({
      name: 'run_command',
      state: 'done',
      input: { command: 'ls' },
      result: { stdout: 'a.txt\n', exitCode: 0 },
      success: true,
    });
    expect(done.stdout).toContain('a.txt');
    expect(done.exitCode).toBe(0);
    expect(done.success).toBe(true);
  });

  it('extracts and caps command, redacts secrets', () => {
    const cmd = extractCommand({
      command: `echo sk-abcdefghijklmnopqrstuvwxyz012345 ${'x'.repeat(500)}`,
    });
    expect(cmd).toBeDefined();
    expect(cmd!.length).toBeLessThanOrEqual(401);
    expect(cmd).not.toMatch(/sk-abcdefghijklmnopqrstuvwxyz012345/);
  });

  it('parses Computer: browser / terminal from agent text', () => {
    expect(parseComputerShow('Computer: browser\nOpening the docs.')).toBe('browser');
    expect(parseComputerShow('Watch: terminal')).toBe('terminal');
    expect(parseComputerShow('Show: browser')).toBe('browser');
    expect(parseComputerShow('[computer:terminal] next')).toBe('terminal');
    expect(parseComputerShow('I will use the browser')).toBeNull();
    expect(buildComputerFocusPayload('browser')).toMatchObject({
      tab: 'browser',
      kind: 'focus',
      focus: true,
    });
  });
});
