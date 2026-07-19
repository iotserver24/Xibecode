/**
 * Schedule parsing for cron jobs (Hermes-compatible formats).
 *
 * Supports:
 *   - Relative one-shot: "30m", "2h", "1d"
 *   - Intervals: "every 30m", "every 2h", "every 1d"
 *   - 5-field cron: "0 9 * * *"
 *   - ISO timestamps: "2026-03-15T09:00:00"
 *
 * @module cron/schedule
 */

export type ScheduleKind = 'once_relative' | 'once_at' | 'interval' | 'cron';

export interface ParsedSchedule {
  kind: ScheduleKind;
  /** Human-readable original string. */
  raw: string;
  /** For once_relative / interval: delay in ms. */
  intervalMs?: number;
  /** For once_at: absolute epoch ms. */
  atMs?: number;
  /** For cron: five fields. */
  cronFields?: string[];
}

const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

function parseDurationToken(token: string): number | null {
  const m = token.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([smhd])$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2]!;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n * (UNIT_MS[unit] || 0));
}

/** Parse a schedule string into a structured form. Throws on invalid input. */
export function parseSchedule(input: string): ParsedSchedule {
  const raw = input.trim();
  if (!raw) throw new Error('Empty schedule');

  // ISO timestamp
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const at = Date.parse(raw);
    if (Number.isNaN(at)) throw new Error(`Invalid ISO timestamp: ${raw}`);
    return { kind: 'once_at', raw, atMs: at };
  }

  // every 30m / every 2h
  const every = raw.match(/^every\s+(\d+(?:\.\d+)?\s*[smhd])$/i);
  if (every) {
    const intervalMs = parseDurationToken(every[1]!);
    if (!intervalMs) throw new Error(`Invalid interval: ${raw}`);
    return { kind: 'interval', raw, intervalMs };
  }

  // plain 30m / 2h (one-shot)
  const rel = parseDurationToken(raw);
  if (rel) {
    return { kind: 'once_relative', raw, intervalMs: rel };
  }

  // 5-field cron
  const fields = raw.split(/\s+/);
  if (fields.length === 5) {
    return { kind: 'cron', raw, cronFields: fields };
  }

  throw new Error(
    `Unrecognized schedule "${raw}". Use "30m", "every 2h", "0 9 * * *", or an ISO timestamp.`,
  );
}

/** Compute next run epoch ms given a parsed schedule and optional last run. */
export function nextRunAt(
  schedule: ParsedSchedule,
  fromMs: number = Date.now(),
  lastRunMs?: number | null,
): number {
  switch (schedule.kind) {
    case 'once_relative':
      return fromMs + (schedule.intervalMs || 0);
    case 'once_at':
      return schedule.atMs || fromMs;
    case 'interval': {
      const step = schedule.intervalMs || 60_000;
      if (lastRunMs && lastRunMs > 0) {
        // Align to last run + interval (catch-up if missed)
        let next = lastRunMs + step;
        while (next <= fromMs) next += step;
        return next;
      }
      return fromMs + step;
    }
    case 'cron':
      return nextCronRun(schedule.cronFields!, fromMs);
    default:
      return fromMs + 60_000;
  }
}

/** Minimal 5-field cron next-run (minute hour dom month dow). */
function nextCronRun(fields: string[], fromMs: number): number {
  const [minF, hourF, domF, monF, dowF] = fields;
  // Search up to 366 days ahead, minute granularity
  const start = new Date(fromMs);
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  for (let i = 0; i < 366 * 24 * 60; i++) {
    const d = new Date(start.getTime() + i * 60_000);
    if (!matchField(minF!, d.getMinutes(), 0, 59)) continue;
    if (!matchField(hourF!, d.getHours(), 0, 23)) continue;
    if (!matchField(monF!, d.getMonth() + 1, 1, 12)) continue;
    const domOk = matchField(domF!, d.getDate(), 1, 31);
    const dowOk = matchField(dowF!, d.getDay(), 0, 6); // 0=Sun
    // Standard: if both DOM and DOW are restricted, either may match
    const domStar = domF === '*';
    const dowStar = dowF === '*';
    if (domStar && dowStar) {
      /* both any — ok */
    } else if (domStar) {
      if (!dowOk) continue;
    } else if (dowStar) {
      if (!domOk) continue;
    } else if (!domOk && !dowOk) {
      continue;
    }
    return d.getTime();
  }
  return fromMs + 86_400_000;
}

function matchField(field: string, value: number, min: number, max: number): boolean {
  if (field === '*') return true;
  // lists
  if (field.includes(',')) {
    return field.split(',').some((p) => matchField(p.trim(), value, min, max));
  }
  // step: */n or a-b/n
  if (field.includes('/')) {
    const [range, stepStr] = field.split('/');
    const step = Number(stepStr);
    if (!Number.isFinite(step) || step <= 0) return false;
    const [lo, hi] = expandRange(range!, min, max);
    if (value < lo || value > hi) return false;
    return (value - lo) % step === 0;
  }
  // range a-b
  if (field.includes('-')) {
    const [lo, hi] = expandRange(field, min, max);
    return value >= lo && value <= hi;
  }
  const n = Number(field);
  return Number.isFinite(n) && n === value;
}

function expandRange(range: string, min: number, max: number): [number, number] {
  if (range === '*' || range === '') return [min, max];
  if (range.includes('-')) {
    const [a, b] = range.split('-').map(Number);
    return [a ?? min, b ?? max];
  }
  const n = Number(range);
  return [n, n];
}

/** Default repeat count from schedule kind. */
export function defaultRepeat(schedule: ParsedSchedule): number | 'forever' {
  if (schedule.kind === 'once_relative' || schedule.kind === 'once_at') return 1;
  return 'forever';
}
