/**
 * Recover tool calls leaked as plain text instead of native tool_calls.
 *
 * 1. DeepSeek DSML: `<｜DSML｜tool_calls>…` (fullwidth pipes)
 * 2. Pseudo shell tags: `<bash>…</bash>`, `<sh>`, `<shell>`, `<command>`
 *
 * Without recovery the agent loop exits with tools:0 ("it stopped / not looping").
 */

export type RecoveredToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type DsmlRecoverResult = {
  text: string;
  tools: RecoveredToolCall[];
};

/** Fullwidth vertical line U+FF5C as used by DeepSeek DSML markers. */
const FW = '\uFF5C';

/** Open/close tag: <｜DSML｜name attrs> or ASCII/spaced variants */
const DSML_TAG_RE = new RegExp(
  `<\\s*\\/?\\s*(?:${FW}|\\|)\\s*DSML\\s*(?:${FW}|\\|)\\s*([^>\\s]+)([^>]*)>`,
  'gi',
);

const INVOKE_OPEN_RE = new RegExp(
  `<\\s*(?:${FW}|\\|)\\s*DSML\\s*(?:${FW}|\\|)\\s*invoke\\b([^>]*)>`,
  'gi',
);

const PARAM_RE = new RegExp(
  `<\\s*(?:${FW}|\\|)\\s*DSML\\s*(?:${FW}|\\|)\\s*parameter\\b([^>]*)>([\\s\\S]*?)<\\s*\\/\\s*(?:${FW}|\\|)\\s*DSML\\s*(?:${FW}|\\|)\\s*parameter\\s*>`,
  'gi',
);

const TOOL_CALLS_BLOCK_RE = new RegExp(
  `<\\s*(?:${FW}|\\|)\\s*DSML\\s*(?:${FW}|\\|)\\s*tool_calls\\s*>[\\s\\S]*?<\\s*\\/\\s*(?:${FW}|\\|)\\s*DSML\\s*(?:${FW}|\\|)\\s*tool_calls\\s*>`,
  'gi',
);

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_][\w-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    out[m[1]] = m[2];
  }
  return out;
}

function coerceParamValue(raw: string, attrs: Record<string, string>): unknown {
  const v = raw.trim();
  // string="false" → try JSON (numbers, bools, objects)
  if (attrs.string === 'false' || attrs.type === 'number' || attrs.type === 'json') {
    try {
      return JSON.parse(v);
    } catch {
      const n = Number(v);
      if (v !== '' && !Number.isNaN(n)) return n;
      if (v === 'true') return true;
      if (v === 'false') return false;
      return v;
    }
  }
  return v;
}

/**
 * Parse DSML invoke blocks from model text into tool calls.
 * Returns cleaned text (DSML removed) and recovered tools.
 */
export function recoverDsmlOnly(text: string): DsmlRecoverResult {
  if (!text || !/DSML/i.test(text)) {
    return { text: text || '', tools: [] };
  }

  const tools: RecoveredToolCall[] = [];
  let idx = 0;

  // Walk invoke blocks
  let inv: RegExpExecArray | null;
  const invokeRe = new RegExp(INVOKE_OPEN_RE.source, 'gi');
  while ((inv = invokeRe.exec(text))) {
    const attrs = parseAttrs(inv[1] || '');
    const name = (attrs.name || '').trim();
    if (!name) continue;

    const start = inv.index + inv[0].length;
    // Find matching close invoke
    const closeRe = new RegExp(
      `<\\s*\\/\\s*(?:${FW}|\\|)\\s*DSML\\s*(?:${FW}|\\|)\\s*invoke\\s*>`,
      'i',
    );
    const rest = text.slice(start);
    const closeM = closeRe.exec(rest);
    if (!closeM) continue;
    const body = rest.slice(0, closeM.index);

    const input: Record<string, unknown> = {};
    const paramRe = new RegExp(PARAM_RE.source, 'gi');
    let pm: RegExpExecArray | null;
    while ((pm = paramRe.exec(body))) {
      const pAttrs = parseAttrs(pm[1] || '');
      const pName = (pAttrs.name || '').trim();
      if (!pName) continue;
      input[pName] = coerceParamValue(pm[2] ?? '', pAttrs);
    }

    tools.push({
      id: `dsml_${idx++}_${name}`,
      name,
      input,
    });
  }

  let cleaned = text;
  // Remove whole tool_calls blocks first
  cleaned = cleaned.replace(TOOL_CALLS_BLOCK_RE, '');
  // Remove any leftover DSML tags
  cleaned = cleaned.replace(DSML_TAG_RE, '');
  // Also strip invoke/parameter leftovers
  cleaned = cleaned.replace(
    new RegExp(
      `<\\s*\\/?\\s*(?:${FW}|\\|)\\s*DSML\\s*(?:${FW}|\\|)\\s*[^>]*>`,
      'gi',
    ),
    '',
  );
  cleaned = cleaned.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  return { text: cleaned, tools };
}

/** Pseudo shell tags some models invent instead of run_command tool calls. */
const SHELL_TAG_RE =
  /<\s*(bash|sh|shell|zsh|command)\s*>\s*([\s\S]*?)\s*<\s*\/\s*\1\s*>/gi;

/**
 * Recover `<bash>cmd</bash>` (and sh/shell/command) as run_command tools.
 */
export function recoverBashTagToolCalls(text: string): DsmlRecoverResult {
  if (!text || !/<\s*(bash|sh|shell|zsh|command)\s*>/i.test(text)) {
    return { text: text || '', tools: [] };
  }

  const tools: RecoveredToolCall[] = [];
  let idx = 0;
  const re = new RegExp(SHELL_TAG_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const cmd = (m[2] || '').trim();
    if (!cmd) continue;
    // Collapse multi-line tag body into one shell command chain when needed
    const command = cmd
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join(' && ');
    tools.push({
      id: `bash_${idx++}`,
      name: 'run_command',
      input: { command },
    });
  }

  const cleaned = text
    .replace(new RegExp(SHELL_TAG_RE.source, 'gi'), '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text: cleaned, tools };
}

/**
 * Full recovery: DSML + pseudo shell tags.
 * Prefer calling this from the agent when native tool_calls are empty.
 */
export function recoverDsmlToolCalls(text: string): DsmlRecoverResult {
  if (!text) return { text: '', tools: [] };

  const dsml = recoverDsmlOnly(text);
  const bash = recoverBashTagToolCalls(dsml.text);
  return {
    text: bash.text,
    tools: [...dsml.tools, ...bash.tools],
  };
}

/** Strip leaked tool markup without recovering (UI path). */
export function stripDsmlMarkup(text: string): string {
  return recoverDsmlToolCalls(text).text;
}
