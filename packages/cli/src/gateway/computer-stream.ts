/**
 * View-only Chromium screencast for the Computer pane.
 * Talks to agent-browser's localhost WebSocket and never injects input.
 */

import { spawn } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import WebSocket from 'ws';

export const DEFAULT_STREAM_PORT = 9223;
export const DEFAULT_MAX_FPS = 8;

export function streamPort(): number {
  const raw = Number(process.env.AGENT_BROWSER_STREAM_PORT);
  if (Number.isFinite(raw) && raw >= 1 && raw <= 65535) return Math.floor(raw);
  return DEFAULT_STREAM_PORT;
}

export function streamWsUrl(port = streamPort()): string {
  return `ws://127.0.0.1:${port}/?pacing=ack&maxFps=${DEFAULT_MAX_FPS}`;
}

export function encodeSse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

/** True if a client-to-browser payload would control the page. We never send these. */
export function isInputMessage(msg: unknown): boolean {
  if (!msg || typeof msg !== 'object') return false;
  const t = String((msg as { type?: string }).type || '');
  return t.startsWith('input_');
}

export type StreamStatus = {
  enabled?: boolean;
  port?: number;
  connected?: boolean;
  screencasting?: boolean;
  error?: string;
};

function runAgentBrowser(
  args: string[],
  timeoutMs = 8_000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('agent-browser', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    const t = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }, timeoutMs);
    child.stdout?.on('data', (c) => {
      stdout += String(c);
    });
    child.stderr?.on('data', (c) => {
      stderr += String(c);
    });
    child.on('error', (err) => {
      clearTimeout(t);
      resolve({ code: 127, stdout, stderr: err.message });
    });
    child.on('close', (code) => {
      clearTimeout(t);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function readStreamStatus(): Promise<StreamStatus> {
  const r = await runAgentBrowser(['stream', 'status', '--json']);
  if (r.code !== 0) {
    return { enabled: false, error: (r.stderr || r.stdout || 'status failed').slice(0, 200) };
  }
  try {
    return JSON.parse(r.stdout) as StreamStatus;
  } catch {
    return { enabled: false, error: 'bad status json' };
  }
}

export async function ensureAgentBrowserStream(
  port = streamPort(),
): Promise<StreamStatus> {
  const current = await readStreamStatus();
  if (current.enabled && (current.port == null || current.port === port)) {
    return current;
  }
  const enabled = await runAgentBrowser(['stream', 'enable', '--port', String(port)]);
  if (enabled.code !== 0) {
    return {
      enabled: false,
      port,
      error: (enabled.stderr || enabled.stdout || 'stream enable failed').slice(0, 200),
    };
  }
  return readStreamStatus();
}

export function pipeAgentBrowserScreencast(
  req: IncomingMessage,
  res: ServerResponse,
  opts?: { port?: number },
): void {
  const port = opts?.port ?? streamPort();
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });

  const write = (obj: unknown): boolean => {
    if (res.writableEnded) return false;
    return res.write(encodeSse(obj));
  };

  write({ type: 'status', connected: false, screencasting: false, port });

  let ws: WebSocket | null = null;
  let closed = false;
  let latest: { seq: number; data: string; metadata?: unknown } | null = null;
  let flushing = false;

  const flush = () => {
    if (flushing || !latest || closed) return;
    const frame = latest;
    latest = null;
    flushing = true;
    write({
      type: 'frame',
      seq: frame.seq,
      data: frame.data,
      metadata: frame.metadata,
    });
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ack', seq: frame.seq }));
      }
    } catch {
      /* ignore */
    }
    flushing = false;
    if (latest) setImmediate(flush);
  };

  const openWs = () => {
    if (closed) return;
    try {
      ws = new WebSocket(streamWsUrl(port), { origin: 'http://127.0.0.1' });
    } catch (err) {
      write({
        type: 'status',
        connected: false,
        screencasting: false,
        port,
        error: err instanceof Error ? err.message : 'ws open failed',
      });
      return;
    }

    ws.on('open', () => {
      write({ type: 'status', connected: true, screencasting: true, port });
      try {
        ws?.send(JSON.stringify({ type: 'config', pacing: 'ack', maxFps: DEFAULT_MAX_FPS }));
      } catch {
        /* ignore */
      }
    });

    ws.on('message', (raw) => {
      let msg: { type?: string; seq?: number; data?: string; metadata?: unknown; connected?: boolean; screencasting?: boolean };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      if (isInputMessage(msg)) return;
      if (msg.type === 'frame' && typeof msg.data === 'string') {
        latest = {
          seq: Number(msg.seq) || 0,
          data: msg.data,
          metadata: msg.metadata,
        };
        flush();
        return;
      }
      if (msg.type === 'status') {
        write({
          type: 'status',
          connected: Boolean(msg.connected),
          screencasting: Boolean(msg.screencasting),
          port,
        });
      }
    });

    ws.on('close', () => {
      write({ type: 'status', connected: false, screencasting: false, port });
    });
    ws.on('error', () => {
      write({
        type: 'status',
        connected: false,
        screencasting: false,
        port,
        error: 'stream error',
      });
    });
  };

  void ensureAgentBrowserStream(port)
    .then((status) => {
      if (closed) return;
      write({
        type: 'status',
        connected: Boolean(status.connected),
        screencasting: Boolean(status.screencasting || status.enabled),
        port: status.port || port,
        error: status.error,
      });
      openWs();
    })
    .catch(() => {
      if (!closed) openWs();
    });

  const ping = setInterval(() => {
    if (!res.writableEnded) res.write(`: ping ${Date.now()}\n\n`);
  }, 15_000);

  const shutdown = () => {
    if (closed) return;
    closed = true;
    clearInterval(ping);
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    ws = null;
  };

  req.on('close', shutdown);
  res.on('close', shutdown);
}
