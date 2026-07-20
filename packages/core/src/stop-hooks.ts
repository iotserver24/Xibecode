/**
 * Claude Code–style stop hooks: last-line defense before the agent finalizes.
 *
 * When the model ends a turn with text and no tool calls, evaluate whether
 * we should force another iteration (missing evidence, unverified edits,
 * unsubstantiated "tests pass" claims).
 *
 * Disabled via env XIBECODE_STOP_HOOKS=0 or completionEvidenceMode=off.
 */

export type StopHookMode = 'off' | 'balanced' | 'strict';

export interface StopHookInput {
  mode: StopHookMode;
  assistantText: string;
  toolCallCount: number;
  filesChanged: string[];
  /** Recent evidence labels (tool names / paths) */
  recentEvidence: string[];
  hasRecentGroundedEvidence: boolean;
  stopHookRetries: number;
  maxRetries?: number;
}

export interface StopHookResult {
  /** If true, inject system nudge and continue the agent loop. */
  preventContinuation: boolean;
  /** User-role system message to inject (when preventContinuation). */
  nudgeMessage?: string;
  /** Human-readable reason for logs/warnings. */
  reason?: string;
}

const CLAIM_SUCCESS =
  /\b(all tests? pass|tests? pass(ed|ing)?|fixed the bug|fully (done|complete|fixed)|successfully (fixed|implemented|deployed)|ready to (merge|ship)|lgtm|verified)\b/i;

const CLAIM_NO_WORK =
  /\b(nothing to (do|change|fix)|already (correct|fine|working)|no (changes|issues) needed)\b/i;

/**
 * Evaluate whether the agent should be blocked from finishing this turn.
 */
export function evaluateStopHooks(input: StopHookInput): StopHookResult {
  if (input.mode === 'off') {
    return { preventContinuation: false };
  }
  if (process.env.XIBECODE_STOP_HOOKS === '0' || process.env.XIBECODE_STOP_HOOKS === 'false') {
    return { preventContinuation: false };
  }

  const maxRetries = input.maxRetries ?? (input.mode === 'strict' ? 2 : 1);
  if (input.stopHookRetries >= maxRetries) {
    return { preventContinuation: false, reason: 'stop-hook retry budget exhausted' };
  }

  const text = (input.assistantText || '').trim();
  const changed = input.filesChanged || [];
  const tools = input.toolCallCount || 0;
  const hasEvidence = input.hasRecentGroundedEvidence;
  const evidence = input.recentEvidence || [];

  // Short conversational answers: allow
  if (tools === 0 && changed.length === 0 && text.length < 800 && !CLAIM_SUCCESS.test(text)) {
    return { preventContinuation: false };
  }

  // Claimed success / verification without tool evidence
  if (CLAIM_SUCCESS.test(text) && !hasEvidence && tools === 0) {
    return {
      preventContinuation: true,
      reason: 'success claimed without tool evidence',
      nudgeMessage:
        '[SYSTEM] Stop-hook: you claimed success or verification without recent tool evidence. ' +
        'Use tools (read_file, run_tests, run_command, get_git_diff_summary) to prove the claim, ' +
        'or correct the claim. Do not finish until evidence exists.',
    };
  }

  // Edited files but never verified / no evidence trail
  if (changed.length > 0 && !hasEvidence) {
    const sample = changed.slice(0, 5).join(', ');
    return {
      preventContinuation: true,
      reason: `files changed without grounded evidence (${changed.length})`,
      nudgeMessage:
        `[SYSTEM] Stop-hook: you modified file(s) (${sample}) but have no recent grounded evidence. ` +
        `Re-read the edited regions and/or run tests before finishing. ` +
        `Then summarize what changed and how you verified it.`,
    };
  }

  // Edited files + success claim but evidence lacks test/git check in strict mode
  if (
    input.mode === 'strict' &&
    changed.length > 0 &&
    CLAIM_SUCCESS.test(text) &&
    !evidence.some((e) => /test|git|post_edit|run_command|run_tests/i.test(e))
  ) {
    return {
      preventContinuation: true,
      reason: 'strict: success claim without test/git/post-edit evidence labels',
      nudgeMessage:
        '[SYSTEM] Stop-hook (strict): claim of success requires a verification tool ' +
        '(run_tests / run_command / get_git_diff_summary / post-edit verify). Run one, then finish.',
    };
  }

  // "Nothing to do" after many tools — suspicious; allow in balanced
  if (input.mode === 'strict' && tools >= 5 && CLAIM_NO_WORK.test(text) && changed.length === 0) {
    return {
      preventContinuation: true,
      reason: 'strict: many tools then claimed no work',
      nudgeMessage:
        '[SYSTEM] Stop-hook (strict): you ran several tools then claimed nothing to do. ' +
        'Confirm with get_git_status or list concrete findings, or continue the task.',
    };
  }

  return { preventContinuation: false };
}
