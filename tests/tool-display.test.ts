import { describe, expect, it } from 'vitest';
import {
  formatRunSwarmDetailLines,
  formatToolArgs,
  formatToolOutcome,
} from '../src/utils/tool-display.js';

describe('formatToolArgs', () => {
  it('formats read_file with optional line range', () => {
    expect(formatToolArgs('read_file', { path: 'src/a.ts' })).toBe('src/a.ts');
    expect(formatToolArgs('read_file', { path: 'README.md', start_line: 1, end_line: 20 })).toBe(
      'README.md (lines 1–20)',
    );
  });

  it('formats get_context file list', () => {
    expect(
      formatToolArgs('get_context', {
        files: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'],
      }),
    ).toContain('+1 more');
  });

  it('formats run_command', () => {
    expect(formatToolArgs('run_command', { command: 'pnpm test' })).toBe('pnpm test');
  });

  it('parses JSON string input', () => {
    expect(formatToolArgs('list_directory', JSON.stringify({ path: 'src' }))).toBe('src');
  });

  it('formats run_swarm with worker modes and task hints', () => {
    const s = formatToolArgs('run_swarm', {
      subtasks: [
        { worker_type: 'plan', task: 'Summarize swarm.ts' },
        { worker_type: 'plan', task: 'Summarize modes.ts' },
      ],
    });
    expect(s).toContain('2 workers');
    expect(s).toContain('plan+plan');
    expect(s).toContain('swarm.ts');
  });
});

describe('formatToolOutcome', () => {
  it('summarizes read_file success', () => {
    expect(formatToolOutcome('read_file', { lines: 42, size: 1024 }, true)).toContain('42 lines');
  });

  it('shows error message on failure', () => {
    expect(
      formatToolOutcome('read_file', { error: true, success: false, message: 'not found' }, false),
    ).toBe('not found');
  });

  it('summarizes list_directory', () => {
    expect(formatToolOutcome('list_directory', { count: 7 }, true)).toBe('7 item(s)');
  });

  it('summarizes get_context', () => {
    expect(formatToolOutcome('get_context', { totalFiles: 2, estimatedTokens: 3500 }, true)).toMatch(
      /2 file\(s\) in context/,
    );
  });

  it('expands run_swarm into per-worker lines', () => {
    const lines = formatRunSwarmDetailLines({
      success: true,
      parallel: true,
      results: [
        {
          success: true,
          worker_type: 'plan',
          taskId: 'abc12345',
          status: 'completed',
          result: 'Done reading.',
        },
        {
          success: false,
          worker_type: 'engineer',
          taskId: 'def67890',
          status: 'failed',
          result: 'oops',
        },
      ],
    });
    expect(lines[0]).toContain('[1]');
    expect(lines[0]).toContain('plan');
    expect(lines[0]).toContain('id=abc12345');
    expect(lines[1]).toContain('engineer');
    expect(lines[1]).toContain('fail');
  });
});
