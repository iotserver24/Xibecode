import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { posix as pathPosix } from 'node:path';
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
  strategy: 'host_only' | 'sandbox_full';
  workspaceRoot: string;
  syncStageFile: string;
};

type ExecRequest = {
  command: string;
  cwd?: string;
  input?: string;
  timeout?: number;
  maxOutputChars?: number;
};

type SyncRequest = {
  chunkBase64?: string;
  final?: boolean;
  reset?: boolean;
  workspaceRoot?: string;
};

type FileMutationRequest = {
  path: string;
  content?: string;
};

type MoveRequest = {
  source: string;
  destination: string;
};

const Sandbox = E2BSandbox as unknown as {
  create: (options?: Record<string, unknown>) => Promise<SandboxLike>;
};

const port = Number(process.env.PORT || 8787);
const authToken = process.env.XIBECODE_GATEWAY_TOKEN?.trim() || '';
const sandboxTemplate = process.env.XIBECODE_E2B_TEMPLATE?.trim() || '';
const sessions = new Map<string, SessionRecord>();
const defaultWorkspaceRoot = process.env.XIBECODE_SANDBOX_WORKSPACE_ROOT?.trim() || '/home/user/workspace';

function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function resolveSandboxPath(session: SessionRecord, inputPath: string): string {
  const trimmed = inputPath.trim();
  if (!trimmed) throw new Error('Path cannot be empty');
  const normalized = pathPosix.normalize(trimmed);
  if (normalized.includes('..')) {
    throw new Error(`Path traversal is not allowed: ${inputPath}`);
  }

  if (pathPosix.isAbsolute(normalized)) {
    if (session.strategy === 'sandbox_full' && !normalized.startsWith(`${session.workspaceRoot}/`) && normalized !== session.workspaceRoot) {
      throw new Error(`Absolute path outside sandbox workspace is not allowed: ${inputPath}`);
    }
    return normalized;
  }

  return pathPosix.join(session.workspaceRoot, normalized);
}

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

async function createSession(input: { sessionId?: string; cwd?: string; strategy?: string; workspaceRoot?: string }): Promise<SessionRecord> {
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
  const strategy = input.strategy?.trim() === 'sandbox_full' ? 'sandbox_full' : 'host_only';
  const requestedWorkspaceRoot = input.workspaceRoot?.trim() || input.cwd?.trim() || defaultWorkspaceRoot;
  const session: SessionRecord = {
    sessionId,
    sandbox,
    sandboxId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    cwd: strategy === 'host_only' ? input.cwd?.trim() || undefined : undefined,
    strategy,
    workspaceRoot: requestedWorkspaceRoot,
    syncStageFile: `/tmp/xibecode-sync-${sessionId}.b64`,
  };
  sessions.set(sessionId, session);
  return session;
}

async function runInSession(session: SessionRecord, input: ExecRequest): Promise<Record<string, unknown>> {
  const timeoutMs = Math.max(1, Number(input.timeout || 120)) * 1000;
  let cwd = input.cwd || session.cwd || session.workspaceRoot || '/home/user';
  if (session.strategy === 'sandbox_full' && cwd && !pathPosix.isAbsolute(cwd)) {
    cwd = pathPosix.join(session.workspaceRoot, pathPosix.normalize(cwd));
  }
  if (
    session.strategy === 'sandbox_full' &&
    pathPosix.isAbsolute(cwd) &&
    cwd !== session.workspaceRoot &&
    !cwd.startsWith(`${session.workspaceRoot}/`) &&
    !cwd.startsWith('/tmp') &&
    !cwd.startsWith('/home/user')
  ) {
    return {
      success: false,
      error: true,
      message: `[invalid_argument] cwd '${cwd}' is outside sandbox workspace`,
      stdout: '',
      stderr: `[invalid_argument] cwd '${cwd}' is outside sandbox workspace`,
      exitCode: 2,
      timedOut: false,
      platform: 'e2b',
      sandboxId: session.sandboxId,
      strategy: session.strategy,
      workspaceRoot: session.workspaceRoot,
    };
  }
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
    workspaceRoot: session.workspaceRoot,
  };
}

