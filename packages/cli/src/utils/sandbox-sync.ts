import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { CliRemoteExecutionConfig } from './remote-execution.js';

const DEFAULT_CHUNK_BYTES = 32 * 1024;

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

async function ensureRemoteSession(config: CliRemoteExecutionConfig): Promise<string> {
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
  return (typeof payload?.sessionId === 'string' && payload.sessionId.trim()) ? payload.sessionId.trim() : sessionId;
}

async function createTarGzBuffer(cwd: string, excludeGlobs: string[]): Promise<Buffer> {
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
  },
): Promise<{ sessionId: string; workspaceRoot?: string; bytes: number }> {
  const sessionId = await ensureRemoteSession(remoteExecution);
  const archive = await createTarGzBuffer(cwd, options.excludeGlobs);
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
    workspaceRoot: options.workspaceRoot,
    bytes: archive.length,
  };
}
