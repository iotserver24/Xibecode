import { describe, it, expect } from 'vitest';
import { parseSchedule, nextRunAt, defaultRepeat } from './schedule.js';

describe('parseSchedule', () => {
  it('parses relative one-shot', () => {
    const s = parseSchedule('30m');
    expect(s.kind).toBe('once_relative');
    expect(s.intervalMs).toBe(30 * 60_000);
    expect(defaultRepeat(s)).toBe(1);
  });

  it('parses interval', () => {
    const s = parseSchedule('every 2h');
    expect(s.kind).toBe('interval');
    expect(s.intervalMs).toBe(2 * 3_600_000);
    expect(defaultRepeat(s)).toBe('forever');
  });

  it('parses cron expression', () => {
    const s = parseSchedule('0 9 * * *');
    expect(s.kind).toBe('cron');
    expect(s.cronFields).toEqual(['0', '9', '*', '*', '*']);
  });

  it('parses ISO timestamp', () => {
    const s = parseSchedule('2026-03-15T09:00:00Z');
    expect(s.kind).toBe('once_at');
    expect(s.atMs).toBe(Date.parse('2026-03-15T09:00:00Z'));
  });

  it('rejects empty', () => {
    expect(() => parseSchedule('')).toThrow();
  });
});

describe('nextRunAt', () => {
  it('advances intervals past now', () => {
    const s = parseSchedule('every 1h');
    const now = Date.parse('2026-01-01T12:00:00Z');
    const last = Date.parse('2026-01-01T10:30:00Z');
    const next = nextRunAt(s, now, last);
    expect(next).toBeGreaterThan(now);
  });
});
