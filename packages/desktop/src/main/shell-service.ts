import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
}

export class ShellService {
  async run(command: string, cwd?: string): Promise<ShellResult> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: cwd ?? process.cwd(),
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120_000,
        env: { ...process.env },
      });

      return {
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        exitCode: 0,
      };
    } catch (err: any) {
      return {
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? '',
        exitCode: err.code ?? 1,
        error: err.message,
      };
    }
  }
}
