import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CodingToolExecutor, __testing } from '../src/core/tools.js';

function createMockChild(command: string): any {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  let stdin = '';
  let closed = false;
  const closeOnce = (code: number | null) => {
    if (closed) return;
    closed = true;
    child.emit('close', code);
  };

  child.stdin = {
    write: vi.fn((data: string) => {
      stdin += data;
    }),
    end: vi.fn(() => {
      if (command.includes('setTimeout')) return;
      queueMicrotask(() => {
        if (command.includes('process.exit(7)')) {
          closeOnce(7);
          return;
        }
        if (command.includes("'a'.repeat(2000)")) {
          child.stdout.emit('data', Buffer.from('a'.repeat(2000)));
        } else if (command.includes('process.stdin.on')) {
          child.stdout.emit('data', Buffer.from(stdin.trim()));
        } else {
          child.stdout.emit('data', Buffer.from('ok\n'));
        }
        closeOnce(0);
      });
    }),
  };
  child.kill = vi.fn(() => closeOnce(null));
  return child;
}

describe('command output compaction', () => {
  it('keeps small output unchanged', () => {
    const result = __testing.compactCommandOutput('short output', 1000);

    expect(result.output).toBe('short output');
    expect(result.truncated).toBe(false);
    expect(result.originalLength).toBe(12);
  });

  it('truncates large output with head and tail context', () => {
    const input = `${'a'.repeat(1000)}middle${'z'.repeat(1000)}`;
    const result = __testing.compactCommandOutput(input, 500);

    expect(result.truncated).toBe(true);
    expect(result.originalLength).toBe(input.length);
    expect(result.output.length).toBeLessThanOrEqual(500);
    expect(result.output).toContain('output truncated');
    expect(result.output.startsWith('a')).toBe(true);
    expect(result.output.endsWith('z')).toBe(true);
  });
});

describe('run_command execution', () => {
  const executor = new CodingToolExecutor(process.cwd());

  beforeEach(() => {
    vi.mocked(spawn).mockImplementation((_shell: any, args: any) => createMockChild(String(args?.[1] ?? '')));
  });

  it('captures successful command output', async () => {
    const result = await executor.execute('run_command', {
      command: 'node -e "console.log(\'ok\')"',
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('ok');
  });

  it('captures failing command exit codes', async () => {
    const result = await executor.execute('run_command', {
      command: 'node -e "process.exit(7)"',
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(7);
  });

  it('sends stdin input to commands', async () => {
    const result = await executor.execute('run_command', {
      command: 'node -e "process.stdin.on(\'data\', d => process.stdout.write(d.toString().trim()))"',
      input: 'hello from stdin\n',
    });

    expect(result.success).toBe(true);
    expect(result.stdout).toBe('hello from stdin');
  });

  it('marks timed out commands as unsuccessful', async () => {
    const result = await executor.execute('run_command', {
      command: 'node -e "setTimeout(() => {}, 2000)"',
      timeout: 0.1,
    });

    expect(result.success).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.stderr).toContain('Command timed out');
  });

  it('applies max_output_chars through the public tool path', async () => {
    const result = await executor.execute('run_command', {
      command: 'node -e "console.log(\'a\'.repeat(2000))"',
      max_output_chars: 1000,
    });

    expect(result.success).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.originalStdoutLength).toBe(2000);
    expect(result.stdout).toContain('output truncated');
  });
});
