/**
 * Thin HTTP client for packages/e2b-gateway.
 * Hosting never holds E2B_API_KEY — the gateway does.
 */

function gatewayBase(): string {
  const base =
    process.env.XIBECODE_SANDBOX_GATEWAY_URL?.trim() ||
    process.env.XIBECODE_E2B_GATEWAY_URL?.trim() ||
    'http://127.0.0.1:8787';
  return base.replace(/\/$/, '');
}

function gatewayToken(): string {
  return (
    process.env.XIBECODE_GATEWAY_TOKEN?.trim() ||
    process.env.XIBECODE_SANDBOX_AUTH_TOKEN?.trim() ||
    ''
  );
}

async function gwFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  const token = gatewayToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  const res = await fetch(`${gatewayBase()}${path}`, { ...init, headers });
  return res;
}

export type GatewaySession = {
  sessionId: string;
  sandboxId?: string;
  strategy?: string;
  workspaceRoot?: string;
};

export async function createGatewaySession(opts?: {
  sessionId?: string;
  strategy?: 'sandbox_full' | 'host_only';
}): Promise<GatewaySession> {
  const res = await gwFetch('/sessions', {
    method: 'POST',
    body: JSON.stringify({
      sessionId: opts?.sessionId,
      strategy: opts?.strategy || 'sandbox_full',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gateway create session failed (${res.status}): ${text.slice(0, 400)}`);
  }
  return (await res.json()) as GatewaySession;
}

export async function destroyGatewaySession(sessionId: string): Promise<void> {
  const res = await gwFetch(`/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Gateway destroy failed (${res.status}): ${text.slice(0, 400)}`);
  }
}

export type ExecResult = {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
};

export async function execInSession(
  sessionId: string,
  command: string,
  opts?: { timeout?: number; cwd?: string },
): Promise<ExecResult> {
  const res = await gwFetch(`/sessions/${encodeURIComponent(sessionId)}/exec`, {
    method: 'POST',
    body: JSON.stringify({
      command,
      timeout: opts?.timeout ?? 120,
      cwd: opts?.cwd,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gateway exec failed (${res.status}): ${text.slice(0, 400)}`);
  }
  return (await res.json()) as ExecResult;
}

/** Write AI + Telegram env into the sandbox and start gateway (non-interactive). */
export async function setupAiAndTelegram(
  sessionId: string,
  input: {
    provider?: string;
    apiKey: string;
    baseUrl?: string;
    model?: string;
    telegramBotToken: string;
  },
): Promise<{ ok: boolean; logs: string[] }> {
  const logs: string[] = [];
  const provider = (input.provider || 'openai').replace(/[^a-z0-9_-]/gi, '');
  const model = (input.model || 'gpt-4o-mini').replace(/["`$\\]/g, '');
  const baseUrl = (input.baseUrl || '').replace(/["`$\\]/g, '');
  // Escape single quotes for shell single-quoted strings.
  const sh = (s: string) => s.replace(/'/g, `'\\''`);

  const writeEnv = [
    `mkdir -p "$HOME/.xibecode"`,
    `cat > "$HOME/.xibecode/gateway.env" <<'XIBE_ENV'`,
    `XIBECODE_TELEGRAM_BOT_TOKEN='${sh(input.telegramBotToken)}'`,
    `XIBECODE_API_KEY='${sh(input.apiKey)}'`,
    provider === 'anthropic'
      ? `ANTHROPIC_API_KEY='${sh(input.apiKey)}'`
      : `OPENAI_API_KEY='${sh(input.apiKey)}'`,
    baseUrl ? `XIBECODE_BASE_URL='${sh(baseUrl)}'` : '',
    model ? `XIBECODE_MODEL='${sh(model)}'` : '',
    `XIBE_ENV`,
    `chmod 600 "$HOME/.xibecode/gateway.env"`,
  ]
    .filter(Boolean)
    .join('\n');

  const r1 = await execInSession(sessionId, writeEnv, { timeout: 60 });
  logs.push(`write-env exit=${r1.exitCode ?? '?'} ${(r1.stdout || r1.stderr || '').slice(0, 500)}`);

  // Non-interactive model/config + install+start telegram gateway
  const setupCmd = [
    `set -a; [ -f "$HOME/.xibecode/gateway.env" ] && . "$HOME/.xibecode/gateway.env"; set +a`,
    `xibecode config --set-provider ${provider} 2>/dev/null || true`,
    model ? `xibecode config --set-model '${sh(model)}' 2>/dev/null || true` : '',
    baseUrl ? `xibecode config --set-base-url '${sh(baseUrl)}' 2>/dev/null || true` : '',
    // Prefer setup non-interactive hints if available; always write telegram token path used by gateway
    `xibecode gateway --install --yes 2>/dev/null || true`,
    `nohup xibecode gateway --start >/tmp/xibecode-gateway.log 2>&1 &`,
    `sleep 2`,
    `xibecode gateway --status 2>&1 || true`,
    `echo SETUP_DONE`,
  ]
    .filter(Boolean)
    .join(' && ');

  const r2 = await execInSession(sessionId, `bash -lc ${JSON.stringify(setupCmd)}`, {
    timeout: 180,
  });
  logs.push(`setup exit=${r2.exitCode ?? '?'} ${(r2.stdout || r2.stderr || '').slice(0, 1500)}`);

  const ok = (r2.stdout || '').includes('SETUP_DONE') || (r2.exitCode ?? 1) === 0;
  return { ok, logs };
}

export function getGatewayUrl(): string {
  return gatewayBase();
}
