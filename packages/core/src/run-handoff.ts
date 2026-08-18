/**
 * Structured run handoffs — continuity summaries written from observed tool
 * events, not free-form model recollection.
 *
 * Temporary execution state lives here. Durable facts stay in MEMORY.md / USER.md.
 */

import type { UUID } from 'crypto';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { generateUuid, type Entry, type RunHandoffTranscriptEntry } from './transcript-types.js';
import { getTranscriptWriter } from './transcript-writer.js';

export type RunHandoffStatus =
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'blocked'
  | 'compacted';

export type RunHandoffTrigger =
  | 'complete'
  | 'fail'
  | 'interrupt'
  | 'compact'
  | 'shutdown';

export type ValidationResult = 'passed' | 'failed' | 'not_run';

export interface RunValidation {
  command: string;
  result: ValidationResult;
  exitCode?: number;
  evidenceId?: string;
}

export interface RunHandoff {
  sessionId: string;
  cwd: string;
  task: string;
  status: RunHandoffStatus;
  changedFiles: string[];
  validation: RunValidation[];
  decisions: string[];
  failedApproaches: string[];
  remainingWork: string[];
  createdAt: string;
  trigger: RunHandoffTrigger;
  /** Always observed — the model may summarize wording, never invent files/tests. */
  source: 'observed';
}

