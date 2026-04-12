import { describe, expect, it } from 'vitest';
import { formatToolArgs, formatToolOutcome } from '../src/utils/tool-display.js';

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
});
