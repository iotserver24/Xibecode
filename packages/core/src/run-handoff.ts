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

/** How a file-change claim was obtained. Missing path is never invented. */
export type ObservationState = 'observed' | 'not_observed' | 'failed';

/**
 * Command outcome. `unknown` means the tool finished but no exit code was
 * observed — never treat that as a pass. `not_run` is reserved for explicit
 * unused checks. `timeout` stays distinct from a non-zero exit.
 */
export type ValidationResult = 'passed' | 'failed' | 'not_run' | 'unknown' | 'timeout';

export type ValidationKind =
  | 'test'
  | 'lint'
  | 'typecheck'
  | 'build'
  | 'format'
  | 'check'
  | 'command';

export type ValidationScope = 'targeted' | 'full' | 'unknown';

export interface RunChangedFile {
  path: string;
  evidenceId: string;
  tool: string;
  state: ObservationState;
  sourceEventId?: string;
  observedAt?: string;
}

export interface RunValidation {
  command: string;
  result: ValidationResult;
  exitCode?: number;
  /** Present on new observations; older transcripts may omit it. */
  evidenceId?: string;
  kind?: ValidationKind;
  scope?: ValidationScope;
  sourceEventId?: string;
  /** Normalized form used to merge equivalent commands. */
  canonicalCommand?: string;
  /** Redacted, bounded tool output. Never a substitute for exit code. */
  outputSummary?: string;
  observedAt?: string;
  /** True when a later observed file edit happened after this result. */
  stale?: boolean;
  staleReason?: string;
  staleAfterEdit?: string;
}

export const OUTPUT_SUMMARY_MAX = 400;

export interface RunHandoff {
  sessionId: string;
  cwd: string;
  task: string;
  status: RunHandoffStatus;
  /** Observed successful mutation paths only. Never includes guessed files. */
  changedFiles: string[];
  /** Evidence for every file-change claim, including failed / not_observed. */
  fileEvidence?: RunChangedFile[];
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

export function newEvidenceId(prefix = 'ev'): string {
  return `${prefix}_${generateUuid().replace(/-/g, '').slice(0, 12)}`;
}

export type CommandChainOp = '&&' | '||' | ';';

export interface CommandChainPart {
  text: string;
  op?: CommandChainOp;
}

/** Split `a && b || c; d` without breaking quoted strings. */
export function splitCommandChain(command: string): CommandChainPart[] {
  const out: CommandChainPart[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (command.startsWith('&&', i)) {
      if (cur.trim()) out.push({ text: cur.trim(), op: '&&' });
      cur = '';
      i++;
      continue;
    }
    if (command.startsWith('||', i)) {
      if (cur.trim()) out.push({ text: cur.trim(), op: '||' });
      cur = '';
      i++;
      continue;
    }
    if (ch === ';') {
      if (cur.trim()) out.push({ text: cur.trim(), op: ';' });
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push({ text: cur.trim() });
  return out;
}

function stripLeadingEnvAssign(segment: string): string {
  return segment.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|\S+)\s+)+/, '');
}

export function canonicalizeCommandSegment(segment: string): string {
  let s = stripLeadingEnvAssign(segment.trim()).replace(/\s+/g, ' ');
  s = s.replace(/^npx\s+(?:--yes\s+)?/, '');
  s = s.replace(/^(?:pnpm|npm|yarn|bun)\s+(?:dlx|exec)\s+/, '');
  s = s.replace(/^(npm|pnpm|yarn|bun)\s+run\s+/, '$1 ');
  s = s.replace(/\bvitest\s+run\b/, 'vitest');
  return s.trim();
}

/** Collapse equivalent package-manager / runner forms. */
export function canonicalizeCommand(command: string): string {
  const parts = splitCommandChain(command.trim());
  if (!parts.length) return '';
  let out = '';
  for (const part of parts) {
    out += canonicalizeCommandSegment(part.text);
    if (part.op) out += ` ${part.op} `;
  }
  return out.trim();
}

/** Match key so `pnpm test` and `npm test` update the same evidence row. */
export function commandMatchKey(command: string): string {
  return canonicalizeCommand(command).replace(/^(npm|pnpm|yarn|bun)\s+/, 'pkg ');
}