const SECRET_RE =
  /(?<![A-Za-z0-9_])(?:sk-[A-Za-z0-9_-]{8,}|pk_[A-Za-z0-9_-]{8,}|sk_[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|Bearer\s+[A-Za-z0-9._\-+=/]{12,})/gi;
const ENV_ASSIGN_RE =
  /\b([A-Z][A-Z0-9_]{2,}(?:KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL|AUTH)[A-Z0-9_]*)\s*=\s*(['"]?)[^\s'"]+\2/g;

export function redactSensitiveText(text: string): string {
  if (!text) return text;
  return text
    .replace(SECRET_RE, '[redacted]')
    .replace(ENV_ASSIGN_RE, '$1=[redacted]');
}

function redactList(items: string[]): string[] {
  return items.map((s) => redactSensitiveText(s)).filter(Boolean);
}

export function redactHandoff(handoff: RunHandoff): RunHandoff {
  return {
    ...handoff,
    task: redactSensitiveText(handoff.task),
    changedFiles: handoff.changedFiles.map((p) => redactSensitiveText(p)),
    validation: handoff.validation.map((v) => ({
      ...v,
      command: redactSensitiveText(v.command),
    })),
    decisions: redactList(handoff.decisions),
    failedApproaches: redactList(handoff.failedApproaches),
    remainingWork: redactList(handoff.remainingWork),
  };
}

export class RunObservation {
  task = '';
  readonly changedFiles = new Set<string>();
  readonly validations: RunValidation[] = [];
  readonly decisions: string[] = [];
  readonly failedApproaches: string[] = [];
  readonly remainingWork: string[] = [];

  setTask(task: string): void {
    const t = task.trim();
    if (t) this.task = t.slice(0, 500);
  }

  recordFileChange(filePath: string): void {
    const p = filePath.trim();
    if (p) this.changedFiles.add(p);
  }

  recordValidation(
    command: string,
    result: ValidationResult,
    exitCode?: number,
    evidenceId?: string,
  ): void {
    const cmd = redactSensitiveText(command.trim()).slice(0, 400);
    if (!cmd) return;
    const existing = this.validations.find((v) => v.command === cmd);
    if (existing) {
      existing.result = result;
      if (exitCode !== undefined) existing.exitCode = exitCode;
      if (evidenceId) existing.evidenceId = evidenceId;
      return;
    }
    this.validations.push({
      command: cmd,
      result,
      exitCode,
      evidenceId,
    });
  }

  recordDecision(text: string): void {
    const s = redactSensitiveText(text.trim()).slice(0, 300);
    if (!s) return;
    if (!this.decisions.includes(s)) this.decisions.push(s);
  }

  recordFailure(tool: string, message?: string): void {
    const msg = redactSensitiveText((message || '').trim()).slice(0, 240);
    const line = msg ? `${tool}: ${msg}` : tool;
    if (!this.failedApproaches.includes(line)) {
      this.failedApproaches.push(line);
    }
  }

  recordRemaining(text: string): void {
    const s = redactSensitiveText(text.trim()).slice(0, 300);
    if (!s) return;
    if (!this.remainingWork.includes(s)) this.remainingWork.push(s);
  }

  snapshot(): {
    changedFiles: string[];
    validation: RunValidation[];
    decisions: string[];
    failedApproaches: string[];
    remainingWork: string[];
    task: string;
  } {
    return {
      task: this.task,
      changedFiles: Array.from(this.changedFiles),
      validation: this.validations.slice(-20),
      decisions: this.decisions.slice(-12),
      failedApproaches: this.failedApproaches.slice(-12),
      remainingWork: this.remainingWork.slice(-12),
    };
  }
}

const MUTATING_TOOLS = new Set([
  'write_file',
  'edit_file',
  'edit_lines',
  'verified_edit',
  'insert_at_line',
  'delete_file',
  'move_file',
]);

const COMMAND_TOOLS = new Set(['run_command', 'run_tests', 'shell_command']);

function commandFromInput(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const rec = input as Record<string, unknown>;
  for (const key of ['command', 'cmd', 'script', 'test_command']) {
    if (typeof rec[key] === 'string' && rec[key].trim()) return rec[key].trim();
  }
  return '';
}

function pathFromInput(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const rec = input as Record<string, unknown>;
  if (typeof rec.path === 'string') return rec.path;
  if (typeof rec.dest === 'string') return rec.dest;
  if (typeof rec.to === 'string') return rec.to;
  return '';
}

function exitCodeFromResult(result: unknown): number | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const rec = result as Record<string, unknown>;
  if (typeof rec.exitCode === 'number') return rec.exitCode;
  if (typeof rec.code === 'number') return rec.code;
  return undefined;
}

/** Update an observation from a single completed tool call. Never invents data. */
export function observeToolEvent(
  observation: RunObservation,
  toolName: string,
  input: unknown,
  result: unknown,
  success: boolean,
): void {
  if (MUTATING_TOOLS.has(toolName)) {
    const p = pathFromInput(input);
    if (p && success) observation.recordFileChange(p);
  }

  if (COMMAND_TOOLS.has(toolName)) {
    const cmd = commandFromInput(input) || toolName;
    const exit = exitCodeFromResult(result);
    const passed = success && (exit === undefined || exit === 0);
    observation.recordValidation(cmd, passed ? 'passed' : 'failed', exit);
    if (!passed) {
      const msg =
        result && typeof result === 'object'
          ? String(
              (result as any).message ||
                (result as any).stderr ||
                (result as any).error ||
                '',
            )
          : String(result || '');
      observation.recordFailure(toolName, msg || `exit ${exit ?? 'error'}`);
    }
  } else if (!success) {
    const msg =
      result && typeof result === 'object'
        ? String((result as any).message || (result as any).error || '')
        : String(result || '');
    observation.recordFailure(toolName, msg);
  }
}

export function buildRunHandoff(input: {
  sessionId: string;
  cwd: string;
  status: RunHandoffStatus;
  trigger: RunHandoffTrigger;
  observation: RunObservation;
  task?: string;
  remainingWork?: string[];
}): RunHandoff {
  const snap = input.observation.snapshot();
  const remaining = [
    ...snap.remainingWork,
    ...(input.remainingWork || []),
  ].filter(Boolean);

  if (
    (input.status === 'interrupted' || input.status === 'blocked') &&
    remaining.length === 0 &&
    (input.task || snap.task)
  ) {
    remaining.push(`Continue: ${(input.task || snap.task).slice(0, 200)}`);
  }

  return redactHandoff({
    sessionId: input.sessionId,
    cwd: input.cwd,
    task: input.task || snap.task || '',
    status: input.status,
    changedFiles: snap.changedFiles,
    validation: snap.validation,
    decisions: snap.decisions,
    failedApproaches: snap.failedApproaches,
    remainingWork: Array.from(new Set(remaining)).slice(-12),
    createdAt: new Date().toISOString(),
    trigger: input.trigger,
    source: 'observed',
  });
}

export const RUN_HANDOFF_HEADING = '# Run Handoff';

export function formatRunHandoffMarkdown(handoff: RunHandoff): string {
  const h = redactHandoff(handoff);
  const lines = [
    RUN_HANDOFF_HEADING,
    '',
    'This is a handoff from a previous run. Treat it as background only — do not re-do finished work or invent validation that is not listed.',
    '',
    '## Task',
    h.task || '(none recorded)',
    '',
    '## Status',
    h.status,
    '',
    '## Changed files',
    h.changedFiles.length
      ? h.changedFiles.map((f) => `- ${f}`).join('\n')
      : '- (none observed)',
    '',
    '## Validation',
    h.validation.length
      ? h.validation
          .map(
            (v) =>
              `- command: ${v.command}\n  result: ${v.result}` +
              (v.exitCode !== undefined ? ` (exit ${v.exitCode})` : ''),
          )
          .join('\n')
      : '- (none observed)',
    '',
    '## Decisions and discoveries',
    h.decisions.length
      ? h.decisions.map((d) => `- ${d}`).join('\n')
      : '- (none recorded)',
    '',
    '## Failed approaches',
    h.failedApproaches.length
      ? h.failedApproaches.map((d) => `- ${d}`).join('\n')
      : '- (none recorded)',
    '',
    '## Remaining work',
    h.remainingWork.length
      ? h.remainingWork.map((d) => `- ${d}`).join('\n')
      : '- (none recorded)',
  ];
  return lines.join('\n');
}

export function messageContainsHandoff(message: MessageParam): boolean {
  const text =
    typeof message.content === 'string'
      ? message.content
      : Array.isArray(message.content)
        ? message.content
            .map((b: any) => (b?.type === 'text' ? String(b.text || '') : ''))
            .join('\n')
        : '';
  return text.includes(RUN_HANDOFF_HEADING);
}

export function latestHandoffFromEntries(entries: Entry[]): RunHandoff | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]!;
    if (e.type === 'run-handoff' && (e as RunHandoffTranscriptEntry).handoff) {
      return redactHandoff((e as RunHandoffTranscriptEntry).handoff as RunHandoff);
    }
  }
  return null;
}