async function syncWorkspaceChunk(session: SessionRecord, request: SyncRequest): Promise<Record<string, unknown>> {
  const reset = Boolean(request.reset);
  const final = Boolean(request.final);
  const chunkBase64 = request.chunkBase64 || '';

  if (request.workspaceRoot?.trim()) {
    session.workspaceRoot = request.workspaceRoot.trim();
  }

  if (reset) {
    await runInSession(session, {
      command: `rm -f ${shQuote(session.syncStageFile)}`,
      cwd: '/tmp',
      timeout: 30,
    });
  }

  if (chunkBase64.length > 0) {
    const appendCommand = `mkdir -p /tmp && printf '%s' ${shQuote(chunkBase64)} >> ${shQuote(session.syncStageFile)}`;
    const appendResult = await runInSession(session, {
      command: appendCommand,
      cwd: '/tmp',
      timeout: 60,
    });
    if (!appendResult.success) return appendResult;
  }

  if (final) {
    const extractCommand =
      `mkdir -p ${shQuote(session.workspaceRoot)} && ` +
      `base64 -d ${shQuote(session.syncStageFile)} | tar -xzf - -C ${shQuote(session.workspaceRoot)} && ` +
      `rm -f ${shQuote(session.syncStageFile)}`;
    const extractResult = await runInSession(session, {
      command: extractCommand,
      cwd: '/tmp',
      timeout: 300,
    });
    if (!extractResult.success) return extractResult;
  }

  session.updatedAt = Date.now();
  return {
    success: true,
    sessionId: session.sessionId,
    final,
    workspaceRoot: session.workspaceRoot,
    strategy: session.strategy,
  };
}

async function readFileInSession(
  session: SessionRecord,
  filePath: string,
  startLine?: number,
  endLine?: number,
): Promise<Record<string, unknown>> {
  const targetPath = resolveSandboxPath(session, filePath);
  const start = typeof startLine === 'number' ? Math.max(1, Math.floor(startLine)) : undefined;
  const end = typeof endLine === 'number' ? Math.max(1, Math.floor(endLine)) : undefined;
  const contentCommand =
    start && end
      ? `sed -n '${start},${end}p' ${shQuote(targetPath)} | base64 -w0`
      : `base64 -w0 ${shQuote(targetPath)}`;
  const command =
    `if [ ! -f ${shQuote(targetPath)} ]; then echo "__XIBECODE_NOT_FILE__"; exit 3; fi; ` +
    `wc -l < ${shQuote(targetPath)} | tr -d ' ' && echo "__XIBECODE_SPLIT__" && ${contentCommand}`;
  const result = await runInSession(session, {
    command,
    cwd: session.workspaceRoot,
    timeout: 60,
  });
  if (!result.success) {
    return {
      error: true,
      success: false,
      message: `Failed to read ${filePath}: ${String(result.stderr || result.message || 'unknown error')}`,
    };
  }
  const raw = String(result.stdout || '');
  if (raw.includes('__XIBECODE_NOT_FILE__')) {
    return { error: true, success: false, message: `Not a file: ${filePath}` };
  }
  const [linesPart, encodedPart] = raw.split('__XIBECODE_SPLIT__');
  const totalLines = Number((linesPart || '').trim()) || 0;
  const content = Buffer.from((encodedPart || '').trim(), 'base64').toString('utf8');
  if (start && end) {
    return {
      success: true,
      path: filePath,
      content,
      lines: end - start + 1,
      total_lines: totalLines,
      partial: true,
    };
  }
  return {
    success: true,
    path: filePath,
    content,
    lines: totalLines,
    size: content.length,
  };
}

async function writeFileInSession(session: SessionRecord, filePath: string, content: string): Promise<Record<string, unknown>> {
  const targetPath = resolveSandboxPath(session, filePath);
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  const command =
    `mkdir -p ${shQuote(pathPosix.dirname(targetPath))} && ` +
    `printf '%s' ${shQuote(encoded)} | base64 -d > ${shQuote(targetPath)}`;
  const result = await runInSession(session, {
    command,
    cwd: session.workspaceRoot,
    timeout: 120,
  });
  if (!result.success) {
    return {
      error: true,
      success: false,
      message: `Failed to write ${filePath}: ${String(result.stderr || result.message || 'unknown error')}`,
    };
  }
  return {
    success: true,
    path: filePath,
    lines: content.split('\n').length,
    size: content.length,
  };
}

