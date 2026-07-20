/**
 * ACP client: spawn `xibecode --acp` and talk JSON-RPC over stdio.
 * Primary path for VS Code so IDE and CLI share one harness.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'events';
import * as readline from 'node:readline';
import * as vscode from 'vscode';

export type AcpEvent =
  | { type: 'text'; text: string }
  | { type: 'thinking'; message: string }
  | { type: 'tool_start'; toolCallId: string; name: string; input?: unknown }
  | {
      type: 'tool_end';
      toolCallId: string;
      name: string;
      success: boolean;
      result?: unknown;
    }
  | { type: 'permission_request'; requestId: string; toolName: string; detail?: string }
  | { type: 'error'; message: string }
  | { type: 'status'; message: string };

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
};

export class AcpClient extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: readline.Interface | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private sessionId: string | null = null;
  private started = false;

  constructor(
    private readonly opts: {
      cwd: string;
      binary?: string;
      profile?: string;
    },
  ) {
    super();
  }

  isRunning(): boolean {
    return Boolean(this.proc && !this.proc.killed);
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  async start(): Promise<void> {
    if (this.started) return;
    const bin = this.opts.binary || (await resolveXibecodeBinary());
    const args = ['--acp'];
    if (this.opts.profile) args.push('--profile', this.opts.profile);

    this.proc = spawn(bin, args, {
      cwd: this.opts.cwd,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.started = true;

    this.proc.stderr.on('data', (buf: Buffer) => {
      const line = buf.toString('utf8').trim();
      if (line) this.emit('event', { type: 'status', message: line } satisfies AcpEvent);
    });

    this.rl = readline.createInterface({ input: this.proc.stdout });
    this.rl.on('line', (line) => this.onLine(line));
    this.proc.on('exit', (code) => {
      this.emit('event', {
        type: 'status',
        message: `ACP process exited (${code})`,
      } satisfies AcpEvent);
      this.cleanup();
    });

    await this.request('initialize', {
      protocolVersion: 1,
      clientInfo: { name: 'xibecode-vscode', version: '1.0.0' },
    });

    const res = (await this.request('session/new', {
      cwd: this.opts.cwd,
    })) as { sessionId?: string };
    this.sessionId = res?.sessionId || null;
    if (!this.sessionId) {
      throw new Error('ACP session/new did not return sessionId');
    }
  }

  async prompt(text: string): Promise<string> {
    if (!this.sessionId) await this.start();
    const res = (await this.request(
      'session/prompt',
      {
        sessionId: this.sessionId,
        prompt: [{ type: 'text', text }],
      },
      30 * 60 * 1000,
    )) as { stopReason?: string; content?: string };
    return typeof res?.content === 'string' ? res.content : '';
  }

  async cancel(): Promise<void> {
    try {
      await this.request('agent/cancel', {});
    } catch {
      /* ignore */
    }
  }

  async respondPermission(
    requestId: string,
    choice: 'once' | 'session' | 'always' | 'deny',
  ): Promise<void> {
    await this.request('session/permission', {
      sessionId: this.sessionId,
      requestId,
      choice,
      toolName: '',
    });
  }

  async shutdown(): Promise<void> {
    try {
      await this.request('shutdown', {});
    } catch {
      /* ignore */
    }
    this.cleanup();
  }

  private cleanup(): void {
    try {
      this.rl?.close();
    } catch {
      /* */
    }
    try {
      this.proc?.kill();
    } catch {
      /* */
    }
    this.rl = null;
    this.proc = null;
    this.started = false;
    for (const [, p] of this.pending) {
      p.reject(new Error('ACP closed'));
    }
    this.pending.clear();
  }

  private request(
    method: string,
    params: unknown,
    timeoutMs = 120_000,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.proc?.stdin) {
        reject(new Error('ACP not started'));
        return;
      }
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`ACP timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.proc.stdin.write(
        JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n',
      );
    });
  }

  private onLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: any;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      return;
    }

    // Response
    if (msg.id != null && (msg.result !== undefined || msg.error)) {
      const pending = this.pending.get(Number(msg.id));
      if (pending) {
        this.pending.delete(Number(msg.id));
        if (msg.error) {
          pending.reject(
            new Error(msg.error.message || JSON.stringify(msg.error)),
          );
        } else {
          pending.resolve(msg.result);
        }
      }
      return;
    }

    // Notification
    if (msg.method === 'session/update' && msg.params) {
      this.mapSessionUpdate(msg.params);
    } else if (msg.method === 'agent/chatDelta' && msg.params) {
      const p = msg.params;
      if (typeof p.text === 'string' && p.text) {
        this.emit('event', { type: 'text', text: p.text } satisfies AcpEvent);
      }
    }
  }

  private mapSessionUpdate(p: any): void {
    const kind = p.sessionUpdate || p.update || p.type;
    if (kind === 'permission_request') {
      this.emit('event', {
        type: 'permission_request',
        requestId: p.requestId,
        toolName: p.toolName,
        detail: p.detail,
      } satisfies AcpEvent);
      return;
    }
    if (kind === 'agent_message_chunk' || kind === 'message' || kind === 'text') {
      const t =
        typeof p.text === 'string'
          ? p.text
          : typeof p.content === 'string'
            ? p.content
            : '';
      if (t) this.emit('event', { type: 'text', text: t } satisfies AcpEvent);
      return;
    }
    if (kind === 'tool_call' || kind === 'tool_call_start') {
      this.emit('event', {
        type: 'tool_start',
        toolCallId: p.toolCallId || p.id || String(Date.now()),
        name: p.title || p.name || p.toolName || 'tool',
        input: p.rawInput || p.input,
      } satisfies AcpEvent);
      return;
    }
    if (kind === 'tool_call_update' || kind === 'tool_call_end') {
      this.emit('event', {
        type: 'tool_end',
        toolCallId: p.toolCallId || p.id || '',
        name: p.title || p.name || 'tool',
        success: p.status !== 'failed' && p.success !== false,
        result: p.content || p.result,
      } satisfies AcpEvent);
    }
  }
}

async function resolveXibecodeBinary(): Promise<string> {
  const configured = vscode.workspace
    .getConfiguration('xibecode')
    .get<string>('cliPath');
  if (configured?.trim()) return configured.trim();

  // Prefer PATH
  return 'xibecode';
}
