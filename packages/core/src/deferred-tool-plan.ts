/**
 * Detect "I will use web_search / agent-browser" replies that never emit a tool call.
 * Models follow "talk first" and then stop; nudge them to actually invoke the tool.
 */

export const MAX_DEFERRED_TOOL_PLAN_RETRIES = 2;

const NAMED_TOOL =
  /\b(web_search|fetch_url|agent-browser|run_command|list_directory|read_file|take_screenshot|grep_code|search_files|get_git_status|see_image)\b/i;

const PLANNING_VOICE =
  /\b(i understand|i'?ll\b|i will\b|let'?s (start|check|look|search|inspect|open|take)|i am going to|i'?m going to|first i(?:'| wi)ll|will run a (search|command)|check the workspace first|take a look at the current project)\b/i;

const BROWSE_OR_RESEARCH =
  /\b(open a browser|browser session|using agent[- ]browser|search(ing)? the web|web research|run a search query)\b/i;

const INSPECT_FIRST =
  /\b(inspect (the )?(directory|project|repo|workspace)|git status|list (the )?(files|directory|tools))\b/i;

export function looksLikeDeferredToolPlan(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  if (!PLANNING_VOICE.test(t)) return false;
  return NAMED_TOOL.test(t) || BROWSE_OR_RESEARCH.test(t) || INSPECT_FIRST.test(t);
}

export function deferredToolPlanNudge(): string {
  return (
    '[SYSTEM] You described work instead of doing it. This response had zero tool calls. ' +
    'Call the tools now — do not write another plan. ' +
    'Research: call `web_search` (and `fetch_url` for specific pages). ' +
    'Browser: `agent-browser` is a CLI, not a native tool — invoke it with `run_command` ' +
    '(example command: `agent-browser open https://example.com`, then `agent-browser snapshot -i`). ' +
    'Inspecting the repo: call `list_directory` / `get_git_status` now.'
  );
}

export function evaluateDeferredToolPlan(input: {
  assistantText: string;
  retries: number;
  maxRetries?: number;
}): { nudge: boolean; reason?: string; message?: string } {
  const max = input.maxRetries ?? MAX_DEFERRED_TOOL_PLAN_RETRIES;
  if (input.retries >= max) {
    return { nudge: false, reason: 'deferred-tool-plan retry budget exhausted' };
  }
  if (!looksLikeDeferredToolPlan(input.assistantText)) {
    return { nudge: false };
  }
  return {
    nudge: true,
    reason: 'plan-only reply named tools but did not call them',
    message: deferredToolPlanNudge(),
  };
}