async function deleteFileInSession(session: SessionRecord, filePath: string): Promise<Record<string, unknown>> {
  const targetPath = resolveSandboxPath(session, filePath);
  const result = await runInSession(session, {
    command: `rm -rf ${shQuote(targetPath)}`,
    cwd: session.workspaceRoot,
    timeout: 60,
  });
  if (!result.success) {
    return {
      error: true,
      success: false,
      message: `Failed to delete ${filePath}: ${String(result.stderr || result.message || 'unknown error')}`,
    };
  }
  return { success: true, path: filePath };
}

async function listDirectoryInSession(session: SessionRecord, dirPath: string): Promise<Record<string, unknown>> {
  const targetPath = resolveSandboxPath(session, dirPath || '.');
  const command =
    `if [ ! -d ${shQuote(targetPath)} ]; then echo "__XIBECODE_NOT_DIR__"; exit 3; fi; ` +
    `for item in ${shQuote(targetPath)}/*; do ` +
    `if [ ! -e "$item" ]; then continue; fi; ` +
    `name=$(basename "$item"); ` +
    `if [ -d "$item" ]; then type="directory"; else type="file"; fi; ` +
    `size=$(wc -c < "$item" 2>/dev/null || echo 0); ` +
    `printf '%s\t%s\t%s\n' "$name" "$type" "$size"; ` +
    `done`;
  const result = await runInSession(session, {
    command,
    cwd: session.workspaceRoot,
    timeout: 60,
  });
  if (!result.success) {
    const stderr = String(result.stderr || result.message || 'unknown error');
    if (stderr.includes('__XIBECODE_NOT_DIR__')) {
      return { error: true, success: false, message: `Not a directory: ${dirPath}` };
    }
    return { error: true, success: false, message: `Failed to list directory ${dirPath}: ${stderr}` };
  }
  const entries = String(result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, type, size] = line.split('\t');
      return {
        name,
        type: type === 'directory' ? 'directory' : 'file',
        size: Number(size || '0') || 0,
      };
    });
  return {
    success: true,
    path: dirPath,
    entries,
    count: entries.length,
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
        workspaceRoot: session.workspaceRoot,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }));
      sendJson(res, 200, { success: true, sessions: data });
      return;
    }

    if (method === 'POST' && url.pathname === '/sessions') {
      const body = await readJson<{ sessionId?: string; cwd?: string; strategy?: string; workspaceRoot?: string }>(req);
      const session = await createSession(body);
      sendJson(res, 200, {
        success: true,
        sessionId: session.sessionId,
        sandboxId: session.sandboxId,
        strategy: session.strategy,
        cwd: session.cwd,
        workspaceRoot: session.workspaceRoot,
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

    const syncMatch = url.pathname.match(/^\/sessions\/([^/]+)\/sync$/);
    if (method === 'POST' && syncMatch) {
      const sessionId = decodeURIComponent(syncMatch[1] || '');
      const session = sessions.get(sessionId);
      if (!session) {
        sendJson(res, 404, { success: false, error: true, message: `Session not found: ${sessionId}` });
        return;
      }
      const body = await readJson<SyncRequest>(req);
      const result = await syncWorkspaceChunk(session, body);
      sendJson(res, 200, result);
      return;
    }

    const fileMatch = url.pathname.match(/^\/sessions\/([^/]+)\/file$/);
    if (fileMatch && method === 'GET') {
      const sessionId = decodeURIComponent(fileMatch[1] || '');
      const session = sessions.get(sessionId);
      if (!session) {
        sendJson(res, 404, { success: false, error: true, message: `Session not found: ${sessionId}` });
        return;
      }
      const queryPath = url.searchParams.get('path');
      if (!queryPath) {
        sendJson(res, 400, { success: false, error: true, message: 'Missing required query parameter: path' });
        return;
      }
      const startLine = Number(url.searchParams.get('start_line') || '');
      const endLine = Number(url.searchParams.get('end_line') || '');
      const result = await readFileInSession(
        session,
        queryPath,
        Number.isFinite(startLine) ? startLine : undefined,
        Number.isFinite(endLine) ? endLine : undefined,
      );
      sendJson(res, result.success === false ? 400 : 200, result);
      return;
    }

    if (fileMatch && method === 'PUT') {
      const sessionId = decodeURIComponent(fileMatch[1] || '');
      const session = sessions.get(sessionId);
      if (!session) {
        sendJson(res, 404, { success: false, error: true, message: `Session not found: ${sessionId}` });
        return;
      }
      const body = await readJson<FileMutationRequest>(req);
      if (!body.path || typeof body.path !== 'string') {
        sendJson(res, 400, { success: false, error: true, message: 'Missing required field: path' });
        return;
      }
      if (typeof body.content !== 'string') {
        sendJson(res, 400, { success: false, error: true, message: 'Missing required field: content' });
        return;
      }
      const result = await writeFileInSession(session, body.path, body.content);
      sendJson(res, result.success === false ? 400 : 200, result);
      return;
    }

    if (fileMatch && method === 'DELETE') {
      const sessionId = decodeURIComponent(fileMatch[1] || '');
      const session = sessions.get(sessionId);
      if (!session) {
        sendJson(res, 404, { success: false, error: true, message: `Session not found: ${sessionId}` });
        return;
      }
      const body = await readJson<FileMutationRequest>(req);
      if (!body.path || typeof body.path !== 'string') {
        sendJson(res, 400, { success: false, error: true, message: 'Missing required field: path' });
        return;
      }
      const result = await deleteFileInSession(session, body.path);
      sendJson(res, result.success === false ? 400 : 200, result);
      return;
    }

    const listMatch = url.pathname.match(/^\/sessions\/([^/]+)\/list$/);
    if (method === 'GET' && listMatch) {
      const sessionId = decodeURIComponent(listMatch[1] || '');
      const session = sessions.get(sessionId);
      if (!session) {
        sendJson(res, 404, { success: false, error: true, message: `Session not found: ${sessionId}` });
        return;
      }
      const queryPath = url.searchParams.get('path') || '.';
      const result = await listDirectoryInSession(session, queryPath);
      sendJson(res, result.success === false ? 400 : 200, result);
      return;
    }

    const directoryMatch = url.pathname.match(/^\/sessions\/([^/]+)\/directory$/);
    if (method === 'POST' && directoryMatch) {
      const sessionId = decodeURIComponent(directoryMatch[1] || '');
      const session = sessions.get(sessionId);
      if (!session) {
        sendJson(res, 404, { success: false, error: true, message: `Session not found: ${sessionId}` });
        return;
      }
      const body = await readJson<FileMutationRequest>(req);
      if (!body.path || typeof body.path !== 'string') {
        sendJson(res, 400, { success: false, error: true, message: 'Missing required field: path' });
        return;
      }
      const targetPath = resolveSandboxPath(session, body.path);
      const result = await runInSession(session, {
        command: `mkdir -p ${shQuote(targetPath)}`,
        cwd: session.workspaceRoot,
        timeout: 60,
      });
      sendJson(res, result.success ? 200 : 400, result.success ? { success: true, path: body.path } : result);
      return;
    }

    const moveMatch = url.pathname.match(/^\/sessions\/([^/]+)\/move$/);
    if (method === 'POST' && moveMatch) {
      const sessionId = decodeURIComponent(moveMatch[1] || '');
      const session = sessions.get(sessionId);
      if (!session) {
        sendJson(res, 404, { success: false, error: true, message: `Session not found: ${sessionId}` });
        return;
      }
      const body = await readJson<MoveRequest>(req);
      if (!body.source || typeof body.source !== 'string' || !body.destination || typeof body.destination !== 'string') {
        sendJson(res, 400, { success: false, error: true, message: 'Missing required fields: source, destination' });
        return;
      }
      const source = resolveSandboxPath(session, body.source);
      const destination = resolveSandboxPath(session, body.destination);
      const result = await runInSession(session, {
        command: `mkdir -p ${shQuote(pathPosix.dirname(destination))} && mv ${shQuote(source)} ${shQuote(destination)}`,
        cwd: session.workspaceRoot,
        timeout: 60,
      });
      sendJson(
        res,
        result.success ? 200 : 400,
        result.success ? { success: true, source: body.source, destination: body.destination } : result,
      );
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
