import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { CliRemoteExecutionConfig } from './remote-execution.js';

const DEFAULT_CHUNK_BYTES = 32 * 1024;

function spawnBuffer(cmd: string, args: string[], cwd: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd });
    const chunks: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => chunks.push(c));
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${cmd} ${args.join(' ')} failed (${code}): ${stderr.trim() || 'no stderr'}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

function decodeNullSeparatedPaths(buf: Buffer): string[] {
  if (!buf.length) return [];
  const raw = buf.toString('utf8');
  const parts = raw.split('\0');
  return parts.filter((p) => p.length > 0);
}

/** Repo root or null if cwd is not inside a git work tree. */
async function gitRepoRoot(cwd: string): Promise<string | null> {
  try {
    const inside = (await spawnBuffer('git', ['rev-parse', '--is-inside-work-tree'], cwd)).toString('utf8').trim();
    if (inside !== 'true') return null;
    const root = (await spawnBuffer('git', ['rev-parse', '--show-toplevel'], cwd)).toString('utf8').trim();
    return root || null;
  } catch {
    return null;
  }
}

/**
 * Tracked + untracked paths that are not ignored by repo/global gitignore rules.
 * Paths are relative to `repoRoot` (POSIX separators as git emits).
 */
async function gitWorkspacePaths(repoRoot: string): Promise<string[]> {
  const tracked = decodeNullSeparatedPaths(await spawnBuffer('git', ['ls-files', '-z'], repoRoot));
  const untracked = decodeNullSeparatedPaths(await spawnBuffer('git', ['ls-files', '-z', '-o', '--exclude-standard'], repoRoot));
  return Array.from(new Set([...tracked, ...untracked])).sort((a, b) => a.localeCompare(b));
}

function getHeaders(authToken?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
}

async function parseJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function ensureRemoteSession(
  config: CliRemoteExecutionConfig,
): Promise<{ sessionId: string; sandboxId?: string }> {
  const sessionId = config.sessionId || randomUUID();
  const response = await fetch(`${config.gatewayUrl.replace(/\/+$/, '')}/sessions`, {
    method: 'POST',
    headers: getHeaders(config.authToken),
    body: JSON.stringify({
      sessionId,
      cwd: config.cwd,
      strategy: config.strategy || 'host_only',
      workspaceRoot: config.workspaceRoot,
    }),
  });
  const payload = await parseJson(response);
  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.message || `Gateway session setup failed (${response.status})`));
  }
  const resolvedSessionId =
    (typeof payload?.sessionId === 'string' && payload.sessionId.trim()) ? payload.sessionId.trim() : sessionId;
  const resolvedSandboxId =
    (typeof payload?.sandboxId === 'string' && payload.sandboxId.trim()) ? payload.sandboxId.trim() : undefined;
  return {
    sessionId: resolvedSessionId,
    sandboxId: resolvedSandboxId,
  };
}

/** Tar whole directory (legacy) with optional extra --exclude globs. */
async function createTarGzFromDirectory(cwd: string, excludeGlobs: string[]): Promise<Buffer> {
  const tarArgs = ['-czf', '-', '.'];
  for (const glob of excludeGlobs) {
    tarArgs.unshift(`--exclude=${glob}`);
  }
  return new Promise((resolve, reject) => {
    const child = spawn('tar', tarArgs, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdoutChunks: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`tar failed with exit code ${code}: ${stderr || 'unknown error'}`));
        return;
      }
      resolve(Buffer.concat(stdoutChunks));
    });
  });
}

/**
 * Tar exactly the given paths (relative to repoRoot) plus tar --exclude globs.
 * Uses GNU tar semantics: paths must use / as separator; no leading ./.
 */
async function createTarGzFromPathList(repoRoot: string, relativePaths: string[], excludeGlobs: string[]): Promise<Buffer> {
  const stdin = Buffer.concat(relativePaths.map((p) => Buffer.from(`${p}\0`, 'utf8')));
  const tarArgs = ['-czf', '-', '--null', '-T', '-'];
  for (const glob of excludeGlobs) {
    tarArgs.unshift(`--exclude=${glob}`);
  }
  return new Promise((resolve, reject) => {
    const child = spawn('tar', tarArgs, { cwd: repoRoot, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdoutChunks: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`tar -T failed with exit code ${code}: ${stderr || 'unknown error'}`));
        return;
      }
      resolve(Buffer.concat(stdoutChunks));
    });
    child.stdin.end(stdin);
  });
}

async function createTarGzBuffer(
  cwd: string,
  excludeGlobs: string[],
  respectGitignore: boolean,
): Promise<Buffer> {
  if (respectGitignore) {
    const root = await gitRepoRoot(cwd);
    if (root) {
      try {
        const paths = await gitWorkspacePaths(root);
        if (paths.length > 0) {
          return createTarGzFromPathList(root, paths, excludeGlobs);
        }
      } catch {
        /* fall through to directory tar */
      }
    }
  }
  return createTarGzFromDirectory(cwd, excludeGlobs);
}

async function uploadChunks(
  gatewayUrl: string,
  authToken: string | undefined,
  sessionId: string,
  archive: Buffer,
  workspaceRoot?: string,
): Promise<void> {
  const baseUrl = gatewayUrl.replace(/\/+$/, '');
  const totalChunks = Math.max(1, Math.ceil(archive.length / DEFAULT_CHUNK_BYTES));
  for (let i = 0; i < totalChunks; i += 1) {
    const start = i * DEFAULT_CHUNK_BYTES;
    const end = Math.min(archive.length, start + DEFAULT_CHUNK_BYTES);
    const chunk = archive.subarray(start, end);
    const response = await fetch(`${baseUrl}/sessions/${encodeURIComponent(sessionId)}/sync`, {
      method: 'POST',
      headers: getHeaders(authToken),
      body: JSON.stringify({
        reset: i === 0,
        final: i === totalChunks - 1,
        chunkBase64: chunk.toString('base64'),
        workspaceRoot,
      }),
    });
    const payload = await parseJson(response);
    if (!response.ok || payload?.success === false) {
      throw new Error(String(payload?.message || `Workspace sync failed at chunk ${i + 1}/${totalChunks}`));
    }
  }
}

export async function syncWorkspaceToSandbox(
  remoteExecution: CliRemoteExecutionConfig,
  cwd: string,
  options: {
    maxMb: number;
    excludeGlobs: string[];
    workspaceRoot?: string;
    /** When true (default), prefer git ls-files (tracked + untracked, honoring .gitignore). */
    respectGitignore?: boolean;
  },
): Promise<{ sessionId: string; sandboxId?: string; workspaceRoot?: string; bytes: number }> {
  const session = await ensureRemoteSession(remoteExecution);
  const sessionId = session.sessionId;
  if (session.sandboxId) {
    remoteExecution.e2bSandboxId = session.sandboxId;
  }
  const archive = await createTarGzBuffer(cwd, options.excludeGlobs, options.respectGitignore !== false);
  const maxBytes = Math.max(1, options.maxMb) * 1024 * 1024;
  if (archive.length > maxBytes) {
    throw new Error(
      `Workspace archive is ${Math.ceil(archive.length / (1024 * 1024))}MB, above sandboxSyncMaxMb=${options.maxMb}. ` +
      `Increase --set-sandbox-sync-max-mb or add more excludes.`,
    );
  }
  await uploadChunks(remoteExecution.gatewayUrl, remoteExecution.authToken, sessionId, archive, options.workspaceRoot);
  return {
    sessionId,
    sandboxId: session.sandboxId,
    workspaceRoot: options.workspaceRoot,
    bytes: archive.length,
  };
}