export function summarizeCommandOutput(result: unknown): string | undefined {
  let text = '';
  if (result && typeof result === 'object') {
    const rec = result as Record<string, unknown>;
    for (const key of ['stdout', 'output', 'stderr', 'message', 'error']) {
      if (typeof rec[key] === 'string' && rec[key].trim()) {
        text += (text ? '\n' : '') + rec[key];
      }
    }
  } else if (typeof result === 'string') {
    text = result;
  }
  text = redactSensitiveText(text).replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  if (text.length <= OUTPUT_SUMMARY_MAX) return text;
  return `${text.slice(0, OUTPUT_SUMMARY_MAX - 1)}…`;
}

export function classifyValidationCommand(command: string): {
  kind: ValidationKind;
  scope: ValidationScope;
} {
  const parts = splitCommandChain(command);
  if (parts.length > 1) {
    const classes = parts.map((p) => classifySingleCommand(canonicalizeCommandSegment(p.text)));
    const kinds = new Set(classes.map((c) => c.kind));
    const kind: ValidationKind = kinds.size === 1 ? classes[0]!.kind : 'command';
    const scope: ValidationScope = classes.some((c) => c.scope === 'full')
      ? 'full'
      : classes.every((c) => c.scope === 'targeted')
        ? 'targeted'
        : 'unknown';
    return { kind, scope };
  }
  return classifySingleCommand(canonicalizeCommand(command) || command);
}

function classifySingleCommand(command: string): {
  kind: ValidationKind;
  scope: ValidationScope;
} {
  const raw = command.trim();
  const c = raw.toLowerCase();
  let kind: ValidationKind = 'command';
  if (
    /\b(vitest|jest|mocha|pytest|phpunit|cargo test|go test)\b/.test(c) ||
    /(^|[\s&|;])(pnpm|npm|yarn|bun)\s+test\b/.test(c) ||
    /(^|[\s&|;])tests?\b/.test(c)
  ) {
    kind = 'test';
  } else if (/\b(eslint|lint|ruff|pylint)\b/.test(c)) {
    kind = 'lint';
  } else if (/\b(tsc\b|typecheck|pyright|mypy)\b/.test(c)) {
    kind = 'typecheck';
  } else if (/\b(build|compile)\b/.test(c)) {
    kind = 'build';
  } else if (/\b(prettier|format|fmt)\b/.test(c)) {
    kind = 'format';
  } else if (/\bcheck\b/.test(c)) {
    kind = 'check';
  }

  const tokens = raw.split(/\s+/).slice(1);
  const hasFileArg = tokens.some(
    (t) => !t.startsWith('-') && (/[\\/]/.test(t) || /\.[A-Za-z0-9]+$/.test(t)),
  );
  const hasFilter = /(?:^|\s)(?:-t|--testNamePattern|--grep|-g|--run)(?:\s|=)/.test(raw);
  const scope: ValidationScope =
    hasFileArg || hasFilter ? 'targeted' : kind === 'command' ? 'unknown' : 'full';
  return { kind, scope };
}

export function isVerifiedPass(validation: RunValidation): boolean {
  return validation.result === 'passed' && validation.exitCode === 0 && !validation.stale;
}

