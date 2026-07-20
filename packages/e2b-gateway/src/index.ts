import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { posix as pathPosix } from 'node:path';
import { URL } from 'node:url';
import { Sandbox } from 'e2b';

type SandboxLike = {
  sandboxId?: string;
  sandboxDomain?: string;
  getHost?: (port: number) => string | Promise<string>;
  commands?: {
    run: (command: string, opts?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
  kill?: (opts?: { requestTimeoutMs?: number }) => Promise<void>;
  close?: () => Promise<void>;
  pause?: (opts?: Record<string, unknown>) => Promise<boolean>;
  setTimeout?: (timeoutMs: number, opts?: Record<string, unknown>) => Promise<void>;
  connect?: (opts?: Record<string, unknown>) => Promise<SandboxLike>;
  getInfo?: () => Promise<{ state?: string }>;
};

type SessionRecord = {
  sessionId: string;
  sandbox: SandboxLike;
  sandboxId: string;
  createdAt: number;
  updatedAt: number;
  /** Wall-clock start of the current continuous *running* window (resets after 23h pause/resume). */
  continuousRunStartedAt: number;
  /** How many times we completed a 23h continuous-run reset. */
  cycleCount: number;
  lastCycleResetAt?: number;
  cycleResetting?: boolean;
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

const port = Number(process.env.PORT || 8787);
const authToken = process.env.XIBECODE_GATEWAY_TOKEN?.trim() || '';
const sandboxTemplate = process.env.XIBECODE_E2B_TEMPLATE?.trim() || '';
/**
 * Inactivity window (ms) before lifecycle action; default 15m (E2B default is 5m).
 * With onTimeout=pause + autoResume, idle sandboxes freeze and wake on next SDK/HTTP activity.
 */
const sandboxTimeoutMs = Math.max(
  60_000,
  Number(process.env.XIBECODE_E2B_SANDBOX_TIMEOUT_MS || 15 * 60 * 1000),
);
/**
 * E2B Pro continuous *running* cap is 24h. Pause+resume resets that window.
 * Default 23h so we cycle before the hard limit kills the run.
 * Set XIBECODE_E2B_MAX_CONTINUOUS_MS=0 to disable the 23h cycle (idle pause still works).
 */
const maxContinuousMs = (() => {
  const raw = process.env.XIBECODE_E2B_MAX_CONTINUOUS_MS;
  if (raw === '0' || raw === 'off' || raw === 'false') return 0;
  const n = Number(raw || 23 * 60 * 60 * 1000);
  return Number.isFinite(n) && n > 0 ? Math.max(60_000, n) : 23 * 60 * 60 * 1000;
})();
const lifecycleOnTimeout =
  process.env.XIBECODE_E2B_ON_TIMEOUT?.trim().toLowerCase() === 'kill'
    ? ('kill' as const)
    : ('pause' as const);
const lifecycleAutoResume =
  process.env.XIBECODE_E2B_AUTO_RESUME?.trim().toLowerCase() !== 'false' &&
  lifecycleOnTimeout === 'pause';
const previewDomain = process.env.XIBECODE_E2B_PREVIEW_DOMAIN?.trim() || 'e2b.dev';
const maxExportBytes = Math.max(
  1,
  Number(process.env.XIBECODE_EXPORT_MAX_MB || 64),
) * 1024 * 1024;
const sessions = new Map<string, SessionRecord>();
const defaultWorkspaceRoot = process.env.XIBECODE_SANDBOX_WORKSPACE_ROOT?.trim() || '/home/user/workspace';
const cycleWaiters = new Map<string, Promise<void>>();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

function normalizePreviewHost(hostOrUrl: string): string {
  const trimmed = String(hostOrUrl || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

async function resolvePreviewHost(session: SessionRecord, targetPort: number): Promise<string> {
  const getter = session.sandbox.getHost;
  if (typeof getter === 'function') {
    const resolved = await getter(targetPort);
    const normalized = normalizePreviewHost(resolved);
    if (normalized) return normalized;
  }
  // Fallback host template for environments where SDK host helpers are unavailable.
  return `https://${targetPort}-${session.sandboxId}.${previewDomain}`;
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

/**
 * Before the E2B 24h continuous-run hard limit: pause (full memory+fs), then connect
 * to resume. That resets the continuous window so long agent sessions can keep going.
 */
async function resetContinuousRunCycle(session: SessionRecord, reason: string): Promise<void> {
  const existing = cycleWaiters.get(session.sessionId);
  if (existing) {
    await existing;
    return;
  }

  const job = (async () => {
    session.cycleResetting = true;
    const elapsedH = (
      (Date.now() - session.continuousRunStartedAt) /
      3_600_000
    ).toFixed(2);
    console.log(
      `[xibecode-e2b-gateway] continuous-run cycle (${reason}): pause→resume sandbox=${session.sandboxId} after ${elapsedH}h`,
    );
    try {
      // 1) Pause — preserves filesystem + memory (default keepMemory)
      if (typeof session.sandbox.pause === 'function') {
        await session.sandbox.pause();
      } else {
        await Sandbox.pause(session.sandboxId);
      }

      // 2) Resume — resets E2B continuous runtime window (Pro ~24h)
      const resumed = await Sandbox.connect(session.sandboxId, {
        timeoutMs: sandboxTimeoutMs,
      });
      session.sandbox = resumed as unknown as SandboxLike;
      session.continuousRunStartedAt = Date.now();
      session.cycleCount += 1;
      session.lastCycleResetAt = Date.now();
      session.updatedAt = Date.now();
      console.log(
        `[xibecode-e2b-gateway] continuous-run cycle #${session.cycleCount} done sandbox=${session.sandboxId}`,
      );
    } catch (err) {
      console.error(
        `[xibecode-e2b-gateway] continuous-run cycle failed sandbox=${session.sandboxId}:`,
        (err as Error)?.message || err,
      );
      throw err;
    } finally {
      session.cycleResetting = false;
      cycleWaiters.delete(session.sessionId);
    }
  })();

  cycleWaiters.set(session.sessionId, job);
  await job;
}

/** Extend idle TTL + enforce 23h continuous-run reset if needed. */
async function touchSession(session: SessionRecord): Promise<void> {
  session.updatedAt = Date.now();

  // Keep inactivity auto-pause clock fresh while the agent is working
  try {
    if (typeof session.sandbox.setTimeout === 'function') {
      await session.sandbox.setTimeout(sandboxTimeoutMs);
    } else {
      await Sandbox.setTimeout(session.sandboxId, sandboxTimeoutMs);
    }
  } catch {
    // Paused (idle auto-pause) — connect resumes and resets E2B continuous-run window
    try {
      const resumed = await Sandbox.connect(session.sandboxId, {
        timeoutMs: sandboxTimeoutMs,
      });
      session.sandbox = resumed as unknown as SandboxLike;
      session.continuousRunStartedAt = Date.now();
      console.log(
        `[xibecode-e2b-gateway] reconnected paused sandbox=${session.sandboxId} (idle auto-pause resume)`,
      );
    } catch {
      /* best-effort; next op may auto-resume via lifecycle.autoResume */
    }
  }

  if (maxContinuousMs > 0) {
    const elapsed = Date.now() - session.continuousRunStartedAt;
    if (elapsed >= maxContinuousMs) {
      await resetContinuousRunCycle(session, `>=${maxContinuousMs}ms`);
    }
  }
}

async function createSession(input: { sessionId?: string; cwd?: string; strategy?: string; workspaceRoot?: string }): Promise<SessionRecord> {
  const sessionId = input.sessionId?.trim() || randomUUID();
  const existing = sessions.get(sessionId);
  if (existing) {
    await touchSession(existing);
    return existing;
  }

  const createOptions = {
    ...(sandboxTemplate ? { template: sandboxTemplate } : {}),
    timeoutMs: sandboxTimeoutMs,
    lifecycle: {
      onTimeout: lifecycleOnTimeout,
      autoResume: lifecycleAutoResume,
    },
  };

  const sandbox = (await Sandbox.create(createOptions)) as unknown as SandboxLike;
  const sandboxId = sandbox.sandboxId || randomUUID();
  const strategy = input.strategy?.trim() === 'sandbox_full' ? 'sandbox_full' : 'host_only';
  const requestedWorkspaceRoot = input.workspaceRoot?.trim() || input.cwd?.trim() || defaultWorkspaceRoot;
  const now = Date.now();
  const session: SessionRecord = {
    sessionId,
    sandbox,
    sandboxId,
    createdAt: now,
    updatedAt: now,
    continuousRunStartedAt: now,
    cycleCount: 0,
    cwd: strategy === 'host_only' ? input.cwd?.trim() || undefined : undefined,
    strategy,
    workspaceRoot: requestedWorkspaceRoot,
    syncStageFile: `/tmp/xibecode-sync-${sessionId}.b64`,
  };
  sessions.set(sessionId, session);

  if (strategy === 'sandbox_full') {
    try {
      const mk = await sandbox.commands?.run(`mkdir -p ${shQuote(requestedWorkspaceRoot)}`, {
        cwd: '/tmp',
        timeoutMs: 60_000,
      });
      if (mk && (mk as any).exitCode && (mk as any).exitCode !== 0) {
        console.warn(
          `[xibecode-e2b-gateway] mkdir workspace failed (${(mk as any).exitCode}): ${String((mk as any).stderr ?? '')}`,
        );
      }
    } catch (e) {
      console.warn(`[xibecode-e2b-gateway] mkdir workspace error: ${(e as Error).message}`);
    }
  }

  return session;
}

async function runInSession(session: SessionRecord, input: ExecRequest): Promise<Record<string, unknown>> {
  await touchSession(session);
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

async function exportWorkspaceArchiveInSession(
  session: SessionRecord,
): Promise<
  | { ok: true; bytes: number; archive: Buffer }
  | { ok: false; statusCode: number; message: string; bytes?: number }
> {
  const archivePath = `/tmp/xibecode-export-${session.sessionId}.tgz`;
  const command =
    `set -e; ` +
    `rm -f ${shQuote(archivePath)}; ` +
    `tar -czf ${shQuote(archivePath)} -C ${shQuote(session.workspaceRoot)} .; ` +
    `size=$(wc -c < ${shQuote(archivePath)} | tr -d ' '); ` +
    `if [ "$size" -gt "${maxExportBytes}" ]; then ` +
    `echo "__XIBECODE_EXPORT_TOO_LARGE__:$size"; ` +
    `rm -f ${shQuote(archivePath)}; ` +
    `exit 9; ` +
    `fi; ` +
    `printf '%s' "$size"; echo "__XIBECODE_SPLIT__"; ` +
    `base64 -w0 ${shQuote(archivePath)}; ` +
    `rm -f ${shQuote(archivePath)}`;
  const result = await runInSession(session, {
    command,
    cwd: '/tmp',
    timeout: 600,
  });
  const stdout = String(result.stdout || '');
  if (!result.success) {
    const marker = stdout.match(/__XIBECODE_EXPORT_TOO_LARGE__:(\d+)/);
    if (marker) {
      return {
        ok: false,
        statusCode: 413,
        message: `Sandbox export exceeds XIBECODE_EXPORT_MAX_MB (${Math.ceil(Number(marker[1]) / (1024 * 1024))}MB)`,
        bytes: Number(marker[1]),
      };
    }
    return {
      ok: false,
      statusCode: 400,
      message: `Failed to export workspace: ${String(result.stderr || result.message || 'unknown error')}`,
    };
  }
  const [bytesPart, encodedPart] = stdout.split('__XIBECODE_SPLIT__');
  if (!encodedPart) {
    return { ok: false, statusCode: 500, message: 'Sandbox export missing archive payload' };
  }
  const bytes = Number((bytesPart || '').trim()) || 0;
  const archive = Buffer.from(encodedPart.trim(), 'base64');
  if (!archive.length) {
    return { ok: false, statusCode: 500, message: 'Sandbox export produced an empty archive' };
  }
  return { ok: true, bytes, archive };
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
        lifecycle: {
          onTimeout: lifecycleOnTimeout,
          autoResume: lifecycleAutoResume,
          inactivityTimeoutMs: sandboxTimeoutMs,
          maxContinuousMs,
          maxContinuousHours:
            maxContinuousMs > 0
              ? Math.round((maxContinuousMs / 3_600_000) * 100) / 100
              : 0,
        },
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
        continuousRunStartedAt: session.continuousRunStartedAt,
        continuousRunAgeMs: Date.now() - session.continuousRunStartedAt,
        cycleCount: session.cycleCount,
        lastCycleResetAt: session.lastCycleResetAt,
      }));
      sendJson(res, 200, { success: true, sessions: data });
      return;
    }

    const bySandboxMatch = url.pathname.match(/^\/sessions\/by-sandbox\/([^/]+)$/);
    if (method === 'GET' && bySandboxMatch) {
      const requestedSandboxId = decodeURIComponent(bySandboxMatch[1] || '').trim();
      if (!requestedSandboxId) {
        sendJson(res, 400, { success: false, error: true, message: 'Missing sandboxId path parameter' });
        return;
      }
      const session = Array.from(sessions.values()).find((s) => s.sandboxId === requestedSandboxId);
      if (!session) {
        sendJson(res, 404, { success: false, error: true, message: `Sandbox not found: ${requestedSandboxId}` });
        return;
      }
      session.updatedAt = Date.now();
      await touchSession(session);
      sendJson(res, 200, {
        success: true,
        sessionId: session.sessionId,
        sandboxId: session.sandboxId,
        strategy: session.strategy,
        cwd: session.cwd,
        workspaceRoot: session.workspaceRoot,
        continuousRunStartedAt: session.continuousRunStartedAt,
        cycleCount: session.cycleCount,
      });
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
        continuousRunStartedAt: session.continuousRunStartedAt,
        cycleCount: session.cycleCount,
        lifecycle: {
          onTimeout: lifecycleOnTimeout,
          autoResume: lifecycleAutoResume,
          inactivityTimeoutMs: sandboxTimeoutMs,
          maxContinuousMs,
        },
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

    const previewMatch = url.pathname.match(/^\/sessions\/([^/]+)\/preview-host$/);
    if (method === 'GET' && previewMatch) {
      const sessionId = decodeURIComponent(previewMatch[1] || '');
      const session = sessions.get(sessionId);
      if (!session) {
        sendJson(res, 404, { success: false, error: true, message: `Session not found: ${sessionId}` });
        return;
      }
      const requestedPort = Number(url.searchParams.get('port') || '3000');
      if (!Number.isFinite(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
        sendJson(res, 400, { success: false, error: true, message: 'Invalid port. Use 1-65535.' });
        return;
      }
      const host = await resolvePreviewHost(session, Math.floor(requestedPort));
      sendJson(res, 200, {
        success: true,
        sessionId: session.sessionId,
        sandboxId: session.sandboxId,
        port: Math.floor(requestedPort),
        host,
      });
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

    const exportMatch = url.pathname.match(/^\/sessions\/([^/]+)\/export$/);
    if (method === 'GET' && exportMatch) {
      const sessionId = decodeURIComponent(exportMatch[1] || '');
      const session = sessions.get(sessionId);
      if (!session) {
        sendJson(res, 404, { success: false, error: true, message: `Session not found: ${sessionId}` });
        return;
      }
      const exported = await exportWorkspaceArchiveInSession(session);
      if (!exported.ok) {
        sendJson(res, exported.statusCode, {
          success: false,
          error: true,
          message: exported.message,
          bytes: exported.bytes,
          maxBytes: maxExportBytes,
          maxMb: Math.ceil(maxExportBytes / (1024 * 1024)),
        });
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Length', String(exported.archive.length));
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="xibecode-sandbox-${session.sandboxId}.tar.gz"`,
      );
      res.setHeader('X-XibeCode-Sandbox-Id', session.sandboxId);
      res.setHeader('X-XibeCode-Workspace-Root', session.workspaceRoot);
      res.end(exported.archive);
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

// Proactive 23h continuous-run check even if traffic is sparse
if (maxContinuousMs > 0) {
  const tickMs = Math.min(
    5 * 60 * 1000,
    Math.max(30_000, Math.floor(maxContinuousMs / 48)),
  );
  setInterval(() => {
    for (const session of sessions.values()) {
      const elapsed = Date.now() - session.continuousRunStartedAt;
      if (elapsed < maxContinuousMs) continue;
      void resetContinuousRunCycle(session, 'background-tick').catch((err) => {
        console.error(
          `[xibecode-e2b-gateway] background cycle failed session=${session.sessionId}:`,
          (err as Error)?.message || err,
        );
      });
    }
  }, tickMs).unref?.();
}

server.listen(port, '0.0.0.0', () => {
  console.log(`[xibecode-e2b-gateway] listening on http://0.0.0.0:${port}`);
  console.log(
    `[xibecode-e2b-gateway] lifecycle onTimeout=${lifecycleOnTimeout} autoResume=${lifecycleAutoResume} inactivityMs=${sandboxTimeoutMs} maxContinuousMs=${maxContinuousMs}`,
  );
  if (!process.env.E2B_API_KEY) {
    console.warn('[xibecode-e2b-gateway] Warning: E2B_API_KEY is not set yet.');
  }
  if (!authToken) {
    console.warn('[xibecode-e2b-gateway] Warning: XIBECODE_GATEWAY_TOKEN is empty; auth is disabled.');
  }
});
