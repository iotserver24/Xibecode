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
  classifyValidationCommand,
  validationResultFromObservation,
  isVerifiedPass,
  shouldStaleValidation,
  validationCoversPath,
  canonicalizeCommand,
  commandMatchKey,
  splitCommandChain,
  summarizeCommandOutput,
  restoreObservationFromHandoff,
  applyPersistedFreshness,
  OUTPUT_SUMMARY_MAX,
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
    expect(handoff.fileEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'src/login.ts',
          tool: 'write_file',
          state: 'observed',
        }),
      ]),
    );
    expect(handoff.fileEvidence?.[0]?.evidenceId).toMatch(/^file_/);
    expect(handoff.validation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: 'pnpm test',
          result: 'passed',
          exitCode: 0,
          kind: 'test',
          scope: 'full',
        }),
        expect.objectContaining({
          command: 'pnpm lint',
          result: 'failed',
          exitCode: 1,
          kind: 'lint',
          scope: 'full',
        }),
      ]),
    );
    expect(handoff.validation.every((v) => Boolean(v.evidenceId))).toBe(true);
    expect(handoff.failedApproaches.some((f) => f.includes('run_command'))).toBe(true);
    expect(handoff.changedFiles).not.toContain('src/secret.ts');
    expect(isVerifiedPass(handoff.validation.find((v) => v.command === 'pnpm test')!)).toBe(true);
    expect(isVerifiedPass(handoff.validation.find((v) => v.command === 'pnpm lint')!)).toBe(false);
  });

  it('marks missing exit codes as unknown instead of passed', () => {
    const obs = new RunObservation();
    observeToolEvent(
      obs,
      'run_command',
      { command: 'pnpm test' },
      { success: true, message: 'ok' },
      true,
      'tool_missing_exit',
    );
    const handoff = buildRunHandoff({
      sessionId: 's',
      cwd: '/p',
      status: 'completed',
      trigger: 'complete',
      observation: obs,
    });
    expect(handoff.validation).toEqual([
      expect.objectContaining({
        command: 'pnpm test',
        result: 'unknown',
        sourceEventId: 'tool_missing_exit',
      }),
    ]);
    expect(handoff.validation[0]?.exitCode).toBeUndefined();
    expect(isVerifiedPass(handoff.validation[0]!)).toBe(false);
    const md = formatRunHandoffMarkdown(handoff);
    expect(md).toMatch(/result: unknown/);
    expect(md).toMatch(/do not treat as passed/);
    expect(md).not.toMatch(/^\s*result: passed\s*$/m);
  });

  it('keeps exit 0, non-zero, timeout, and not_run distinct', () => {
    expect(validationResultFromObservation(true, 0, { exitCode: 0 })).toBe('passed');
    expect(validationResultFromObservation(true, 1, { exitCode: 1 })).toBe('failed');
    expect(validationResultFromObservation(true, undefined, { success: true })).toBe('unknown');
    expect(validationResultFromObservation(false, undefined, { success: false })).toBe('failed');
    expect(
      validationResultFromObservation(false, undefined, { timedOut: true, message: 'timed out' }),
    ).toBe('timeout');

    const obs = new RunObservation();
    observeToolEvent(obs, 'run_command', { command: 'pnpm test' }, { exitCode: 0 }, true);
    observeToolEvent(obs, 'run_command', { command: 'pnpm lint' }, { exitCode: 2 }, false);
    observeToolEvent(
      obs,
      'run_command',
      { command: 'pnpm build' },
      { timedOut: true, message: 'command timed out' },
      false,
    );
    obs.recordValidation('pnpm exec tsc --noEmit', 'not_run');
    const handoff = buildRunHandoff({
      sessionId: 's',
      cwd: '/p',
      status: 'failed',
      trigger: 'fail',
      observation: obs,
    });
    const byCmd = Object.fromEntries(handoff.validation.map((v) => [v.command, v.result]));
    expect(byCmd['pnpm test']).toBe('passed');
    expect(byCmd['pnpm lint']).toBe('failed');
    expect(byCmd['pnpm build']).toBe('timeout');
    expect(byCmd['pnpm exec tsc --noEmit']).toBe('not_run');
  });

  it('does not record a model-only file or test claim as verified', () => {
    const obs = new RunObservation();
    obs.setTask('claim tests passed and src/secret.ts changed');
    obs.recordDecision('I updated src/secret.ts and pnpm test is green');
    const handoff = buildRunHandoff({
      sessionId: 's',
      cwd: '/p',
      status: 'completed',
      trigger: 'complete',
      observation: obs,
    });
    expect(handoff.changedFiles).toEqual([]);
    expect(handoff.fileEvidence).toEqual([]);
    expect(handoff.validation).toEqual([]);
    expect(formatRunHandoffMarkdown(handoff)).toContain('- (none observed)');
  });

  it('records failed and pathless mutations without inventing changed files', () => {
    const obs = new RunObservation();
    observeToolEvent(
      obs,
      'verified_edit',
      { path: 'src/login.ts', old_content: 'a', new_content: 'b' },
      { success: false, message: 'mismatch' },
      false,
      'edit_fail',
    );
    observeToolEvent(obs, 'write_file', {}, { success: true }, true, 'write_nopath');
    const handoff = buildRunHandoff({
      sessionId: 's',
      cwd: '/p',
      status: 'failed',
      trigger: 'fail',
      observation: obs,
    });
    expect(handoff.changedFiles).toEqual([]);
    expect(handoff.fileEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'src/login.ts',
          state: 'failed',
          tool: 'verified_edit',
          sourceEventId: 'edit_fail',
        }),
        expect.objectContaining({
          path: '(path not observed)',
          state: 'not_observed',
          tool: 'write_file',
          sourceEventId: 'write_nopath',
        }),
      ]),
    );
  });

  it('classifies targeted versus full validation commands', () => {
    expect(classifyValidationCommand('pnpm test')).toEqual({ kind: 'test', scope: 'full' });
    expect(classifyValidationCommand('pnpm exec vitest run src/login.test.ts')).toEqual({
      kind: 'test',
      scope: 'targeted',
    });
    expect(classifyValidationCommand('pnpm lint')).toEqual({ kind: 'lint', scope: 'full' });
    expect(classifyValidationCommand('echo hello')).toEqual({ kind: 'command', scope: 'unknown' });
    const obs = new RunObservation();
    observeToolEvent(
      obs,
      'run_tests',
      { command: 'pnpm exec vitest run src/login.test.ts' },
      { exitCode: 0 },
      true,
    );
    const handoff = buildRunHandoff({
      sessionId: 's',
      cwd: '/p',
      status: 'completed',
      trigger: 'complete',
      observation: obs,
    });
    expect(handoff.validation[0]).toMatchObject({
      result: 'passed',
      kind: 'test',
      scope: 'targeted',
    });
    expect(formatRunHandoffMarkdown(handoff)).toMatch(/targeted check/);
  });

  it('marks full validation stale after a later observed edit', () => {
    const obs = new RunObservation();
    observeToolEvent(obs, 'run_tests', { command: 'pnpm test' }, { exitCode: 0 }, true, 'evt_test');
    expect(isVerifiedPass(obs.validations[0]!)).toBe(true);
    observeToolEvent(
      obs,
      'verified_edit',
      { path: 'src/login.ts', old_content: 'a', new_content: 'b' },
      { success: true },
      true,
      'evt_edit',
    );
    const handoff = buildRunHandoff({
      sessionId: 's',
      cwd: '/p',
      status: 'completed',
      trigger: 'complete',
      observation: obs,
    });
    expect(handoff.validation[0]).toMatchObject({
      command: 'pnpm test',
      result: 'passed',
      stale: true,
      staleAfterEdit: 'src/login.ts',
    });
    expect(isVerifiedPass(handoff.validation[0]!)).toBe(false);
    expect(handoff.remainingWork.some((item) => /stale/i.test(item))).toBe(true);
    const md = formatRunHandoffMarkdown(handoff);
    expect(md).toMatch(/stale: yes/);
    expect(md).toMatch(/re-run before claiming this passed/);
  });

  it('stales only targeted checks that cover the edited file', () => {
    const obs = new RunObservation();
    observeToolEvent(
      obs,
      'run_tests',
      { command: 'pnpm exec vitest run src/login.test.ts' },
      { exitCode: 0 },
      true,
    );
    observeToolEvent(
      obs,
      'run_tests',
      { command: 'pnpm exec vitest run src/other.test.ts' },
      { exitCode: 0 },
      true,
    );
    observeToolEvent(
      obs,
      'edit_file',
      { path: 'src/login.ts', search: 'a', replace: 'b' },
      { success: true },
      true,
    );
    const byCmd = Object.fromEntries(obs.validations.map((v) => [v.command, v]));
    expect(byCmd['pnpm exec vitest run src/login.test.ts']?.stale).toBe(true);
    expect(byCmd['pnpm exec vitest run src/other.test.ts']?.stale).toBeFalsy();
    expect(validationCoversPath('pnpm exec vitest run src/login.test.ts', 'src/login.ts')).toBe(
      true,
    );
    expect(
      shouldStaleValidation(
        { command: 'pnpm exec vitest run src/other.test.ts', result: 'passed', scope: 'targeted' },
        'src/login.ts',
      ),
    ).toBe(false);
  });

  it('does not stale on a failed edit and clears stale after a re-run', () => {
    const obs = new RunObservation();
    observeToolEvent(obs, 'run_command', { command: 'pnpm lint' }, { exitCode: 0 }, true);
    observeToolEvent(
      obs,
      'verified_edit',
      { path: 'src/login.ts' },
      { success: false, message: 'mismatch' },
      false,
    );
    expect(obs.validations[0]?.stale).toBeFalsy();
    observeToolEvent(
      obs,
      'write_file',
      { path: 'src/login.ts' },
      { success: true },
      true,
    );
    expect(obs.validations[0]?.stale).toBe(true);
    observeToolEvent(obs, 'run_command', { command: 'pnpm lint' }, { exitCode: 0 }, true);
    expect(obs.validations[0]?.stale).toBe(false);
    expect(isVerifiedPass(obs.validations[0]!)).toBe(true);
  });

  it('stales every current check when an observed edit has no path', () => {
    const obs = new RunObservation();
    observeToolEvent(obs, 'run_command', { command: 'pnpm test' }, { exitCode: 0 }, true);
    obs.recordValidation('pnpm exec tsc --noEmit', 'not_run');
    observeToolEvent(obs, 'write_file', {}, { success: true }, true);
    const test = obs.validations.find((v) => v.command === 'pnpm test');
    const tsc = obs.validations.find((v) => v.command === 'pnpm exec tsc --noEmit');
    expect(test?.stale).toBe(true);
    expect(test?.staleReason).toMatch(/path not observed/);
    expect(tsc?.stale).toBeFalsy();
  });

  it('restores stale flags without re-staling when skipStale is set', () => {
    const obs = new RunObservation();
    obs.recordFileEvidence({
      path: 'src/login.ts',
      tool: 'write_file',
      state: 'observed',
      skipStale: true,
    });
    obs.recordValidation('pnpm test', 'passed', 0, 'val_old', {
      kind: 'test',
      scope: 'full',
      stale: true,
      staleAfterEdit: 'src/login.ts',
      staleReason: 'later edit of src/login.ts',
    });
    expect(obs.validations[0]).toMatchObject({
      stale: true,
      staleAfterEdit: 'src/login.ts',
    });
  });

  it('canonicalizes equivalent package-manager commands onto one evidence row', () => {
    expect(canonicalizeCommand('pnpm run test')).toBe('pnpm test');
    expect(canonicalizeCommand('FOO=1 npm run test')).toBe('npm test');
    expect(canonicalizeCommand('pnpm exec vitest run src/login.test.ts')).toBe(
      'vitest src/login.test.ts',
    );
    expect(commandMatchKey('pnpm test')).toBe(commandMatchKey('npm run test'));
    expect(splitCommandChain('pnpm test && pnpm lint').map((p) => p.text)).toEqual([
      'pnpm test',
      'pnpm lint',
    ]);
    expect(canonicalizeCommand('pnpm run test && yarn run lint')).toBe('pnpm test && yarn lint');

    const obs = new RunObservation();
    observeToolEvent(obs, 'run_command', { command: 'pnpm run test' }, { exitCode: 0 }, true);
    observeToolEvent(
      obs,
      'run_command',
      { command: 'npm test' },
      { exitCode: 1, stdout: 'failed again' },
      false,
    );
    expect(obs.validations).toHaveLength(1);
    expect(obs.validations[0]).toMatchObject({
      command: 'npm test',
      canonicalCommand: 'npm test',
      result: 'failed',
      exitCode: 1,
    });
  });

  it('keeps chained commands as one result and stores a bounded redacted summary', () => {
    const obs = new RunObservation();
    const longOut = `ok ${'x'.repeat(OUTPUT_SUMMARY_MAX)} TOKEN=sk-abcdefghijklmnop`;
    observeToolEvent(
      obs,
      'run_command',
      { command: 'pnpm test && pnpm lint' },
      { exitCode: 0, stdout: longOut },
      true,
    );
    const v = obs.validations[0]!;
    expect(v.command).toBe('pnpm test && pnpm lint');
    expect(v.canonicalCommand).toBe('pnpm test && pnpm lint');
    expect(v.result).toBe('passed');
    expect(v.kind).toBe('command');
    expect(v.scope).toBe('full');
    expect(v.outputSummary).toBeDefined();
    expect(v.outputSummary!.length).toBeLessThanOrEqual(OUTPUT_SUMMARY_MAX);
    expect(v.outputSummary).not.toMatch(/sk-abcdefghijklmnop/);
    expect(v.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(summarizeCommandOutput({ stdout: 'OPENAI_API_KEY=sk-abcdefghijklmnop' })).toContain(
      '[redacted]',
    );
  });

  it('restores a persisted ledger and stales it after a later edit', () => {
    const first = new RunObservation();
    observeToolEvent(
      first,
      'run_tests',
      { command: 'pnpm test' },
      { exitCode: 0, stdout: 'all good' },
      true,
    );
    const persisted = buildRunHandoff({
      sessionId: 'sess-h6',
      cwd: '/proj',
      status: 'completed',
      trigger: 'complete',
      observation: first,
      task: 'fix login',
    });
    expect(persisted.validation[0]?.canonicalCommand).toBe('pnpm test');
    expect(persisted.validation[0]?.outputSummary).toBe('all good');
    expect(persisted.validation[0]?.observedAt).toBeTruthy();

    const resumed = new RunObservation();
    restoreObservationFromHandoff(resumed, persisted);
    expect(resumed.validations[0]).toMatchObject({
      command: 'pnpm test',
      result: 'passed',
      outputSummary: 'all good',
    });
    expect(resumed.validations[0]?.stale).toBeFalsy();
    observeToolEvent(
      resumed,
      'write_file',
      { path: 'src/login.ts' },
      { success: true },
      true,
    );
    const after = buildRunHandoff({
      sessionId: 'sess-h6',
      cwd: '/proj',
      status: 'completed',
      trigger: 'complete',
      observation: resumed,
    });
    expect(after.validation[0]?.stale).toBe(true);
    expect(after.validation[0]?.staleAfterEdit).toBe('src/login.ts');
    expect(isVerifiedPass(after.validation[0]!)).toBe(false);
  });

  it('marks restored validations stale from newer persisted file timestamps', () => {
    const obs = new RunObservation();
    restoreObservationFromHandoff(obs, {
      sessionId: 's',
      cwd: '/p',
      task: 'resume',
      status: 'completed',
      changedFiles: ['src/login.ts'],
      fileEvidence: [
        {
          path: 'src/login.ts',
          evidenceId: 'file_1',
          tool: 'write_file',
          state: 'observed',
          observedAt: '2026-08-19T12:01:00.000Z',
        },
      ],
      validation: [
        {
          command: 'pnpm test',
          result: 'passed',
          exitCode: 0,
          evidenceId: 'val_1',
          kind: 'test',
          scope: 'full',
          canonicalCommand: 'pnpm test',
          observedAt: '2026-08-19T12:00:00.000Z',
        },
      ],
      decisions: [],
      failedApproaches: [],
      remainingWork: [],
      createdAt: '2026-08-19T12:01:00.000Z',
      trigger: 'complete',
      source: 'observed',
    });
    applyPersistedFreshness(obs);
    expect(obs.validations[0]?.stale).toBe(true);
    expect(obs.validations[0]?.staleAfterEdit).toBe('src/login.ts');
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

describe('handoff persistence', () => {
  it('round-trips unknown validation and file evidence through a transcript', async () => {
    const fs = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');
    const { writeHandoffEntry } = await import('./run-handoff.js');
    const { loadTranscriptFile } = await import('./transcript-reader.js');
    const { getTranscriptWriter } = await import('./transcript-writer.js');

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xibecode-handoff-ev-'));
    const transcriptPath = path.join(dir, 'session.jsonl');
    const obs = new RunObservation();
    observeToolEvent(obs, 'write_file', { path: 'src/alpha.ts' }, { success: true }, true, 'evt_write');
    observeToolEvent(
      obs,
      'run_command',
      { command: 'node src/fail.mjs' },
      { exitCode: 1, message: 'intentional fail' },
      false,
      'evt_fail',
    );
    observeToolEvent(
      obs,
      'run_tests',
      { command: 'node --test src/alpha.test.mjs' },
      { success: true, message: 'ok' },
      true,
      'evt_unknown',
    );
    const written = buildRunHandoff({
      sessionId: 'sess-ev',
      cwd: dir,
      status: 'failed',
      trigger: 'fail',
      observation: obs,
      task: 'edit alpha and verify',
    });
    await writeHandoffEntry(transcriptPath, written);
    await getTranscriptWriter().flush();
    const loaded = latestHandoffFromEntries(
      (await loadTranscriptFile(transcriptPath)).entries,
    );
    expect(loaded?.changedFiles).toEqual(['src/alpha.ts']);
    expect(loaded?.fileEvidence?.[0]).toMatchObject({
      path: 'src/alpha.ts',
      state: 'observed',
      sourceEventId: 'evt_write',
    });
    expect(loaded?.validation.find((v) => v.command === 'node src/fail.mjs')?.result).toBe('failed');
    expect(loaded?.validation.find((v) => v.command === 'node --test src/alpha.test.mjs')?.result).toBe(
      'unknown',
    );
    expect(loaded?.validation[0]?.canonicalCommand).toBeTruthy();
    expect(loaded?.validation[0]?.observedAt).toBeTruthy();
    const resumed = new RunObservation();
    restoreObservationFromHandoff(resumed, loaded!);
    observeToolEvent(resumed, 'write_file', { path: 'src/alpha.ts' }, { success: true }, true);
    expect(resumed.validations.some((v) => v.stale)).toBe(true);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
