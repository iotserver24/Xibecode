/**
 * Claude-style tool result budget: cap total tool result size in a turn
 * and produce a short batch summary for the next model turn.
 */

export type ToolResultBlock = {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

export type ToolBatchItem = {
  name: string;
  success: boolean;
  path?: string;
  preview?: string;
};

const DEFAULT_MAX_TOTAL = 100_000;
const DEFAULT_MAX_ONE = 24_000;

/**
 * Shrink tool result contents so sum(content.length) <= maxTotalChars.
 * Prefer keeping the most recent results intact; trim oldest first.
 */
export function applyToolResultBudget(
  results: ToolResultBlock[],
  opts?: { maxTotalChars?: number; maxOneChars?: number },
): { results: ToolResultBlock[]; trimmed: number; totalChars: number } {
  const maxTotal = opts?.maxTotalChars ?? DEFAULT_MAX_TOTAL;
  const maxOne = opts?.maxOneChars ?? DEFAULT_MAX_ONE;

  const out = results.map((r) => ({
    ...r,
    content: shrinkOne(String(r.content || ''), maxOne),
  }));

  let total = out.reduce((s, r) => s + r.content.length, 0);
  let trimmed = 0;

  // Trim from oldest to newest until under budget
  for (let i = 0; i < out.length && total > maxTotal; i++) {
    const r = out[i]!;
    const before = r.content.length;
    const target = Math.max(
      400,
      Math.floor((maxTotal / out.length) * 0.6),
    );
    if (before <= target) continue;
    r.content = shrinkOne(r.content, target);
    total -= before - r.content.length;
    trimmed++;
  }

  // Final hard pass
  while (total > maxTotal && out.length) {
    let longest = 0;
    for (let i = 0; i < out.length; i++) {
      if (out[i]!.content.length > out[longest]!.content.length) longest = i;
    }
    const r = out[longest]!;
    if (r.content.length <= 500) break;
    const before = r.content.length;
    r.content = shrinkOne(r.content, Math.floor(before * 0.5));
    total -= before - r.content.length;
    trimmed++;
  }

  return { results: out, trimmed, totalChars: total };
}

function shrinkOne(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const marker = `\n\n[tool result budget: truncated from ${value.length} chars]\n\n`;
  const available = Math.max(0, maxChars - marker.length);
  const head = Math.ceil(available * 0.55);
  const tail = Math.floor(available * 0.45);
  return `${value.slice(0, head)}${marker}${value.slice(value.length - tail)}`;
}

/** One-line summary of a tool batch for the model / user. */
export function formatToolBatchSummary(items: ToolBatchItem[]): string {
  if (!items.length) return '';
  const ok = items.filter((i) => i.success).length;
  const fail = items.length - ok;
  const names = new Map<string, number>();
  for (const i of items) {
    names.set(i.name, (names.get(i.name) || 0) + 1);
  }
  const nameStr = [...names.entries()]
    .map(([n, c]) => (c > 1 ? `${n}×${c}` : n))
    .join(', ');
  const paths = items
    .map((i) => i.path)
    .filter(Boolean)
    .slice(0, 6) as string[];
  const pathStr = paths.length ? `; paths: ${paths.join(', ')}` : '';
  return `Tool batch: ${items.length} call(s) [${nameStr}] — ${ok} ok, ${fail} failed${pathStr}.`;
}

export function extractPathFromToolInput(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const o = input as Record<string, unknown>;
  if (typeof o.path === 'string') return o.path;
  if (typeof o.file_path === 'string') return o.file_path;
  if (typeof o.target === 'string') return o.target;
  return undefined;
}
