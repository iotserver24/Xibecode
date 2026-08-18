/**
 * Tool-loop guard (Hermes-style, stricter about *what* we block).
 *
 * Never block just because the same tool name was used with different args.
 * Only the exact same call (name + canonical args) can be limited:
 *   - warn at 3 identical repeats
 *   - block at 4 identical repeats with the same result / same failure
 *
 * Fetch/read tools only count when the result hash is unchanged.
 */

export type LoopDecision = {
  allowed: boolean;
  warning?: string;
  reason?: string;
};

type Recorded = {
  resultHash: string;
  count: number;
  failed: boolean;
};

const FETCH_TOOLS = new Set([
  'fetch_url',
  'web_search',
  'web_fetch',
  'fetch',
  'see_image',
]);

const READ_TOOLS = new Set([
  'read_file',
  'search_files',
  'grep_code',
  'list_directory',
  'list_files',
  'get_context',
]);

export const DEFAULT_WARN_AFTER = 3;
export const DEFAULT_BLOCK_AFTER = 4;

export class ToolLoopGuard {
  private records = new Map<string, Recorded>();
  private readonly warnAfter: number;
  private readonly blockAfter: number;

  constructor(opts?: { warnAfter?: number; blockAfter?: number }) {
    this.warnAfter = opts?.warnAfter ?? DEFAULT_WARN_AFTER;
    this.blockAfter = opts?.blockAfter ?? DEFAULT_BLOCK_AFTER;
  }

  reset(): void {
    this.records.clear();
  }

  signature(toolName: string, input: unknown): string {
    return `${toolName}::${stableJson(canonicalize(input))}`;
  }

  before(toolName: string, input: unknown): LoopDecision {
    const rec = this.records.get(this.signature(toolName, input));
    if (!rec) return { allowed: true };
    if (rec.count >= this.blockAfter) {
      const kind = isFetchOrRead(toolName) ? 'same request/result' : 'identical arguments';
      return {
        allowed: false,
        reason:
          `${toolName} called ${rec.count} times with the ${kind} and no change. ` +
          `Stop repeating this exact call. Use a different URL, path, or command.`,
      };
    }
    if (rec.count >= this.warnAfter) {
      return {
        allowed: true,
        warning: `${toolName} repeated ${rec.count} times with the same arguments. Change the query if you are not making progress.`,
      };
    }
    return { allowed: true };
  }

  after(toolName: string, input: unknown, result: unknown, success: boolean): LoopDecision {
    const sig = this.signature(toolName, input);
    const hash = hashResult(result);
    const prev = this.records.get(sig);
    const failed = success === false;

    if (!prev) {
      this.records.set(sig, { resultHash: hash, count: 1, failed });
      return { allowed: true };
    }

    const sameOutcome = prev.resultHash === hash || (failed && prev.failed);
    if (!sameOutcome) {
      this.records.set(sig, { resultHash: hash, count: 1, failed });
      return { allowed: true };
    }

    const count = prev.count + 1;
    this.records.set(sig, { resultHash: hash, count, failed: prev.failed || failed });

    if (count >= this.blockAfter) {
      return {
        allowed: false,
        reason:
          `${toolName} returned the same result ${count} times. Stop this exact call. Change the path, command, or approach.`,
        warning:
          `${toolName} returned the same result ${count} times. Do not call it again with these exact arguments.`,
      };
    }
    if (count >= this.warnAfter) {
      return {
        allowed: true,
        warning: `${toolName} returned the same result ${count} times. Use what you already have or change the query.`,
      };
    }
    return { allowed: true };
  }
}

function isFetchOrRead(name: string): boolean {
  const n = name.toLowerCase();
  return FETCH_TOOLS.has(n) || READ_TOOLS.has(n) || n.includes('fetch') || n.includes('http');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value && typeof value === 'object') {
    const inObj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(inObj).sort()) {
      out[key] = canonicalize(inObj[key]);
    }
    return out;
  }
  return value;
}

function stableJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function hashResult(result: unknown): string {
  const raw =
    typeof result === 'string'
      ? result
      : stableJson(result);
  // Keep it short; we only need equality, not crypto.
  if (raw.length <= 400) return raw;
  return `${raw.slice(0, 200)}…${raw.slice(-160)}#${raw.length}`;
}
