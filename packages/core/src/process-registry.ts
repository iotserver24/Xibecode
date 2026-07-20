/**
 * Tracked background shell processes (Hermes-style process sessions).
 * Used so `pnpm run dev` / servers return immediately instead of hanging the agent.
 */

import { spawn, type ChildProcess } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const MAX_OUTPUT_CHARS = 200_000;
const MAX_PROCESSES = 64;
const FINISHED_TTL_MS = 30 * 60 * 1000;

export interface ProcessSession {
  id: string;
  command: string;
  cwd: string;
  pid?: number;
  startedAt: number;
  finishedAt?: number;
  exitCode?: number | null;
  status: 'running' | 'exited' | 'killed' | 'error';
  stdout: string;
  stderr: string;
  error?: string;
}

export interface SpawnBackgroundOptions {
  command: string;
  cwd: string;
  platform?: string;
  env?: NodeJS.ProcessEnv;
}

function nextId(): string {
  return `proc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function trimBuffer(buf: string): string {
  if (buf.length <= MAX_OUTPUT_CHARS) return buf;
  return buf.slice(buf.length - MAX_OUTPUT_CHARS);
}

/** Dev servers / watchers that must not block the agent in the foreground. */
export function looksLikeLongLivedCommand(command: string): boolean {
  const c = command.trim();
  if (!c) return false;
  // Already shell-backgrounded
  if (/(?:^|[\s;|&])(?:nohup\s+)?(?:.+)&\s*$/.test(c) && !c.includes('&&')) {
    // trailing & alone is weak signal; still check known patterns
  }
  const patterns = [
    /\b(pnpm|npm|yarn|bun|bunx|npx)\s+(run\s+)?(dev|start|serve)\b/i,
    /\b(pnpm|npm|yarn)\s+start\b/i,
    /\bnext\s+dev\b/i,
    /\bvite(\s|$)/i,
    /\bwebpack(-dev-server)?\b/i,
    /\bnodemon\b/i,
    /\bts-node-dev\b/i,
    /\b--watch\b/i,
    /\bwatch\s+mode\b/i,
    /\bpython[23]?\s+-m\s+http\.server\b/i,
    /\buvicorn\b.*--reload\b/i,
    /\bflask\s+run\b/i,
    /\bdjango-admin\s+runserver\b/i,
    /\bcargo\s+watch\b/i,
    /\bdocker\s+compose\s+up\b(?!.*\s-d\b)/i,
    /\bdocker-compose\s+up\b(?!.*\s-d\b)/i,
  ];
  return patterns.some((p) => p.test(c));
}

export class ProcessRegistry {
  private sessions = new Map<string, ProcessSession>();
  private children = new Map<string, ChildProcess>();
  /** Foreground children (for /stop interrupt). */
  private foreground = new Set<ChildProcess>();

  trackForeground(child: ChildProcess): () => void {
    this.foreground.add(child);
    const release = () => this.foreground.delete(child);
    child.once('close', release);
    child.once('error', release);
    return release;
  }

  /** Kill all in-flight foreground commands (gateway /stop). */
  killAllForeground(signal: NodeJS.Signals = 'SIGTERM'): number {
    let n = 0;
    for (const child of [...this.foreground]) {
      try {
        this.killProcessTree(child, signal);
        n++;
      } catch {
        /* ignore */
      }
    }
    this.foreground.clear();
    return n;
  }

  spawnBackground(opts: SpawnBackgroundOptions): ProcessSession {
    this.prune();
    if (this.sessions.size >= MAX_PROCESSES) {
      // Drop oldest finished first
      this.prune(true);
    }

    const id = nextId();
    const platform = opts.platform || os.platform();
    const shell = platform === 'win32' ? 'powershell.exe' : '/bin/sh';
    const args =
      platform === 'win32' ? ['-Command', opts.command] : ['-c', opts.command];

    const session: ProcessSession = {
      id,
      command: opts.command,
      cwd: opts.cwd,
      startedAt: Date.now(),
      status: 'running',
      stdout: '',
      stderr: '',
    };

    try {
      const child = spawn(shell, args, {
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env },
        detached: platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      session.pid = child.pid;
      this.children.set(id, child);
      this.sessions.set(id, session);

      child.stdout?.on('data', (d: Buffer) => {
        session.stdout = trimBuffer(session.stdout + d.toString());
      });
      child.stderr?.on('data', (d: Buffer) => {
        session.stderr = trimBuffer(session.stderr + d.toString());
      });

      child.on('close', (code) => {
        session.status = session.status === 'killed' ? 'killed' : 'exited';
        session.exitCode = code;
        session.finishedAt = Date.now();
        this.children.delete(id);
      });

      child.on('error', (err) => {
        session.status = 'error';
        session.error = err.message;
        session.finishedAt = Date.now();
        this.children.delete(id);
      });

      // Don't keep the agent process alive solely for this child
      child.unref();
    } catch (err: any) {
      session.status = 'error';
      session.error = err?.message || String(err);
      session.finishedAt = Date.now();
      this.sessions.set(id, session);
    }

    return session;
  }

  get(id: string): ProcessSession | undefined {
    return this.sessions.get(id);
  }

  list(onlyRunning = false): ProcessSession[] {
    const all = [...this.sessions.values()].sort(
      (a, b) => b.startedAt - a.startedAt,
    );
    return onlyRunning ? all.filter((s) => s.status === 'running') : all;
  }

  poll(
    id: string,
    opts?: { tail?: number },
  ): {
    found: boolean;
    session?: ProcessSession;
    stdoutTail?: string;
    stderrTail?: string;
  } {
    const session = this.sessions.get(id);
    if (!session) return { found: false };
    const tail = Math.max(200, Math.min(opts?.tail ?? 4000, 50_000));
    return {
      found: true,
      session: { ...session },
      stdoutTail: session.stdout.slice(-tail),
      stderrTail: session.stderr.slice(-tail),
    };
  }

  kill(id: string): { ok: boolean; message: string } {
    const session = this.sessions.get(id);
    if (!session) return { ok: false, message: `Unknown process id: ${id}` };
    const child = this.children.get(id);
    if (!child || session.status !== 'running') {
      return {
        ok: true,
        message: `Process ${id} already ${session.status}`,
      };
    }
    try {
      session.status = 'killed';
      this.killProcessTree(child, 'SIGTERM');
      // Escalate if needed
      setTimeout(() => {
        if (this.children.has(id)) {
          try {
            this.killProcessTree(this.children.get(id)!, 'SIGKILL');
          } catch {
            /* ignore */
          }
        }
      }, 2000);
      return { ok: true, message: `Sent SIGTERM to ${id} (pid ${session.pid})` };
    } catch (err: any) {
      return { ok: false, message: err?.message || String(err) };
    }
  }

  private killProcessTree(
    child: ChildProcess,
    signal: NodeJS.Signals,
  ): void {
    if (!child.pid) {
      child.kill(signal);
      return;
    }
    if (os.platform() === 'win32') {
      try {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } catch {
        child.kill(signal);
      }
      return;
    }
    try {
      // Negative PID = process group when detached
      process.kill(-child.pid, signal);
    } catch {
      try {
        child.kill(signal);
      } catch {
        /* ignore */
      }
    }
  }

  private prune(force = false): void {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (s.status === 'running') continue;
      if (force || (s.finishedAt && now - s.finishedAt > FINISHED_TTL_MS)) {
        this.sessions.delete(id);
        this.children.delete(id);
      }
    }
  }
}

/** Singleton used by CodingToolExecutor (local process tracking). */
export const globalProcessRegistry = new ProcessRegistry();

export function processLogDir(): string {
  const home = process.env.XIBECODE_HOME || path.join(os.homedir(), '.xibecode');
  const dir = path.join(home, 'daemon', 'processes');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
  return dir;
}
