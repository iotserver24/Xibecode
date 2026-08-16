/**
 * Mint a wake-http short link for a workspace file (hosted E2B).
 *
 * The template process on :8788 stores an unguessable token → path and
 * serves GET /f/{token}/{name}. Public URL wakes a paused sandbox.
 */

import { resolveRuntimeMode, resolveSandboxIdentity } from '../utils/runtime-mode.js';

export type WorkspaceShare = {
  token: string;
  name: string;
  url: string;
  path: string;
};

const SHARE_TIMEOUT_MS = 2500;

export function wakeSharePort(): number {
  const raw = Number(
    process.env.VECTRA_WAKE_PORT || process.env.TELEGRAM_WEBHOOK_PORT || 8788,
  );
  if (Number.isFinite(raw) && raw >= 1 && raw <= 65535) return Math.floor(raw);
  return 8788;
}

export function shouldAttemptWorkspaceShare(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  try {
    if (resolveRuntimeMode(env).isE2b) return true;
  } catch {
    /* ignore */
  }
  return Boolean(
    (env.E2B_SANDBOX_ID || env.XIBECODE_SANDBOX_ID || env.SANDBOX_ID || '').trim(),
  );
}

export function formatShareMessage(shares: WorkspaceShare[]): string {
  if (!shares.length) return '';
  const lines = shares.map((s) => `📎 ${s.name} — ${s.url}`);
  return lines.join('\n');
}

export function publicShareUrl(opts: {
  sandboxId: string;
  token: string;
  name: string;
  port?: number;
  domain?: string;
}): string {
  const port = opts.port ?? wakeSharePort();
  const domain = (opts.domain || 'e2b.app').replace(/^\.+/, '');
  const quoted = encodeURIComponent(opts.name || 'file');
  return `https://${port}-${opts.sandboxId}.${domain}/f/${opts.token}/${quoted}`;
}

function localShareEndpoint(): string {
  return `http://127.0.0.1:${wakeSharePort()}/share`;
}

export async function shareWorkspaceFile(
  filePath: string,
  opts?: { name?: string },
): Promise<WorkspaceShare | null> {
  if (!filePath) return null;
  const name = (opts?.name || filePath.split(/[/\\]/).pop() || 'file').trim();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), SHARE_TIMEOUT_MS);
  try {
    const res = await fetch(localShareEndpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: filePath, name }),
      signal: ac.signal,
    });
    const data = (await res.json().catch(() => null)) as
      | {
          ok?: boolean;
          token?: string;
          name?: string;
          url?: string;
          path?: string;
          error?: string;
        }
      | null;
    if (!res.ok || !data?.token) return null;
    const identity = resolveSandboxIdentity();
    const url =
      (data.url && /^https?:\/\//i.test(data.url) && data.url) ||
      (identity.sandboxId
        ? publicShareUrl({
            sandboxId: identity.sandboxId,
            token: data.token,
            name: data.name || name,
            port: wakeSharePort(),
          })
        : '');
    if (!url) return null;
    return {
      token: data.token,
      name: data.name || name,
      url,
      path: data.path || filePath,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function shareMediaFiles(
  media: Array<{ path: string }>,
): Promise<WorkspaceShare[]> {
  if (!shouldAttemptWorkspaceShare() || !media.length) return [];
  const out: WorkspaceShare[] = [];
  for (const m of media) {
    const rec = await shareWorkspaceFile(m.path);
    if (rec) out.push(rec);
  }
  return out;
}
