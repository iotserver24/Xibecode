import type { CliRemoteExecutionConfig } from './remote-execution.js';

function getHeaders(authToken?: string): Record<string, string> {
  const headers: Record<string, string> = {};
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

function normalizeUrl(hostOrUrl: string): string {
  const raw = String(hostOrUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  return `https://${raw}`;
}

export async function fetchPreviewHost(
  remoteExecution: CliRemoteExecutionConfig,
  port: number,
): Promise<string | undefined> {
  if (!remoteExecution.sessionId) return undefined;
  const base = remoteExecution.gatewayUrl.replace(/\/+$/, '');
  const response = await fetch(
    `${base}/sessions/${encodeURIComponent(remoteExecution.sessionId)}/preview-host?port=${encodeURIComponent(String(port))}`,
    {
      method: 'GET',
      headers: getHeaders(remoteExecution.authToken),
    },
  );
  const payload = await parseJson(response);
  if (!response.ok || payload?.success === false) {
    return undefined;
  }
  if (typeof payload?.sandboxId === 'string' && payload.sandboxId.trim()) {
    remoteExecution.e2bSandboxId = payload.sandboxId.trim();
  }
  if (typeof payload?.host === 'string' && payload.host.trim()) {
    return normalizeUrl(payload.host);
  }
  if (remoteExecution.e2bSandboxId) {
    return `https://${port}-${remoteExecution.e2bSandboxId}.e2b.dev`;
  }
  return undefined;
}

export async function downloadSandboxExportArchive(
  remoteExecution: CliRemoteExecutionConfig,
  sessionId?: string,
): Promise<Buffer> {
  const targetSession = sessionId || remoteExecution.sessionId;
  if (!targetSession) {
    throw new Error('Missing sandbox session ID. Provide --session or run xc cloud first.');
  }
  const base = remoteExecution.gatewayUrl.replace(/\/+$/, '');
  const response = await fetch(`${base}/sessions/${encodeURIComponent(targetSession)}/export`, {
    method: 'GET',
    headers: getHeaders(remoteExecution.authToken),
  });
  if (!response.ok) {
    const payload = await parseJson(response);
    throw new Error(String(payload?.message || `Sandbox export failed (${response.status})`));
  }
  const bytes = await response.arrayBuffer();
  return Buffer.from(bytes);
}

export async function resolveSessionBySandboxId(
  remoteExecution: CliRemoteExecutionConfig,
  sandboxId: string,
): Promise<{ sessionId: string; sandboxId: string; workspaceRoot?: string; strategy?: string }> {
  const value = sandboxId.trim();
  if (!value) {
    throw new Error('Sandbox ID cannot be empty.');
  }
  const base = remoteExecution.gatewayUrl.replace(/\/+$/, '');
  const response = await fetch(`${base}/sessions/by-sandbox/${encodeURIComponent(value)}`, {
    method: 'GET',
    headers: getHeaders(remoteExecution.authToken),
  });
  const payload = await parseJson(response);
  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.message || `Failed to resolve sandbox ${value} (${response.status})`));
  }
  const sessionId = String(payload?.sessionId || '').trim();
  const resolvedSandboxId = String(payload?.sandboxId || '').trim();
  if (!sessionId || !resolvedSandboxId) {
    throw new Error(`Gateway did not return valid session metadata for sandbox ${value}.`);
  }
  return {
    sessionId,
    sandboxId: resolvedSandboxId,
    workspaceRoot:
      typeof payload?.workspaceRoot === 'string' && payload.workspaceRoot.trim()
        ? payload.workspaceRoot.trim()
        : undefined,
    strategy:
      typeof payload?.strategy === 'string' && payload.strategy.trim()
        ? payload.strategy.trim()
        : undefined,
  };
}
