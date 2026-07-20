import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  clearSessionCookie,
  parseCookies,
  readSession,
  setSessionCookie,
  signSession,
  type AuthUser,
} from './auth.js';
import {
  approvePairingCode,
  createGatewaySession,
  destroyGatewaySession,
  getGatewayUrl,
  listPairings,
  readSandboxConfig,
  restartDaemon,
  setupAiAndTelegram,
  writeSandboxConfig,
} from './gateway-client.js';
import {
  createInstanceRecord,
  createUser,
  deleteInstance,
  findUserByEmail,
  getInstance,
  listInstances,
  updateInstance,
  verifyPassword,
} from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || process.env.XIBECODE_HOSTING_PORT || 3847);

const publicDirs = [
  join(__dirname, 'public'),
  join(__dirname, '../src/public'),
];

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendText(res: ServerResponse, status: number, body: string, type = 'text/plain; charset=utf-8'): void {
  res.writeHead(status, {
    'content-type': type,
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Invalid JSON body');
  }
}

function getUser(req: IncomingMessage): AuthUser | null {
  return readSession(parseCookies(req.headers.cookie));
}

function requireUser(req: IncomingMessage, res: ServerResponse): AuthUser | null {
  const user = getUser(req);
  if (!user) {
    sendJson(res, 401, { error: 'Login required' });
    return null;
  }
  return user;
}

function serveStatic(pathname: string, res: ServerResponse): boolean {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  if (rel.includes('..')) return false;
  for (const dir of publicDirs) {
    const file = join(dir, rel);
    if (!existsSync(file) || !file.startsWith(dir)) continue;
    const ext = file.split('.').pop()?.toLowerCase();
    const type =
      ext === 'html'
        ? 'text/html; charset=utf-8'
        : ext === 'css'
          ? 'text/css; charset=utf-8'
          : ext === 'js'
            ? 'application/javascript; charset=utf-8'
            : 'application/octet-stream';
    sendText(res, 200, readFileSync(file, 'utf8'), type);
    return true;
  }
  return false;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const method = (req.method || 'GET').toUpperCase();
    const path = url.pathname;

    if (method === 'GET' && path === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        service: 'xibecode-hosting',
        gatewayUrl: getGatewayUrl(),
        plan: { id: 'hosting-4c8g', cpu: 4, memoryMb: 8192 },
      });
      return;
    }

    if (method === 'GET' && path === '/api/me') {
      const user = getUser(req);
      if (!user) {
        sendJson(res, 401, { error: 'Not logged in' });
        return;
      }
      sendJson(res, 200, { user: { id: user.id, email: user.email } });
      return;
    }

    if (method === 'POST' && path === '/api/auth/register') {
      try {
        const body = (await readBody(req)) as { email?: string; password?: string };
        const user = createUser(String(body.email || ''), String(body.password || ''));
        const token = signSession({ id: user.id, email: user.email });
        setSessionCookie(res, token);
        sendJson(res, 200, { user: { id: user.id, email: user.email } });
      } catch (e) {
        sendJson(res, 400, { error: (e as Error).message });
      }
      return;
    }

    if (method === 'POST' && path === '/api/auth/login') {
      const body = (await readBody(req)) as { email?: string; password?: string };
      const user = findUserByEmail(String(body.email || ''));
      if (!user || !verifyPassword(String(body.password || ''), user.passwordHash)) {
        sendJson(res, 401, { error: 'Invalid email or password' });
        return;
      }
      const token = signSession({ id: user.id, email: user.email });
      setSessionCookie(res, token);
      sendJson(res, 200, { user: { id: user.id, email: user.email } });
      return;
    }

    if (method === 'POST' && path === '/api/auth/logout') {
      clearSessionCookie(res);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === 'GET' && path === '/api/instances') {
      const user = requireUser(req, res);
      if (!user) return;
      sendJson(res, 200, { instances: listInstances(user.id) });
      return;
    }

    if (method === 'POST' && path === '/api/instances') {
      const user = requireUser(req, res);
      if (!user) return;
      const body = (await readBody(req)) as { name?: string };
      const name = String(body.name || 'workspace').slice(0, 64);
      try {
        const session = await createGatewaySession({ strategy: 'sandbox_full' });
        const instance = createInstanceRecord({
          userId: user.id,
          name,
          sessionId: session.sessionId,
          sandboxId: session.sandboxId,
        });
        sendJson(res, 201, { instance });
      } catch (e) {
        sendJson(res, 502, {
          error: `Failed to provision sandbox: ${(e as Error).message}`,
        });
      }
      return;
    }

    // GET config (safe, secrets masked)
    const configMatch = path.match(/^\/api\/instances\/([^/]+)\/config$/);
    if (method === 'GET' && configMatch) {
      const user = requireUser(req, res);
      if (!user) return;
      const inst = getInstance(user.id, configMatch[1]);
      if (!inst) {
        sendJson(res, 404, { error: 'Instance not found' });
        return;
      }
      try {
        const sandbox = await readSandboxConfig(inst.sessionId, inst.sandboxId);
        sendJson(res, 200, {
          instanceId: inst.id,
          name: inst.name,
          stored: inst.config || {},
          sandbox,
        });
      } catch (e) {
        sendJson(res, 502, { error: (e as Error).message });
      }
      return;
    }

    // PUT config — option 1: edit API key / model / telegram / etc.
    if (method === 'PUT' && configMatch) {
      const user = requireUser(req, res);
      if (!user) return;
      const inst = getInstance(user.id, configMatch[1]);
      if (!inst) {
        sendJson(res, 404, { error: 'Instance not found' });
        return;
      }
      const body = (await readBody(req)) as {
        provider?: string;
        apiKey?: string;
        baseUrl?: string;
        model?: string;
        telegramBotToken?: string;
        name?: string;
        restart?: boolean;
        allowAllUsers?: boolean;
      };
      try {
        const result = await writeSandboxConfig(inst.sessionId, {
          provider: body.provider,
          apiKey: body.apiKey,
          baseUrl: body.baseUrl,
          model: body.model,
          telegramBotToken: body.telegramBotToken,
          mergeExisting: true,
          allowAllUsers: body.allowAllUsers,
          sandboxId: inst.sandboxId,
        });
        if (!result.ok) {
          sendJson(res, 400, { error: result.logs.join(' ') || 'Config write failed', logs: result.logs });
          return;
        }
        const name = body.name?.trim();
        let logs = result.logs;
        let restartOk = true;
        if (body.restart) {
          const r = await restartDaemon(inst.sessionId, inst.sandboxId);
          logs = [...logs, ...r.logs];
          restartOk = r.ok;
        }
        updateInstance(user.id, inst.id, {
          ...(name ? { name } : {}),
          aiConfigured: true,
          telegramConfigured: true,
          status: restartOk ? 'running' : 'error',
          lastError: restartOk ? undefined : logs.join('\n').slice(0, 500),
          config: {
            provider: result.meta.provider,
            model: result.meta.model,
            baseUrl: result.meta.baseUrl,
            hasApiKey: result.meta.hasApiKey,
            hasTelegramToken: result.meta.hasTelegramToken,
          },
        });
        sendJson(res, 200, {
          ok: restartOk,
          logs,
          instance: getInstance(user.id, inst.id),
          sandbox: result.meta,
        });
      } catch (e) {
        updateInstance(user.id, inst.id, {
          status: 'error',
          lastError: (e as Error).message.slice(0, 500),
        });
        sendJson(res, 502, { error: (e as Error).message });
      }
      return;
    }

    // Pairing list / approve
    const pairingMatch = path.match(/^\/api\/instances\/([^/]+)\/pairing$/);
    if (method === 'GET' && pairingMatch) {
      const user = requireUser(req, res);
      if (!user) return;
      const inst = getInstance(user.id, pairingMatch[1]);
      if (!inst) {
        sendJson(res, 404, { error: 'Instance not found' });
        return;
      }
      try {
        const pairing = await listPairings(inst.sessionId, inst.sandboxId);
        sendJson(res, 200, { pairing });
      } catch (e) {
        sendJson(res, 502, { error: (e as Error).message });
      }
      return;
    }
    if (method === 'POST' && pairingMatch) {
      const user = requireUser(req, res);
      if (!user) return;
      const inst = getInstance(user.id, pairingMatch[1]);
      if (!inst) {
        sendJson(res, 404, { error: 'Instance not found' });
        return;
      }
      const body = (await readBody(req)) as { code?: string; platform?: string };
      try {
        const result = await approvePairingCode(
          inst.sessionId,
          String(body.code || ''),
          String(body.platform || 'telegram'),
          inst.sandboxId,
        );
        sendJson(res, result.ok ? 200 : 400, result);
      } catch (e) {
        sendJson(res, 502, { error: (e as Error).message });
      }
      return;
    }

    // POST restart — option 2: restart daemon with current sandbox config
    const restartMatch = path.match(/^\/api\/instances\/([^/]+)\/restart$/);
    if (method === 'POST' && restartMatch) {
      const user = requireUser(req, res);
      if (!user) return;
      const inst = getInstance(user.id, restartMatch[1]);
      if (!inst) {
        sendJson(res, 404, { error: 'Instance not found' });
        return;
      }
      try {
        const result = await restartDaemon(inst.sessionId, inst.sandboxId);
        updateInstance(user.id, inst.id, {
          status: result.ok ? 'running' : 'error',
          lastError: result.ok ? undefined : result.logs.join('\n').slice(0, 500),
          aiConfigured: result.ok || inst.aiConfigured,
          telegramConfigured: result.ok || inst.telegramConfigured,
        });
        sendJson(res, 200, {
          ok: result.ok,
          logs: result.logs,
          instance: getInstance(user.id, inst.id),
        });
      } catch (e) {
        sendJson(res, 502, { error: (e as Error).message });
      }
      return;
    }

    // Legacy full setup (write config + restart)
    const setupMatch = path.match(/^\/api\/instances\/([^/]+)\/setup$/);
    if (method === 'POST' && setupMatch) {
      const user = requireUser(req, res);
      if (!user) return;
      const inst = getInstance(user.id, setupMatch[1]);
      if (!inst) {
        sendJson(res, 404, { error: 'Instance not found' });
        return;
      }
      const body = (await readBody(req)) as {
        provider?: string;
        apiKey?: string;
        baseUrl?: string;
        model?: string;
        telegramBotToken?: string;
      };
      const apiKey = String(body.apiKey || '').trim();
      const telegramBotToken = String(body.telegramBotToken || '').trim();
      if (!apiKey) {
        sendJson(res, 400, { error: 'apiKey is required' });
        return;
      }
      if (!telegramBotToken) {
        sendJson(res, 400, { error: 'telegramBotToken is required' });
        return;
      }
      try {
        const result = await setupAiAndTelegram(inst.sessionId, {
          provider: String(body.provider || 'openai'),
          apiKey,
          baseUrl: String(body.baseUrl || ''),
          model: String(body.model || ''),
          telegramBotToken,
          sandboxId: inst.sandboxId,
        });
        updateInstance(user.id, inst.id, {
          aiConfigured: result.ok,
          telegramConfigured: result.ok,
          lastError: result.ok ? undefined : result.logs.join('\n').slice(0, 500),
          status: result.ok ? 'running' : 'error',
          config: {
            provider: String(body.provider || 'openai'),
            model: String(body.model || ''),
            baseUrl: String(body.baseUrl || ''),
            hasApiKey: true,
            hasTelegramToken: true,
          },
        });
        sendJson(res, 200, {
          ok: result.ok,
          logs: result.logs,
          instance: getInstance(user.id, inst.id),
        });
      } catch (e) {
        updateInstance(user.id, inst.id, {
          status: 'error',
          lastError: (e as Error).message.slice(0, 500),
        });
        sendJson(res, 502, { error: (e as Error).message });
      }
      return;
    }

    const instMatch = path.match(/^\/api\/instances\/([^/]+)$/);
    if (method === 'DELETE' && instMatch) {
      const user = requireUser(req, res);
      if (!user) return;
      const inst = getInstance(user.id, instMatch[1]);
      if (!inst) {
        sendJson(res, 404, { error: 'Instance not found' });
        return;
      }
      try {
        await destroyGatewaySession(inst.sessionId);
      } catch (e) {
        console.warn('[hosting] destroy gateway session:', (e as Error).message);
      }
      deleteInstance(user.id, inst.id);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === 'GET') {
      if (serveStatic(path, res)) return;
      if (serveStatic('/', res)) return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error('[hosting]', e);
    sendJson(res, 500, { error: (e as Error).message || 'Internal error' });
  }
});

server.listen(port, () => {
  console.log(`[xibecode-hosting] http://127.0.0.1:${port}`);
  console.log(`[xibecode-hosting] gateway ${getGatewayUrl()}`);
  console.log(
    `[xibecode-hosting] set XIBECODE_HOSTING_JWT_SECRET, XIBECODE_SANDBOX_GATEWAY_URL, XIBECODE_GATEWAY_TOKEN`,
  );
});