export function normalizeEvidencePath(filePath: string): string {
  return filePath.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

function escapePathRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Targeted commands cover a file when they name it, its basename, or a sibling test/spec. */
export function validationCoversPath(command: string, filePath: string): boolean {
  const file = normalizeEvidencePath(filePath);
  if (!file) return false;
  const cmd = command.replace(/\\/g, '/');
  if (cmd.includes(file)) return true;
  const base = file.split('/').pop() || '';
  if (base && cmd.includes(base)) return true;
  const stem = base.replace(/\.[^.]+$/, '');
  if (!stem) return false;
  const sibling = new RegExp(
    `(?:^|[\\s/"'\`])${escapePathRe(stem)}\\.(?:test|spec)\\.[A-Za-z0-9]+(?:$|[\\s"'\`])`,
  );
  return sibling.test(cmd);
}

export function shouldStaleValidation(
  validation: RunValidation,
  editedPath: string | null,
): boolean {
  if (validation.result === 'not_run') return false;
  if (!editedPath) return true;
  if (validation.scope === 'targeted') {
    return (
      validationCoversPath(validation.command, editedPath) ||
      (!!validation.canonicalCommand &&
        validationCoversPath(validation.canonicalCommand, editedPath))
    );
  }
  return true;
}

function redactFileEvidence(items: RunChangedFile[] | undefined): RunChangedFile[] | undefined {
  if (!items) return items;
  return items.map((f) => ({
    ...f,
    path: redactSensitiveText(f.path),
    tool: redactSensitiveText(f.tool),
  }));
}

export function redactHandoff(handoff: RunHandoff): RunHandoff {
  return {
    ...handoff,
    task: redactSensitiveText(handoff.task),
    changedFiles: handoff.changedFiles.map((p) => redactSensitiveText(p)),
    fileEvidence: redactFileEvidence(handoff.fileEvidence),
    validation: handoff.validation.map((v) => ({
      ...v,
      command: redactSensitiveText(v.command),
      canonicalCommand: v.canonicalCommand
        ? redactSensitiveText(v.canonicalCommand)
        : v.canonicalCommand,
      outputSummary: v.outputSummary ? redactSensitiveText(v.outputSummary) : v.outputSummary,
      staleAfterEdit: v.staleAfterEdit
        ? redactSensitiveText(v.staleAfterEdit)
        : v.staleAfterEdit,
      staleReason: v.staleReason ? redactSensitiveText(v.staleReason) : v.staleReason,
    })),
    decisions: redactList(handoff.decisions),
    failedApproaches: redactList(handoff.failedApproaches),
    remainingWork: redactList(handoff.remainingWork),
  };
}

export class RunObservation {
  task = '';
  readonly changedFiles = new Set<string>();
  readonly fileEvidence: RunChangedFile[] = [];
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

  markValidationsStaleAfterEdit(editedPath: string | null): void {
    const path = editedPath ? redactSensitiveText(normalizeEvidencePath(editedPath)) : '';
    for (const validation of this.validations) {
      if (!shouldStaleValidation(validation, path || null)) continue;
      validation.stale = true;
      validation.staleAfterEdit = path || undefined;
      validation.staleReason = path
        ? `later edit of ${path}`
        : 'later file edit (path not observed)';
    }
  }

  recordFileEvidence(
    entry: Omit<RunChangedFile, 'evidenceId'> & {
      evidenceId?: string;
      /** Restore from a previous handoff without re-staling current results. */
      skipStale?: boolean;
    },
  ): void {
    const path = redactSensitiveText(entry.path.trim());
    const tool = redactSensitiveText(entry.tool.trim()) || 'unknown_tool';
    const evidenceId = entry.evidenceId || newEvidenceId('file');
    const existing = this.fileEvidence.find(
      (f) => f.path === path && f.tool === tool && f.state === entry.state,
    );
    if (
      !entry.skipStale &&
      (entry.state === 'observed' || entry.state === 'not_observed')
    ) {
      this.markValidationsStaleAfterEdit(path || null);
    }
    if (existing) {
      if (entry.sourceEventId) existing.sourceEventId = entry.sourceEventId;
      if (entry.observedAt) existing.observedAt = entry.observedAt;
      else if (!entry.skipStale) existing.observedAt = new Date().toISOString();
      if (entry.state === 'observed' && path) this.changedFiles.add(path);
      return;
    }
    this.fileEvidence.push({
      path: path || '(path not observed)',
      evidenceId,
      tool,
      state: entry.state,
      sourceEventId: entry.sourceEventId,
      observedAt: entry.observedAt || new Date().toISOString(),
    });
    if (entry.state === 'observed' && path) this.changedFiles.add(path);
  }

  recordValidation(
    command: string,
    result: ValidationResult,
    exitCode?: number,
    evidenceId?: string,
    extras?: {
      kind?: ValidationKind;
      scope?: ValidationScope;
      sourceEventId?: string;
      stale?: boolean;
      staleReason?: string;
      staleAfterEdit?: string;
      canonicalCommand?: string;
      outputSummary?: string;
      observedAt?: string;
    },
  ): void {
    const cmd = redactSensitiveText(command.trim()).slice(0, 400);
    if (!cmd) return;
    const canonical = extras?.canonicalCommand || canonicalizeCommand(cmd);
    const classified = classifyValidationCommand(canonical || cmd);
    const key = commandMatchKey(canonical || cmd);
    const existing = this.validations.find(
      (v) => commandMatchKey(v.canonicalCommand || v.command) === key,
    );
    if (existing) {
      existing.result = result;
      existing.command = cmd;
      existing.canonicalCommand = canonical;
      if (exitCode !== undefined) existing.exitCode = exitCode;
      else if (result === 'unknown' || result === 'timeout') delete existing.exitCode;
      if (evidenceId) existing.evidenceId = evidenceId;
      existing.kind = extras?.kind || classified.kind;
      existing.scope = extras?.scope || classified.scope;
      if (extras?.sourceEventId) existing.sourceEventId = extras.sourceEventId;
      if (extras?.outputSummary !== undefined) {
        existing.outputSummary = extras.outputSummary
          ? redactSensitiveText(extras.outputSummary).slice(0, OUTPUT_SUMMARY_MAX)
          : extras.outputSummary;
      }
      if (extras?.stale) {
        existing.stale = true;
        existing.staleReason = extras.staleReason;
        existing.staleAfterEdit = extras.staleAfterEdit;
        if (extras.observedAt) existing.observedAt = extras.observedAt;
      } else {
        existing.stale = false;
        delete existing.staleReason;
        delete existing.staleAfterEdit;
        existing.observedAt = extras?.observedAt || new Date().toISOString();
      }
      return;
    }
    this.validations.push({
      command: cmd,
      result,
      exitCode,
      evidenceId: evidenceId || newEvidenceId('val'),
      kind: extras?.kind || classified.kind,
      scope: extras?.scope || classified.scope,
      sourceEventId: extras?.sourceEventId,
      canonicalCommand: canonical,
      outputSummary: extras?.outputSummary
        ? redactSensitiveText(extras.outputSummary).slice(0, OUTPUT_SUMMARY_MAX)
        : extras?.outputSummary,
      observedAt: extras?.observedAt || new Date().toISOString(),
      stale: extras?.stale || undefined,
      staleReason: extras?.staleReason,
      staleAfterEdit: extras?.staleAfterEdit,
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
    fileEvidence: RunChangedFile[];
    validation: RunValidation[];
    decisions: string[];
    failedApproaches: string[];
    remainingWork: string[];
    task: string;
  } {
    return {
      task: this.task,
      changedFiles: Array.from(this.changedFiles),
      fileEvidence: this.fileEvidence.slice(-40),
      validation: this.validations.slice(-20),
      decisions: this.decisions.slice(-12),
      failedApproaches: this.failedApproaches.slice(-12),
      remainingWork: this.remainingWork.slice(-12),
    };
  }
}

function laterTimestamp(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (Number.isNaN(left) || Number.isNaN(right)) return false;
  return left > right;
}

/** If persisted file edits are newer than a validation, mark it stale. */
export function applyPersistedFreshness(observation: RunObservation): void {
  for (const validation of observation.validations) {
    if (validation.result === 'not_run') continue;
    for (const edit of observation.fileEvidence) {
      if (edit.state !== 'observed' && edit.state !== 'not_observed') continue;
      if (!laterTimestamp(edit.observedAt, validation.observedAt)) continue;
      const path =
        !edit.path || edit.path === '(path not observed)' ? null : edit.path;
      if (!shouldStaleValidation(validation, path)) continue;
      validation.stale = true;
      validation.staleAfterEdit = path || undefined;
      validation.staleReason = path
        ? `later edit of ${path}`
        : 'later file edit (path not observed)';
    }
  }
}

/** Hydrate a fresh observation from a persisted handoff without inventing facts. */
export function restoreObservationFromHandoff(
  observation: RunObservation,
  handoff: RunHandoff,
): void {
  if (handoff.task) observation.setTask(handoff.task);
  for (const file of handoff.changedFiles) observation.recordFileChange(file);
  for (const file of handoff.fileEvidence || []) {
    observation.recordFileEvidence({ ...file, skipStale: true });
  }
  for (const validation of handoff.validation) {
    observation.recordValidation(
      validation.command,
      validation.result,
      validation.exitCode,
      validation.evidenceId,
      {
        kind: validation.kind,
        scope: validation.scope,
        sourceEventId: validation.sourceEventId,
        stale: validation.stale,
        staleReason: validation.staleReason,
        staleAfterEdit: validation.staleAfterEdit,
        canonicalCommand: validation.canonicalCommand,
        outputSummary: validation.outputSummary,
        observedAt: validation.observedAt,
      },
    );
  }
  for (const decision of handoff.decisions) observation.recordDecision(decision);
  for (const failure of handoff.failedApproaches) {
    observation.recordFailure('prior', failure);
  }
  for (const remaining of handoff.remainingWork) observation.recordRemaining(remaining);
  applyPersistedFreshness(observation);
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

function pathFromUnknown(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const rec = value as Record<string, unknown>;
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

function resultMessage(result: unknown): string {
  if (result && typeof result === 'object') {
    return String(
      (result as { message?: unknown }).message ||
        (result as { stderr?: unknown }).stderr ||
        (result as { error?: unknown }).error ||
        '',
    );
  }
  return String(result || '');
}

export function isTimeoutResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') {
    return /timed?\s*out/i.test(String(result || ''));
  }
  const rec = result as Record<string, unknown>;
  if (rec.timedOut === true || rec.timeout === true) return true;
  if (rec.exitCode === 124 || rec.code === 124) return true;
  return /timed?\s*out/i.test(resultMessage(result));
}

export function validationResultFromObservation(
  success: boolean,
  exitCode: number | undefined,
  result: unknown,
): ValidationResult {
  if (isTimeoutResult(result)) return 'timeout';
  if (exitCode === undefined) return success ? 'unknown' : 'failed';
  if (exitCode === 0 && success) return 'passed';
  return 'failed';
}

export interface ObserveToolEventOptions {
  sourceEventId?: string;
}

/** Update an observation from a single completed tool call. Never invents data. */
export function observeToolEvent(
  observation: RunObservation,
  toolName: string,
  input: unknown,
  result: unknown,
  success: boolean,
  options?: ObserveToolEventOptions | string,
): void {
  const sourceEventId =
    typeof options === 'string' ? options : options?.sourceEventId;

  if (MUTATING_TOOLS.has(toolName)) {
    const p = pathFromUnknown(input) || pathFromUnknown(result);
    if (p && success) {
      observation.recordFileEvidence({
        path: p,
        tool: toolName,
        state: 'observed',
        sourceEventId,
      });
    } else if (p && !success) {
      observation.recordFileEvidence({
        path: p,
        tool: toolName,
        state: 'failed',
        sourceEventId,
      });
    } else {
      observation.recordFileEvidence({
        path: '',
        tool: toolName,
        state: success ? 'not_observed' : 'failed',
        sourceEventId,
      });
    }
  }

  if (COMMAND_TOOLS.has(toolName)) {
    const cmd = commandFromInput(input) || toolName;
    const exit = exitCodeFromResult(result);
    const outcome = validationResultFromObservation(success, exit, result);
    observation.recordValidation(cmd, outcome, exit, undefined, {
      sourceEventId,
      outputSummary: summarizeCommandOutput(result),
    });
    if (outcome !== 'passed') {
      observation.recordFailure(toolName, resultMessage(result) || `exit ${exit ?? 'not observed'}`);
    }
  } else if (!success) {
    observation.recordFailure(toolName, resultMessage(result));
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

  if (
    snap.validation.some((v) => v.stale && v.result !== 'not_run') &&
    !remaining.some((item) => /stale/i.test(item))
  ) {
    remaining.push('Re-run validations that became stale after later file edits');
  }

  return redactHandoff({
    sessionId: input.sessionId,
    cwd: input.cwd,
    task: input.task || snap.task || '',
    status: input.status,
    changedFiles: snap.changedFiles,
    fileEvidence: snap.fileEvidence,
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

function formatFileEvidenceLine(file: RunChangedFile): string {
  const bits = [`state: ${file.state}`, `evidence: ${file.evidenceId}`, `tool: ${file.tool}`];
  if (file.sourceEventId) bits.push(`event: ${file.sourceEventId}`);
  if (file.observedAt) bits.push(`observedAt: ${file.observedAt}`);
  return `- ${file.path}\n  ${bits.join('\n  ')}`;
}

function formatValidationLine(v: RunValidation): string {
  const bits = [
    `- command: ${v.command}`,
    `  result: ${v.result}`,
    ...(v.evidenceId ? [`  evidence: ${v.evidenceId}`] : []),
  ];
  if (v.canonicalCommand && v.canonicalCommand !== v.command) {
    bits.push(`  canonical: ${v.canonicalCommand}`);
  }
  if (v.exitCode !== undefined) bits.push(`  exit: ${v.exitCode}`);
  else bits.push('  exit: not observed');
  if (v.kind) bits.push(`  kind: ${v.kind}`);
  if (v.scope) bits.push(`  scope: ${v.scope}`);
  if (v.observedAt) bits.push(`  observedAt: ${v.observedAt}`);
  if (v.outputSummary) bits.push(`  output: ${v.outputSummary}`);
  if (v.sourceEventId) bits.push(`  event: ${v.sourceEventId}`);
  if (v.stale) {
    bits.push('  stale: yes');
    if (v.staleAfterEdit) bits.push(`  staleAfterEdit: ${v.staleAfterEdit}`);
    bits.push(
      `  note: ${v.staleReason || 'later file edit'} — re-run before claiming this passed`,
    );
  }
  if (v.result === 'unknown') {
    bits.push('  note: missing exit code — do not treat as passed');
  }
  if (v.scope === 'targeted') {
    bits.push('  note: targeted check — not proof the whole repository is green');
  }
  return bits.join('\n');
}

export function formatRunHandoffMarkdown(handoff: RunHandoff): string {
  const h = redactHandoff(handoff);
  const fileLines = h.fileEvidence?.length
    ? h.fileEvidence.map(formatFileEvidenceLine).join('\n')
    : h.changedFiles.length
      ? h.changedFiles.map((f) => `- ${f}`).join('\n')
      : '- (none observed)';
  const lines = [
    RUN_HANDOFF_HEADING,
    '',
    'This is a handoff from a previous run. Treat it as background only — do not re-do finished work or invent validation that is not listed.',
    'Only `result: passed` with an observed exit code and no `stale: yes` is verified. `unknown`, `not_run`, `timeout`, and stale results are not success.',
    '',
    '## Task',
    h.task || '(none recorded)',
    '',
    '## Status',
    h.status,
    '',
    '## Changed files',
    fileLines,
    '',
    '## Validation',
    h.validation.length
      ? h.validation.map(formatValidationLine).join('\n')
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
  const unknown = handoff.validation.filter((v) => v.result === 'unknown' || v.result === 'timeout').length;
  const stale = handoff.validation.filter((v) => v.stale).length;
  const blockers = handoff.failedApproaches.length + handoff.remainingWork.length;
  const parts = [
    `Compacted context (dropped ${droppedCount} older message(s)).`,
    `Preserved the active task`,
    `${files} changed file${files === 1 ? '' : 's'}`,
    `${tests} validation result${tests === 1 ? '' : 's'}`,
  ];
  if (unknown > 0) {
    parts.push(`${unknown} unverified result${unknown === 1 ? '' : 's'}`);
  }
  if (stale > 0) {
    parts.push(`${stale} stale result${stale === 1 ? '' : 's'}`);
  }
  if (blockers > 0) {
    parts.push(
      `${blockers} unresolved item${blockers === 1 ? '' : 's'}`,
    );
  }
  return `${parts[0]} ${parts[1]}, ${parts.slice(2).join(', ')}.`;
}
