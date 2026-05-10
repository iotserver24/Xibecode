import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import { Sandbox as E2BSandbox } from '@e2b/code-interpreter';

type SandboxLike = {
  sandboxId?: string;
  sandboxDomain?: string;
  commands?: {
    run: (command: string, opts?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
  kill?: () => Promise<void>;
  close?: () => Promise<void>;
};

type SessionRecord = {
  sessionId: string;
  sandbox: SandboxLike;
  sandboxId: string;
  createdAt: number;
  updatedAt: number;
  cwd?: string;
  strategy: 'host_only';
};

type ExecRequest = {
  command: string;
  cwd?: string;
  input?: string;
  timeout?: number;
  maxOutputChars?: number;
};

const Sandbox = E2BSandbox as unknown as {
  create: (options?: Record<string, unknown>) => Promise<SandboxLike>;
};

const port = Number(process.env.PORT || 8787);
const authToken = process.env.XIBECODE_GATEWAY_TOKEN?.trim() || '';
const sandboxTemplate = process.env.XIBECODE_E2B_TEMPLATE?.trim() || '';
const sessions = new Map<string, SessionRecord>();

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function getBearerToken(req: IncomingMessage): string {
  const header = req.headers.authorization;
  if (!header) return '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function isAuthorized(req: IncomingMessage): boolean {
  if (!authToken) return true;
  return getBearerToken(req) === authToken;
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

async function createSession(input: { sessionId?: string; cwd?: string; strategy?: string }): Promise<SessionRecord> {
  const sessionId = input.sessionId?.trim() || randomUUID();
  const existing = sessions.get(sessionId);
  if (existing) {
    existing.updatedAt = Date.now();
    return existing;
  }

  const createOptions: Record<string, unknown> = {};
  if (sandboxTemplate) {
    createOptions.template = sandboxTemplate;
  }

  const sandbox = await Sandbox.create(createOptions);
  const sandboxId = sandbox.sandboxId || randomUUID();
  const session: SessionRecord = {
    sessionId,
    sandbox,
    sandboxId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    cwd: input.cwd?.trim() || undefined,
    strategy: 'host_only',
  };
  sessions.set(sessionId, session);
  return session;
}

async function runInSession(session: SessionRecord, input: ExecRequest): Promise<Record<string, unknown>> {
  const timeoutMs = Math.max(1, Number(input.timeout || 120)) * 1000;
  const cwd = input.cwd || session.cwd || '/home/user';
  const result = await session.sandbox.commands?.run(input.command, {
    cwd,
    timeoutMs,
    stdin: input.input,
  });

  const stdout = String((result as any)?.stdout ?? '');
  const stderr = String((result as any)?.stderr ?? '');
  const exitCodeRaw = (result as any)?.exitCode;
  const exitCode = typeof exitCodeRaw === 'number' ? exitCodeRaw : 0;

  session.updatedAt = Date.now();
  return {
    success: exitCode === 0,
    stdout,
    stderr,
    exitCode,
    timedOut: false,
    platform: 'e2b',
    sandboxId: session.sandboxId,
    strategy: session.strategy,
  };
}

async function closeSession(session: SessionRecord): Promise<void> {
  try {
    await session.sandbox.kill?.();
  } catch {
    // Ignore provider shutdown errors so cleanup remains best-effort.
  }
  try {
    await session.sandbox.close?.();
  } catch {
    // Ignore close errors; sandbox may already be terminated.
  }
}

const server = createServer(async (req, res) => {
  try {
    const method = req.method || 'GET';
    const url = new URL(req.url || '/', `http://${req.headers.host || `localhost:${port}`}`);

    // Public health for orchestrators (Coolify, Docker HEALTHCHECK). No secrets in body.
    if (method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {
        success: true,
        service: 'xibecode-e2b-gateway',
        sessions: sessions.size,
        hasE2BKey: Boolean(process.env.E2B_API_KEY),
        authRequired: Boolean(authToken),
      });
      return;
    }

    if (!isAuthorized(req)) {
      sendJson(res, 401, { success: false, error: true, message: 'Unauthorized' });
      return;
    }

    if (method === 'GET' && url.pathname === '/sessions') {
      const data = Array.from(sessions.values()).map((session) => ({
        sessionId: session.sessionId,
        sandboxId: session.sandboxId,
        strategy: session.strategy,
        cwd: session.cwd,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }));
      sendJson(res, 200, { success: true, sessions: data });
      return;
    }

    if (method === 'POST' && url.pathname === '/sessions') {
      const body = await readJson<{ sessionId?: string; cwd?: string; strategy?: string }>(req);
      const session = await createSession(body);
      sendJson(res, 200, {
        success: true,
        sessionId: session.sessionId,
        sandboxId: session.sandboxId,
        strategy: session.strategy,
        cwd: session.cwd,
      });
      return;
    }

    const execMatch = url.pathname.match(/^\/sessions\/([^/]+)\/exec$/);
    if (method === 'POST' && execMatch) {
      const sessionId = decodeURIComponent(execMatch[1] || '');
      const session = sessions.get(sessionId);
      if (!session) {
        sendJson(res, 404, { success: false, error: true, message: `Session not found: ${sessionId}` });
        return;
      }
      const body = await readJson<ExecRequest>(req);
      if (!body.command || typeof body.command !== 'string') {
        sendJson(res, 400, { success: false, error: true, message: 'Missing required field: command' });
        return;
      }
      const result = await runInSession(session, body);
      sendJson(res, 200, result);
      return;
    }

    const sessionMatch = url.pathname.match(/^\/sessions\/([^/]+)$/);
    if (method === 'DELETE' && sessionMatch) {
      const sessionId = decodeURIComponent(sessionMatch[1] || '');
      const session = sessions.get(sessionId);
      if (!session) {
        sendJson(res, 404, { success: false, error: true, message: `Session not found: ${sessionId}` });
        return;
      }
      await closeSession(session);
      sessions.delete(sessionId);
      sendJson(res, 200, { success: true, sessionId });
      return;
    }

    sendJson(res, 404, { success: false, error: true, message: `Not found: ${method} ${url.pathname}` });
  } catch (error: any) {
    sendJson(res, 500, {
      success: false,
      error: true,
      message: error?.message || 'Internal server error',
    });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[xibecode-e2b-gateway] listening on http://0.0.0.0:${port}`);
  if (!process.env.E2B_API_KEY) {
    console.warn('[xibecode-e2b-gateway] Warning: E2B_API_KEY is not set yet.');
  }
  if (!authToken) {
    console.warn('[xibecode-e2b-gateway] Warning: XIBECODE_GATEWAY_TOKEN is empty; auth is disabled.');
  }
});
