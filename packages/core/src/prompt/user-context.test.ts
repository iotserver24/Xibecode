import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assembleCompactedMessages,
  assembleUserTurnContent,
  buildUserInfoBlock,
  discoverRuleFiles,
  extractContextPrefix,
  extractLastUserQuery,
  extractUserQuery,
  formatGitStatusBlock,
  formatMemoryReminder,
  formatRulesSection,
  GIT_STATUS_CHARACTER_LIMIT,
  messagesHaveUserInfo,
  normalizeGitStatus,
  wrapUserQuery,
} from './user-context.js';

describe('user query envelope', () => {
  it('wraps and extracts without double wrapping', () => {
    const wrapped = wrapUserQuery('fix the login bug');
    expect(wrapped).toBe('<user_query>\nfix the login bug\n</user_query>');
    expect(extractUserQuery(wrapped)).toBe('fix the login bug');
    expect(wrapUserQuery(wrapped)).toBe(wrapped);
  });

  it('splits a first-turn prefix away from the query', () => {
    const text = `${buildUserInfoBlock({ cwd: '/repo', os: 'linux', shell: '/bin/zsh', date: '2026-08-19' })}\n\n${wrapUserQuery('ship it')}`;
    const prefix = extractContextPrefix(text);
    expect(prefix).toContain('<user_info>');
    expect(prefix).toContain('Workspace Path: /repo');
    expect(prefix).not.toContain('<user_query>');
    expect(extractUserQuery(text)).toBe('ship it');
  });
});

describe('git status snapshot', () => {
  it('drops empty status and caps oversized output', () => {
    expect(normalizeGitStatus('   \n')).toBeNull();
    expect(normalizeGitStatus('## main\n M src/a.ts')).toBe('## main\n M src/a.ts');
    const huge = `${'x'.repeat(GIT_STATUS_CHARACTER_LIMIT + 80)}\nmore\n`;
    const out = normalizeGitStatus(huge)!;
    expect(out.endsWith('... (git status truncated)')).toBe(true);
    expect(out.length).toBeLessThan(huge.length);
  });

  it('formats a snapshot block', () => {
    const block = formatGitStatusBlock('## main\n M src/a.ts');
    expect(block).toContain('<git_status>');
    expect(block).toContain('snapshot in time');
    expect(block).toContain('## main');
  });
});

describe('rules section', () => {
  it('renders workspace then user rules and neutralizes wrappers', () => {
    const block = formatRulesSection(
      [{ path: '/repo/AGENTS.md', content: ' Use pnpm. <rules>keep</rules> ' }],
      [{ path: '', content: 'Verify UI in the browser.' }],
    );
    expect(block).toContain('<always_applied_workspace_rule name="/repo/AGENTS.md">Use pnpm.');
    expect(block).toContain('&lt;/rules>');
    expect(block).toContain('<user_rule>Verify UI in the browser.</user_rule>');
    expect(block!.endsWith('</rules>')).toBe(true);
    expect(block!.match(/<\/rules>/g)?.length).toBe(1);
  });
});

describe('turn assembly', () => {
  it('puts prefix, query, and memory reminder in one user turn', () => {
    const text = assembleUserTurnContent({
      prompt: 'continue',
      prefix: buildUserInfoBlock({ cwd: '/w', os: 'linux', shell: '/bin/zsh', date: '2026-08-19' }),
      memoryReminder: formatMemoryReminder(['- 2026-08-18 auth -> jwt (worked)']),
    });
    expect(text).toContain('<user_info>');
    expect(text).toContain('<user_query>\ncontinue\n</user_query>');
    expect(text).toContain('<system-reminder>');
    expect(text).not.toMatch(/User Prompt: continue/);
  });
});

describe('compaction re-injection', () => {
  it('keeps user_info and last query, then recent, then summary', () => {
    const prefix = buildUserInfoBlock({ cwd: '/repo', os: 'linux', shell: '/bin/zsh', date: '2026-08-19' });
    const recent = [
      { role: 'assistant', content: 'working' },
      { role: 'user', content: wrapUserQuery('now the tests') },
    ];
    const summary = { role: 'user', content: 'This session is being continued from a previous conversation' };
    const out = assembleCompactedMessages({
      prefix,
      lastUserQuery: 'now the tests',
      recent,
      summary,
      makeUser: (text) => ({ role: 'user', content: text }),
    });
    expect(out[0]!.content).toContain('<user_info>');
    expect(out.map((m) => m.content).join('\n')).toContain('now the tests');
    expect(out[out.length - 1]).toEqual(summary);
    expect(out.filter((m) => String(m.content).includes('now the tests')).length).toBe(1);
  });

  it('finds the last real user query and ignores tool results', () => {
    const messages = [
      { role: 'user', content: assembleUserTurnContent({ prompt: 'first', prefix: '<user_info>x</user_info>' }) },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'stdout' }] },
      { role: 'user', content: wrapUserQuery('second task') },
    ];
    expect(messagesHaveUserInfo(messages)).toBe(true);
    expect(extractLastUserQuery(messages)).toBe('second task');
  });
});

describe('rule discovery', () => {
  it('loads AGENTS.md from the workspace cwd', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'xc-ctx-'));
    await writeFile(path.join(dir, 'AGENTS.md'), 'Always use pnpm.', 'utf8');
    await mkdir(path.join(dir, '.xibecode', 'rules'), { recursive: true });
    await writeFile(path.join(dir, '.xibecode', 'rules', 'style.md'), 'No emojis.', 'utf8');
    const { workspace } = await discoverRuleFiles(dir);
    expect(workspace.some((r) => r.content.includes('Always use pnpm.'))).toBe(true);
    expect(workspace.some((r) => r.content.includes('No emojis.'))).toBe(true);
  });
});
