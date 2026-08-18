import { describe, expect, it } from 'vitest';
import {
  RunObservation,
  buildRunHandoff,
  formatRunHandoffMarkdown,
  redactHandoff,
  redactSensitiveText,
  observeToolEvent,
  latestHandoffFromEntries,
  messageContainsHandoff,
  compactUserStatus,
  RUN_HANDOFF_HEADING,
} from './run-handoff.js';
import { generateUuid, type Entry } from './transcript-types.js';

describe('redactSensitiveText', () => {
  it('redacts api keys and env assignments', () => {
    expect(redactSensitiveText('token sk-abcDEF12345678 more')).toContain('[redacted]');
    expect(redactSensitiveText('OPENAI_API_KEY=sk-secret-value')).toContain('OPENAI_API_KEY=[redacted]');
    expect(redactSensitiveText('Bearer abcdefghijklmnop')).toContain('[redacted]');
  });
});

describe('RunObservation + buildRunHandoff', () => {
  it('records observed files and test results without inventing data', () => {
    const obs = new RunObservation();
    obs.setTask('fix login');
    observeToolEvent(
      obs,
      'write_file',
      { path: 'src/login.ts' },
      { success: true },
      true,
    );
    observeToolEvent(
      obs,
      'run_tests',
      { command: 'pnpm test' },
      { exitCode: 0, success: true },
      true,
    );
    observeToolEvent(
      obs,
      'run_command',
      { command: 'pnpm lint' },
      { exitCode: 1, message: 'lint failed' },
      false,
    );

    const handoff = buildRunHandoff({
      sessionId: 'sess-1',
      cwd: '/proj',
      status: 'failed',
      trigger: 'fail',
      observation: obs,
    });

    expect(handoff.source).toBe('observed');
    expect(handoff.changedFiles).toEqual(['src/login.ts']);
    expect(handoff.validation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: 'pnpm test', result: 'passed', exitCode: 0 }),
        expect.objectContaining({ command: 'pnpm lint', result: 'failed', exitCode: 1 }),
      ]),
    );
    expect(handoff.failedApproaches.some((f) => f.includes('run_command'))).toBe(true);
    expect(handoff.changedFiles).not.toContain('src/secret.ts');
  });

  it('redacts secrets in handoff markdown', () => {
    const obs = new RunObservation();
    obs.setTask('rotate OPENAI_API_KEY=sk-abcdefghijklmnop');
    obs.recordFailure('run_command', 'export TOKEN=sk-abcdefghijklmnop');
    const handoff = buildRunHandoff({
      sessionId: 's',
      cwd: '/p',
      status: 'failed',
      trigger: 'fail',
      observation: obs,
    });
    const redacted = redactHandoff(handoff);
    const md = formatRunHandoffMarkdown(redacted);
    expect(md).toContain(RUN_HANDOFF_HEADING);
    expect(md).not.toMatch(/sk-abcdefghijklmnop/);
    expect(md).toContain('[redacted]');
  });

  it('adds continue remaining work on interrupt', () => {
    const obs = new RunObservation();
    const handoff = buildRunHandoff({
      sessionId: 's',
      cwd: '/p',
      status: 'interrupted',
      trigger: 'interrupt',
      observation: obs,
      task: 'implement preview browser',
    });
    expect(handoff.remainingWork[0]).toMatch(/Continue: implement preview browser/);
  });
});

describe('handoff helpers', () => {
  it('detects handoff messages and latest entry', () => {
    expect(
      messageContainsHandoff({
        role: 'user',
        content: `${RUN_HANDOFF_HEADING}\n## Task\nfoo`,
      }),
    ).toBe(true);
    const entries: Entry[] = [
      {
        type: 'run-handoff',
        uuid: generateUuid(),
        parentUuid: null,
        timestamp: '2026-01-01T00:00:00.000Z',
        sessionId: 's',
        handoff: {
          sessionId: 's',
          cwd: '/p',
          task: 'old',
          status: 'completed',
          changedFiles: [],
          validation: [],
          decisions: [],
          failedApproaches: [],
          remainingWork: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          trigger: 'complete',
          source: 'observed',
        },
      },
      {
        type: 'run-handoff',
        uuid: generateUuid(),
        parentUuid: null,
        timestamp: '2026-01-02T00:00:00.000Z',
        sessionId: 's',
        handoff: {
          sessionId: 's',
          cwd: '/p',
          task: 'new task',
          status: 'compacted',
          changedFiles: ['a.ts'],
          validation: [],
          decisions: [],
          failedApproaches: [],
          remainingWork: [],
          createdAt: '2026-01-02T00:00:00.000Z',
          trigger: 'compact',
          source: 'observed',
        },
      },
    ];
    expect(latestHandoffFromEntries(entries)?.task).toBe('new task');
    const status = compactUserStatus(latestHandoffFromEntries(entries)!, 4);
    expect(status).toMatch(/Compacted context/);
    expect(status).toMatch(/1 changed file/);
  });
});
