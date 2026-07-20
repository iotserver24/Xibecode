import express from 'express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  clearSessionCookie,
  readSession,
  requireAuth,
  setSessionCookie,
  signSession,
  type AuthUser,
} from './auth.js';
import {
  createGatewaySession,
  destroyGatewaySession,
  getGatewayUrl,
  setupAiAndTelegram,
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

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'xibecode-hosting',
    gatewayUrl: getGatewayUrl(),
    plan: { id: 'hosting-4c8g', cpu: 4, memoryMb: 8192 },
  });
});

app.get('/api/me', (req, res) => {
  const user = readSession(req);
  if (!user) {
    res.status(401).json({ error: 'Not logged in' });
    return;
  }
  res.json({ user: { id: user.id, email: user.email } });
});

app.post('/api/auth/register', (req, res) => {
  try {
    const email = String(req.body?.email || '');
    const password = String(req.body?.password || '');
    const user = createUser(email, password);
    const token = signSession({ id: user.id, email: user.email });
    setSessionCookie(res, token);
    res.json({ user: { id: user.id, email: user.email } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body?.email || '');
  const password = String(req.body?.password || '');
  const user = findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }
  const token = signSession({ id: user.id, email: user.email });
  setSessionCookie(res, token);
  res.json({ user: { id: user.id, email: user.email } });
});

app.post('/api/auth/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/instances', requireAuth, (req, res) => {
  const user = (req as express.Request & { user: AuthUser }).user;
  res.json({ instances: listInstances(user.id) });
});

app.post('/api/instances', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user: AuthUser }).user;
  const name = String(req.body?.name || 'workspace').slice(0, 64);
  try {
    const session = await createGatewaySession({ strategy: 'sandbox_full' });
    const instance = createInstanceRecord({
      userId: user.id,
      name,
      sessionId: session.sessionId,
      sandboxId: session.sandboxId,
    });
    res.status(201).json({ instance });
  } catch (e) {
    res.status(502).json({
      error: `Failed to provision sandbox: ${(e as Error).message}`,
    });
  }
});

app.delete('/api/instances/:id', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user: AuthUser }).user;
  const inst = getInstance(user.id, req.params.id);
  if (!inst) {
    res.status(404).json({ error: 'Instance not found' });
    return;
  }
  try {
    await destroyGatewaySession(inst.sessionId);
  } catch (e) {
    // Still drop local record if gateway already gone
    console.warn('[hosting] destroy gateway session:', (e as Error).message);
  }
  deleteInstance(user.id, inst.id);
  res.json({ ok: true });
});

app.post('/api/instances/:id/setup', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user: AuthUser }).user;
  const inst = getInstance(user.id, req.params.id);
  if (!inst) {
    res.status(404).json({ error: 'Instance not found' });
    return;
  }
  const apiKey = String(req.body?.apiKey || '').trim();
  const telegramBotToken = String(req.body?.telegramBotToken || '').trim();
  if (!apiKey) {
    res.status(400).json({ error: 'apiKey is required' });
    return;
  }
  if (!telegramBotToken) {
    res.status(400).json({ error: 'telegramBotToken is required' });
    return;
  }
  try {
    const result = await setupAiAndTelegram(inst.sessionId, {
      provider: String(req.body?.provider || 'openai'),
      apiKey,
      baseUrl: String(req.body?.baseUrl || ''),
      model: String(req.body?.model || ''),
      telegramBotToken,
    });
    updateInstance(user.id, inst.id, {
      aiConfigured: result.ok,
      telegramConfigured: result.ok,
      lastError: result.ok ? undefined : result.logs.join('\n').slice(0, 500),
      status: result.ok ? 'running' : 'error',
    });
    res.json({
      ok: result.ok,
      logs: result.logs,
      instance: getInstance(user.id, inst.id),
    });
  } catch (e) {
    updateInstance(user.id, inst.id, {
      status: 'error',
      lastError: (e as Error).message.slice(0, 500),
    });
    res.status(502).json({ error: (e as Error).message });
  }
});

// Static dashboard (works for both src/ and dist/)
const publicDirs = [
  join(__dirname, 'public'),
  join(__dirname, '../src/public'),
];
for (const dir of publicDirs) {
  if (existsSync(dir)) app.use(express.static(dir));
}
app.get('*', (_req, res) => {
  for (const dir of publicDirs) {
    const index = join(dir, 'index.html');
    if (existsSync(index)) {
      res.sendFile(index);
      return;
    }
  }
  res.status(404).send('Dashboard not found');
});

app.listen(port, () => {
  console.log(`[xibecode-hosting] http://127.0.0.1:${port}`);
  console.log(`[xibecode-hosting] gateway ${getGatewayUrl()}`);
  console.log(
    `[xibecode-hosting] set XIBECODE_HOSTING_JWT_SECRET, XIBECODE_SANDBOX_GATEWAY_URL, XIBECODE_GATEWAY_TOKEN`,
  );
});