export async function writeHandoffEntry(
  transcriptPath: string,
  handoff: RunHandoff,
): Promise<UUID> {
  const uuid = generateUuid();
  const entry: RunHandoffTranscriptEntry = {
    type: 'run-handoff',
    uuid,
    parentUuid: null,
    timestamp: new Date().toISOString(),
    sessionId: handoff.sessionId,
    handoff: redactHandoff(handoff),
  };
  await getTranscriptWriter().enqueueWrite(transcriptPath, entry);
  return uuid;
}

export function compactUserStatus(handoff: RunHandoff, droppedCount: number): string {
  const files = handoff.changedFiles.length;
  const tests = handoff.validation.length;
  const blockers = handoff.failedApproaches.length + handoff.remainingWork.length;
  const parts = [
    `Compacted context (dropped ${droppedCount} older message(s)).`,
    `Preserved the active task`,
    `${files} changed file${files === 1 ? '' : 's'}`,
    `${tests} validation result${tests === 1 ? '' : 's'}`,
  ];
  if (blockers > 0) {
    parts.push(
      `${blockers} unresolved item${blockers === 1 ? '' : 's'}`,
    );
  }
  return `${parts[0]} ${parts[1]}, ${parts[2]}, ${parts[3]}${
    parts[4] ? `, and ${parts[4]}` : ''
  }.`;
}
