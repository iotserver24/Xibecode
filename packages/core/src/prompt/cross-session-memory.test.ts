import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  extractUserTopics,
  firstTurnMemoryReminder,
  formatMemoryInjection,
  formatSessionLog,
  searchCrossSessionMemory,
  shouldSaveSessionLog,
  writeSessionLog,
} from './cross-session-memory.js';
import { wrapUserQuery } from './user-context.js';

describe('session-end save gates', () => {
  it('skips trivial sessions and keeps substantive ones', () => {
    expect(shouldSaveSessionLog(['hi there'], 20)).toBe(false);
    expect(shouldSaveSessionLog(['one', 'two', 'three tasks here'], 80)).toBe(true);
    expect(shouldSaveSessionLog(['only one long enough topic about auth'], 200)).toBe(true);
  });

  it('pulls topics from wrapped user queries, not user_info', () => {
    const topics = extractUserTopics([
      { role: 'user', content: `<user_info>OS: linux</user_info>\n\n${wrapUserQuery('Implement login with JWT')}` },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: wrapUserQuery('Add refresh tokens next') },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'stdout' }] },
    ]);
    expect(topics[0]).toContain('Implement login with JWT');
    expect(topics[1]).toContain('Add refresh tokens next');
  });
});

describe('session log + first-turn injection', () => {
  it('writes a session log and injects it on a later search', async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), 'xc-mem-'));
    const cwd = path.join(baseDir, 'app');
    await mkdir(cwd, { recursive: true });
    const messages = [
      { role: 'user', content: wrapUserQuery('Wire the Vectra Computer pane screencast') },
      { role: 'assistant', content: 'working' },
      { role: 'user', content: wrapUserQuery('Keep the browser inside the rounded box') },
      { role: 'assistant', content: 'done' },
      { role: 'user', content: wrapUserQuery('Follow Grok Build context sending') },
    ];
    const file = await writeSessionLog({
      sessionId: 'sess-computer-pane-1',
      cwd,
      messages,
      baseDir,
      now: new Date('2026-08-19T12:00:00Z'),
    });
    expect(file).toBeTruthy();
    const body = formatSessionLog({
      sessionId: 'sess-computer-pane-1',
      cwd,
      identity: 'app',
      topics: extractUserTopics(messages),
      counts: { user: 3, assistant: 2, tool: 0 },
      now: new Date('2026-08-19T12:00:00Z'),
    });
    expect(body).toContain('## Topics');
    expect(body).toContain('Computer pane');

    const hits = await searchCrossSessionMemory({
      cwd,
      query: 'Computer pane screencast browser',
      baseDir,
      minScore: 2,
      includeSessionIndex: false,
    });
    expect(hits.some((h) => h.snippet.toLowerCase().includes('computer'))).toBe(true);
    const reminder = await firstTurnMemoryReminder({
      cwd,
      query: 'continue the Computer pane work',
      baseDir,
      includeSessionIndex: false,
    });
    expect(reminder).toContain('Memory from earlier sessions');
    expect(reminder).toMatch(/Computer pane|screencast/i);
  });

  it('marks old session hits as stale', () => {
    const text = formatMemoryInjection([
      {
        source: 'session',
        title: '2026-01-01-old.md',
        snippet: 'legacy auth rewrite',
        score: 8,
        updated: '2026-01-01',
        stale: true,
      },
    ]);
    expect(text).toContain('verify — older than 14 days');
  });
});
