/**
 * First-party app chat adapter.
 *
 * Always-on HTTP inbox for the Flutter / website proxy. Same ChatController
 * as Telegram — slash commands, approvals, files — but events are small JSON,
 * not MarkdownV2.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { gatewayHome } from './agent-runner.js';
import { GATEWAY_BOT_COMMANDS } from './format.js';
import {
  APP_DEFAULT_CHAT_ID,
  APP_DEFAULT_USER_ID,
  APP_INBOX_DEFAULT_PORT,
  fileKindFromName,
  inboxAuthorized,
  inlineUploadPrompt,
  makeEvent,
  parseProgressText,
  type AppChatEvent,
  type AppFileKind,
} from './app-events.js';
import type {
  InboundMessage,
  MessagingAdapter,
  SendLocalFileOptions,
  SendMessageOptions,
} from './types.js';
import { shareWorkspaceFile } from './workspace-share.js';
import { listConversations } from './session-store.js';
import { loadResumeContext, SessionManager } from 'xibecode-core';
import {
  buildComputerFocusPayload,
  parseComputerShow,
} from './computer-events.js';
import {
  ensureAgentBrowserStream,
  ensureCursorOverlay,
  highlightBrowserTarget,
  pipeAgentBrowserScreencast,
  streamPort,
} from './computer-stream.js';

const TEXT_INLINE_MAX = 256 * 1024;
const TEXT_EXTS = new Set([
  '.txt',
  '.md',
  '.json',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.kt',
  '.c',
  '.h',
  '.cpp',
  '.cs',
  '.rb',
  '.php',
  '.html',
  '.css',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.env',
  '.sh',
  '.xml',
  '.csv',
  '.log',
  '.diff',
  '.patch',
]);

function inboxPort(): number {
  const raw = Number(process.env.XIBECODE_APP_INBOX_PORT);
  if (Number.isFinite(raw) && raw >= 1 && raw <= 65535) return Math.floor(raw);
  return APP_INBOX_DEFAULT_PORT;
}

function allowOpenInbox(): boolean {
  return /^(1|true|yes|on)$/i.test(
    process.env.XIBECODE_APP_INBOX_OPEN || '',
  );
}

function collectSecrets(): string[] {
  return [
    process.env.XIBECODE_APP_INBOX_SECRET,
    process.env.XIBECODE_GATEWAY_TOKEN,
    process.env.XIBECODE_SANDBOX_AUTH_TOKEN,
  ]
    .map((s) => (s || '').trim())
    .filter((s) => s.length >= 8);
}

async function ensureInboxSecret(): Promise<string[]> {
  const existing = collectSecrets();
  if (existing.length) return existing;
  const secretPath = path.join(gatewayHome(), 'app-inbox.secret');
  try {
    const fromFile = (await fs.readFile(secretPath, 'utf8')).trim();
    if (fromFile.length >= 8) {
      process.env.XIBECODE_APP_INBOX_SECRET = fromFile;
      return [fromFile];
    }
  } catch {
    /* generate */
  }
  const generated = randomBytes(24).toString('base64url');
  await fs.mkdir(gatewayHome(), { recursive: true });
  await fs.writeFile(secretPath, `${generated}\n`, { mode: 0o600 });
  process.env.XIBECODE_APP_INBOX_SECRET = generated;
  return [generated];
}

function outboxDir(): string {
  return path.join(gatewayHome(), 'app-outbox');
}

function inboxUploadDir(workdir: string): string {
  return path.join(workdir, 'inbox');
}

function looksTextFile(name: string, mime?: string): boolean {
  const ext = path.extname(name).toLowerCase();
  if (TEXT_EXTS.has(ext)) return true;
  if (mime && /^text\//i.test(mime)) return true;
  if (mime && /json|xml|javascript|typescript/i.test(mime)) return true;
  return false;
}

async function readJson(
  req: IncomingMessage,
  max = 8 * 1024 * 1024,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
    n += buf.length;
    if (n > max) throw new Error('body too large');
    chunks.push(buf);
  }
  if (!n) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error('invalid JSON');
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
  });
  res.end(data);
}

export class AppAdapter implements MessagingAdapter {
  readonly name = 'app' as const;
  homeChannel?: string;
  private log: (m: string) => void;
  private workdir: () => string;
  private server: ReturnType<typeof createServer> | null = null;
  private onMessage: ((msg: InboundMessage) => Promise<void>) | null = null;
  private loopResolve: (() => void) | null = null;
  private seq = { n: 0 };
  private events: AppChatEvent[] = [];
  private listeners = new Set<(ev: AppChatEvent) => void>();
  private files = new Map<string, { abs: string; name: string; kind: AppFileKind }>();
  private fileSeq = 0;
  private secrets: string[] = [];
  private stopped = false;
  private typedThisTurn = false;
  private progressStarted = false;
  private progressEventId?: string;
  private pickerHandlers = new Map<
    string,
    (value: string) => Promise<string>
  >();
  private publicFiles = new Map<
    string,
    { abs: string; name: string; mime?: string }
  >();
  private lastUsage: {
    used?: number;
    max?: number;
    pct?: number;
    model?: string;
    label?: string;
    input?: number;
    output?: number;
  } | null = null;
  private lastTurn: {
    busy: boolean;
    startedAt?: number;
    elapsedMs?: number;
    tools?: number;
    lastTool?: string;
  } | null = null;
  private lastComputerShow: 'terminal' | 'browser' | null = null;

  constructor(
    opts: { homeChatId?: string; workdir?: () => string } = {},
    log: (m: string) => void = () => {},
  ) {
    this.homeChannel = opts.homeChatId || APP_DEFAULT_CHAT_ID;
    this.workdir = opts.workdir || (() => process.cwd());
    this.log = log;
  }

  private emit(chatId: string, partial: Omit<AppChatEvent, 'id' | 'ts' | 'chatId'>): AppChatEvent {
    const ev = makeEvent(this.seq, chatId, partial);
    this.events.push(ev);
    if (this.events.length > 800) this.events.splice(0, this.events.length - 500);
    for (const l of this.listeners) {
      try {
        l(ev);
      } catch {
        /* ignore */
      }
    }
    return ev;
  }

  private authorized(req: IncomingMessage): boolean {
    return inboxAuthorized({
      authorization: req.headers.authorization,
      secretHeader: String(req.headers['x-app-inbox-secret'] || ''),
      secrets: this.secrets,
      allowOpen: allowOpenInbox(),
    });
  }

  notifyConversation(info: {
    chatId: string;
    sessionId: string;
    previousSessionId?: string | null;
    previousTitle?: string;
    conversations?: Array<{
      sessionId: string;
      title: string;
      createdAt: number;
      updatedAt: number;
      status: 'active' | 'closed';
      parentSessionId?: string;
    }>;
  }): void {
    this.emit(info.chatId, {
      type: 'conversation',
      sessionId: info.sessionId,
      previousSessionId: info.previousSessionId || undefined,
      title: info.previousTitle,
      conversations: info.conversations,
    });
    this.lastComputerShow = null;
  }

  async sendMessage(
    chatId: string,
    text: string,
    _opts?: SendMessageOptions,
  ): Promise<void> {
    const trimmed = String(text || '');
    if (!trimmed.trim()) return;
    this.emit(chatId, { type: 'text', text: trimmed, final: true, format: 'markdown' });
    this.maybeFocusComputer(chatId, trimmed);
    this.emit(chatId, { type: 'done' });
  }

  async sendLiveText(chatId: string, text: string): Promise<void> {
    const trimmed = String(text || '').trim();
    if (!trimmed) return;
    this.emit(chatId, {
      type: 'text',
      text: trimmed,
      delta: false,
      final: false,
      format: 'markdown',
    });
    this.maybeFocusComputer(chatId, trimmed);
  }

  async publishImageUrl(absPath: string): Promise<string | undefined> {
    const abs = path.isAbsolute(absPath)
      ? absPath
      : path.resolve(this.workdir(), absPath);
    if (!existsSync(abs)) return undefined;
    const share = await shareWorkspaceFile(abs);
    if (share?.url) return share.url;
    const token = randomBytes(18).toString('base64url');
    const name = path.basename(abs);
    const ext = path.extname(name).toLowerCase();
    const mime =
      ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.gif'
          ? 'image/gif'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.bmp'
              ? 'image/bmp'
              : ext === '.png'
                ? 'image/png'
                : 'application/octet-stream';
    this.publicFiles.set(token, { abs, name, mime });
    const fromEnv = (process.env.XIBECODE_PUBLIC_MEDIA_BASE || '').replace(/\/$/, '');
    if (fromEnv) return `${fromEnv}/${token}`;
    return undefined;
  }

  private beginInboundTurn(): void {
    this.typedThisTurn = false;
    this.progressStarted = false;
    this.progressEventId = undefined;
  }

  async sendTyping(chatId: string): Promise<void> {
    if (this.typedThisTurn) return;
    this.typedThisTurn = true;
    this.emit(chatId, { type: 'typing', text: 'on it' });
  }

  async sendUsage(
    chatId: string,
    usage: {
      used?: number;
      max?: number;
      pct?: number;
      model?: string;
      label?: string;
      input?: number;
      output?: number;
    },
  ): Promise<void> {
    this.lastUsage = { ...usage };
    this.emit(chatId, {
      type: 'usage',
      used: usage.used,
      max: usage.max,
      pct: usage.pct,
      model: usage.model,
      label: usage.label,
      text: usage.label,
    });
  }

  async sendTurnStatus(
    chatId: string,
    turn: {
      busy: boolean;
      startedAt?: number;
      elapsedMs?: number;
      tools?: number;
      lastTool?: string;
    },
  ): Promise<void> {
    const elapsedMs =
      turn.elapsedMs ??
      (turn.startedAt ? Date.now() - turn.startedAt : 0);
    this.lastTurn = { ...turn, elapsedMs };
    this.emit(chatId, {
      type: 'status',
      busy: turn.busy,
      startedAt: turn.startedAt,
      elapsedMs,
      tools: turn.tools,
      lastTool: turn.lastTool,
    });
  }

  async sendOrEditProgress(
    chatId: string,
    text: string,
    previousMessageId?: string,
  ): Promise<string | undefined> {
    const trimmed = String(text || '').slice(0, 400);
    const parsed = parseProgressText(trimmed);
    const editingStatus =
      Boolean(previousMessageId) && previousMessageId === this.progressEventId;
    const firstStatus = !previousMessageId && !this.progressStarted;
    if (editingStatus || firstStatus) {
      this.progressStarted = true;
      const ev = this.emit(chatId, {
        type: 'progress',
        text: trimmed,
        elapsedMs: parsed.elapsedMs,
        tools: parsed.tools,
      });
      this.progressEventId = ev.id;
      return ev.id;
    }
    const ev = this.emit(chatId, {
      type: 'tool',
      name: trimmed.split(/\s+/).slice(0, 3).join(' '),
      state: previousMessageId ? 'done' : 'start',
      summary: trimmed,
      text: trimmed,
    });
    return ev.id;
  }

  notifyComputer(
    chatId: string,
    payload: {
      tab: 'terminal' | 'browser';
      kind: 'shell' | 'browser' | 'file' | 'other' | 'focus';
      name: string;
      state: 'start' | 'done';
      command?: string;
      action?: string;
      target?: string;
      url?: string;
      label: string;
      stdout?: string;
      exitCode?: number;
      success?: boolean;
      focus?: boolean;
    },
  ): void {
    this.emit(chatId, {
      type: 'computer',
      tab: payload.tab,
      kind: payload.kind,
      name: payload.name,
      state: payload.state,
      command: payload.command,
      action: payload.action,
      target: payload.target,
      url: payload.url,
      label: payload.label,
      stdout: payload.stdout,
      exitCode: payload.exitCode,
      success: payload.success,
      focus: payload.focus === true,
      text: payload.label,
    });
    if (payload.focus) this.lastComputerShow = payload.tab;
    if (payload.kind === 'browser' || payload.tab === 'browser') {
      void ensureAgentBrowserStream(streamPort())
        .then(() => ensureCursorOverlay())
        .catch(() => undefined);
      if (payload.state === 'start' && payload.target) {
        void highlightBrowserTarget(payload.target).catch(() => undefined);
      }
    }
  }

  private maybeFocusComputer(chatId: string, text: string): void {
    const tab = parseComputerShow(text);
    if (!tab || tab === this.lastComputerShow) return;
    this.lastComputerShow = tab;
    this.notifyComputer(chatId, buildComputerFocusPayload(tab));
  }

  async editInteractiveMessage(
    chatId: string,
    _messageId: string,
    text: string,
  ): Promise<void> {
    this.emit(chatId, { type: 'text', text, final: true, format: 'markdown' });
    this.maybeFocusComputer(chatId, text);
  }

  async sendApprovalPrompt(
    chatId: string,
    text: string,
    approvalId: string,
  ): Promise<string> {
    const ev = this.emit(chatId, {
      type: 'approve',
      ref: approvalId,
      title: 'Approval needed',
      detail: text,
      format: 'markdown',
    });
    return ev.id;
  }

  async sendAskPrompt(
    chatId: string,
    question: string,
    choices: string[] | undefined,
    askId: string,
  ): Promise<string> {
    const ev = this.emit(chatId, {
      type: 'ask',
      ref: askId,
      question,
      choices: choices || [],
      format: 'markdown',
    });
    return ev.id;
  }

  async sendModelPicker(
    chatId: string,
    opts: {
      models: string[];
      current: string;
      profileDefault: string;
      chatOverride?: string;
      providerSlug?: string;
      onModelSelected?: (
        chatId: string,
        modelId: string,
        providerSlug: string,
      ) => Promise<string>;
    },
  ): Promise<void> {
    const pickerId = `model-${Date.now()}`;
    if (opts.onModelSelected) {
      this.pickerHandlers.set(pickerId, (value) =>
        opts.onModelSelected!(chatId, value, opts.providerSlug || ''),
      );
    }
    this.emit(chatId, {
      type: 'picker',
      kind: 'model',
      ref: pickerId,
      title: 'Model',
      detail: `current: ${opts.current} · profile: ${opts.profileDefault}`,
      options: [
        ...opts.models.slice(0, 399).map((m) => ({
          value: m,
          label: m,
          current: m === opts.current,
        })),
        { value: '__custom__', label: 'Custom model…' },
      ],
    });
  }

  async sendChoicePicker(
    chatId: string,
    title: string,
    choices: Array<{ value: string; label: string; current?: boolean }>,
    prefix?: string,
  ): Promise<void> {
    const kind = /level/i.test(title) ? 'level' : 'choice';
    this.emit(chatId, {
      type: 'picker',
      kind,
      ref: prefix || kind,
      title,
      options: choices,
    });
  }

  async sendLocalFile(
    chatId: string,
    filePath: string,
    opts?: SendLocalFileOptions,
  ): Promise<void> {
    const abs = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(opts?.workdir || this.workdir(), filePath);
    if (!existsSync(abs)) {
      throw new Error(`file not found: ${path.basename(filePath)}`);
    }
    await fs.mkdir(outboxDir(), { recursive: true });
    this.fileSeq += 1;
    const fileId = `f${this.fileSeq}`;
    const name = path.basename(abs);
    const dest = path.join(outboxDir(), `${fileId}-${name}`);
    await fs.copyFile(abs, dest);
    const kind = (opts?.kind || 'document') as AppFileKind;
    this.files.set(fileId, { abs: dest, name, kind });
    const share = await shareWorkspaceFile(abs);
    this.emit(chatId, {
      type: 'file',
      fileId,
      name,
      kind,
      caption: opts?.caption,
      url: share?.url,
    });
  }

  private async dispatchInbound(
    text: string,
    chatId: string,
    images?: InboundMessage['images'],
  ): Promise<void> {
    this.beginInboundTurn();
    const trimmed = text.trim();
    if (!trimmed || !this.onMessage) return;
    const msg: InboundMessage = {
      platform: 'app',
      chatId,
      userId: APP_DEFAULT_USER_ID,
      text: trimmed,
      images,
    };
    await this.onMessage(msg);
  }

  private async handleHttp(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const host = req.headers.host || '127.0.0.1';
    const url = new URL(req.url || '/', `http://${host}`);
    const method = (req.method || 'GET').toUpperCase();

    if (method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true, adapter: 'app', port: inboxPort() });
      return;
    }

    const publicMatch = url.pathname.match(/^\/v1\/public\/([^/]+)$/);
    if (method === 'GET' && publicMatch) {
      const rec = this.publicFiles.get(publicMatch[1] || '');
      if (!rec || !existsSync(rec.abs)) {
        sendJson(res, 404, { error: 'file not found' });
        return;
      }
      const st = await fs.stat(rec.abs);
      res.writeHead(200, {
        'content-type': rec.mime || 'application/octet-stream',
        'content-length': st.size,
        'cache-control': 'public, max-age=3600',
        'access-control-allow-origin': '*',
      });
      createReadStream(rec.abs).pipe(res);
      return;
    }

    if (method === 'POST' && url.pathname === '/v1/public') {
      if (!this.authorized(req)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      const body = await readJson(req);
      const name = path.basename(String(body.name || 'upload.bin')) || 'upload.bin';
      const raw = Buffer.from(String(body.contentBase64 || ''), 'base64');
      if (!raw.length) {
        sendJson(res, 400, { error: 'file required' });
        return;
      }
      const destDir = inboxUploadDir(this.workdir());
      await fs.mkdir(destDir, { recursive: true });
      const token = randomBytes(18).toString('base64url');
      const dest = path.join(destDir, `${token}-${name}`);
      await fs.writeFile(dest, raw);
      const ext = path.extname(name).toLowerCase();
      const mime =
        String(body.mime || '') ||
        (ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.gif'
            ? 'image/gif'
            : ext === '.webp'
              ? 'image/webp'
              : ext === '.png'
                ? 'image/png'
                : 'application/octet-stream');
      this.publicFiles.set(token, { abs: dest, name, mime });
      sendJson(res, 200, { ok: true, token, name, mime, size: raw.length });
      return;
    }

    if (!this.authorized(req)) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }

    if (method === 'GET' && url.pathname === '/v1/commands') {
      sendJson(res, 200, { commands: GATEWAY_BOT_COMMANDS });
      return;
    }

    if (method === 'GET' && url.pathname === '/v1/models') {
      try {
        const { fetchProviderModels, CUSTOM_MODEL_VALUE } = await import(
          'xibecode-core'
        );
        const { ConfigManager } = await import('../utils/config.js');
        const cfg = new ConfigManager();
        const provider = (cfg.get('provider') as string | undefined) || undefined;
        const result = await fetchProviderModels({
          baseUrl: cfg.getBaseUrl() || '',
          apiKey: cfg.getApiKey(),
          provider,
          timeoutMs: 10_000,
        });
        sendJson(res, 200, {
          ...result,
          current: cfg.getModel(),
          provider,
          custom: CUSTOM_MODEL_VALUE,
        });
      } catch (err: any) {
        sendJson(res, 502, { error: err?.message || String(err), models: [] });
      }
      return;
    }

    if (method === 'GET' && url.pathname === '/v1/conversations') {
      const chatId = url.searchParams.get('chatId') || APP_DEFAULT_CHAT_ID;
      const listed = await listConversations('app', chatId);
      sendJson(res, 200, listed);
      return;
    }

    const convoGet = url.pathname.match(/^\/v1\/conversations\/([^/]+)$/);
    if (method === 'GET' && convoGet) {
      const sessionId = decodeURIComponent(convoGet[1] || '').trim();
      if (!sessionId) {
        sendJson(res, 400, { error: 'missing session id' });
        return;
      }
      const manager = new SessionManager();
      const loaded = await manager.loadSession(sessionId);
      if (!loaded) {
        sendJson(res, 404, { error: 'conversation not found', sessionId });
        return;
      }
      const resume = await loadResumeContext(manager.getSessionPath(sessionId, loaded.cwd));
      sendJson(res, 200, {
        sessionId: loaded.id,
        title: loaded.title,
        cwd: loaded.cwd,
        created: loaded.created,
        updated: loaded.updated,
        parentSessionId: loaded.parentSessionId,
        successorSessionId: loaded.successorSessionId,
        conversationStatus: loaded.conversationStatus,
        messages: loaded.messages,
        handoff: resume.handoff,
      });
      return;
    }

    if (method === 'POST' && url.pathname === '/v1/conversations/new') {
      const body = await readJson(req);
      const chatId = String(body.chatId || APP_DEFAULT_CHAT_ID);
      await this.dispatchInbound('/new', chatId);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === 'POST' && url.pathname === '/v1/conversations/switch') {
      const body = await readJson(req);
      const chatId = String(body.chatId || APP_DEFAULT_CHAT_ID);
      const sessionId = String(body.sessionId || '').trim();
      if (!sessionId) {
        sendJson(res, 400, { error: 'sessionId required' });
        return;
      }
      await this.dispatchInbound(`/history open ${sessionId}`, chatId);
      sendJson(res, 200, { ok: true, sessionId });
      return;
    }

    if (method === 'GET' && url.pathname === '/v1/status') {
      const elapsedMs =
        this.lastTurn?.busy && this.lastTurn.startedAt
          ? Date.now() - this.lastTurn.startedAt
          : this.lastTurn?.elapsedMs;
      sendJson(res, 200, {
        ok: true,
        usage: this.lastUsage,
        turn: this.lastTurn
          ? { ...this.lastTurn, elapsedMs }
          : { busy: false },
      });
      return;
    }

    if (method === 'GET' && url.pathname === '/v1/computer/browser') {
      pipeAgentBrowserScreencast(req, res);
      return;
    }

    if (method === 'GET' && url.pathname === '/v1/computer/status') {
      const status = await ensureAgentBrowserStream(streamPort()).catch((err: Error) => ({
        enabled: false,
        error: err.message,
      }));
      sendJson(res, 200, { ok: true, ...status, port: streamPort() });
      return;
    }

    if (method === 'GET' && url.pathname === '/v1/chat/events') {
      const chatId = url.searchParams.get('chatId') || APP_DEFAULT_CHAT_ID;
      const since = url.searchParams.get('since') || '';
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      res.write(
        `data: ${JSON.stringify({ type: 'ready', id: 'ready', ts: Date.now(), chatId })}\n\n`,
      );
      if (this.lastUsage) {
        res.write(
          `data: ${JSON.stringify({
            type: 'usage',
            id: 'usage',
            ts: Date.now(),
            chatId,
            ...this.lastUsage,
            text: this.lastUsage.label,
          })}\n\n`,
        );
      }
      if (this.lastTurn) {
        const elapsedMs =
          this.lastTurn.busy && this.lastTurn.startedAt
            ? Date.now() - this.lastTurn.startedAt
            : this.lastTurn.elapsedMs;
        res.write(
          `data: ${JSON.stringify({
            type: 'status',
            id: 'status',
            ts: Date.now(),
            chatId,
            ...this.lastTurn,
            elapsedMs,
          })}\n\n`,
        );
      }
      const writeEv = (ev: AppChatEvent) => {
        if (ev.chatId !== chatId) return;
        res.write(`id: ${ev.id}\n`);
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
      };
      const sinceN = Number(since);
      for (const ev of this.events) {
        if (Number.isFinite(sinceN) && Number(ev.id) <= sinceN) continue;
        writeEv(ev);
      }
      const listener = (ev: AppChatEvent) => writeEv(ev);
      this.listeners.add(listener);
      const ping = setInterval(() => {
        res.write(`: ping ${Date.now()}\n\n`);
      }, 15_000);
      req.on('close', () => {
        clearInterval(ping);
        this.listeners.delete(listener);
      });
      return;
    }

    const fileMatch = url.pathname.match(/^\/v1\/files\/([^/]+)$/);
    if (method === 'GET' && fileMatch) {
      const rec = this.files.get(fileMatch[1] || '');
      if (!rec || !existsSync(rec.abs)) {
        sendJson(res, 404, { error: 'file not found' });
        return;
      }
      const st = await fs.stat(rec.abs);
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': st.size,
        'content-disposition': `attachment; filename="${rec.name.replace(/"/g, '')}"`,
      });
      createReadStream(rec.abs).pipe(res);
      return;
    }

    if (method === 'POST' && url.pathname === '/v1/chat') {
      const body = await readJson(req);
      const chatId = String(body.chatId || APP_DEFAULT_CHAT_ID);
      const text = String(body.text || '');
      const files = Array.isArray(body.files)
        ? (body.files as Array<{
            name?: string;
            contentBase64?: string;
            mime?: string;
            url?: string;
          }>)
        : [];
      const uploaded: Array<{
        name: string;
        savedPath?: string;
        inlineText?: string;
        mime?: string;
        kind?: AppFileKind;
        publicUrl?: string;
      }> = [];
      const inboundImages: NonNullable<InboundMessage['images']> = [];
      if (files.length) {
        const destDir = inboxUploadDir(this.workdir());
        await fs.mkdir(destDir, { recursive: true });
        await fs.mkdir(outboxDir(), { recursive: true });
        for (const f of files.slice(0, 12)) {
          const name = path.basename(String(f.name || 'upload.bin')) || 'upload.bin';
          const hosted = String(f.url || '').trim();
          const raw = Buffer.from(String(f.contentBase64 || ''), 'base64');
          const kind = fileKindFromName(name, f.mime);
          this.fileSeq += 1;
          const fileId = `f${this.fileSeq}`;
          let dest: string | undefined;
          if (raw.length) {
            dest = path.join(destDir, `${fileId}-${name}`);
            await fs.writeFile(dest, raw);
            const outDest = path.join(outboxDir(), `${fileId}-${name}`);
            await fs.copyFile(dest, outDest);
            this.files.set(fileId, { abs: outDest, name, kind });
          }
          if (!dest && !/^https?:\/\//i.test(hosted)) continue;
          this.emit(chatId, {
            type: 'file',
            fileId,
            name,
            kind,
            mime: f.mime,
            size: raw.length || undefined,
            url: hosted || undefined,
            role: 'user',
            caption: text || undefined,
          });
          if (dest && looksTextFile(name, f.mime) && raw.length <= TEXT_INLINE_MAX) {
            uploaded.push({
              name,
              savedPath: dest,
              inlineText: raw.toString('utf8'),
              mime: f.mime,
              kind,
            });
          } else {
            let publicUrl = /^https?:\/\//i.test(hosted) ? hosted : undefined;
            if (!publicUrl && dest && kind === 'photo') {
              publicUrl = await this.publishImageUrl(dest);
            }
            if (kind === 'photo') {
              inboundImages.push({
                path: dest || publicUrl || name,
                mime: String(f.mime || 'image/png'),
                url: publicUrl,
              });
            }
            uploaded.push({ name, savedPath: dest, mime: f.mime, kind, publicUrl });
          }
        }
      }
      const prompt = inlineUploadPrompt(text, uploaded);
      if (!prompt.trim()) {
        sendJson(res, 400, { error: 'text or files required' });
        return;
      }
      void this.dispatchInbound(prompt, chatId, inboundImages).catch((err: any) => {
        this.log(`app inbound failed: ${err?.message || err}`);
        this.emit(chatId, {
          type: 'error',
          text: String(err?.message || err),
        });
      });
      sendJson(res, 202, { ok: true, chatId });
      return;
    }

    if (method === 'POST' && url.pathname === '/v1/chat/stop') {
      const body = await readJson(req).catch(() => ({}) as Record<string, unknown>);
      const chatId = String(body.chatId || APP_DEFAULT_CHAT_ID);
      void this.dispatchInbound('/stop', chatId);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === 'POST' && url.pathname === '/v1/chat/approve') {
      const body = await readJson(req);
      const chatId = String(body.chatId || APP_DEFAULT_CHAT_ID);
      const choice = String(body.choice || 'deny').toLowerCase();
      const allowed = ['once', 'session', 'always', 'deny'];
      const cmd = allowed.includes(choice) ? `/${choice}` : '/deny';
      void this.dispatchInbound(cmd, chatId);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === 'POST' && url.pathname === '/v1/chat/answer') {
      const body = await readJson(req);
      const chatId = String(body.chatId || APP_DEFAULT_CHAT_ID);
      const askId = String(body.id || body.ref || '');
      const answer = String(body.answer || '');
      const idx = Number(body.index);
      const text =
        askId && Number.isInteger(idx)
          ? `__ask:${askId}:${idx}`
          : answer;
      if (!text.trim()) {
        sendJson(res, 400, { error: 'answer required' });
        return;
      }
      void this.dispatchInbound(text, chatId);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === 'POST' && url.pathname === '/v1/chat/pick') {
      const body = await readJson(req);
      const chatId = String(body.chatId || APP_DEFAULT_CHAT_ID);
      const ref = String(body.id || body.ref || '');
      const value = String(body.value || '');
      const handler = this.pickerHandlers.get(ref);
      if (handler && value) {
        try {
          const msg = await handler(value);
          this.pickerHandlers.delete(ref);
          if (msg) this.emit(chatId, { type: 'text', text: msg, final: true });
        } catch (err: any) {
          this.emit(chatId, {
            type: 'error',
            text: err?.message || String(err),
          });
        }
        sendJson(res, 200, { ok: true });
        return;
      }
      if (!value) {
        sendJson(res, 400, { error: 'value required' });
        return;
      }
      // Fallback: send as slash so /model and /level still work
      const kind = String(body.kind || '');
      const cmd =
        kind === 'level'
          ? `/level ${value}`
          : kind === 'model'
            ? `/model ${value}`
            : value.startsWith('/')
              ? value
              : `/model ${value}`;
      void this.dispatchInbound(cmd, chatId);
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  }

  async runLoop(onMessage: (msg: InboundMessage) => Promise<void>): Promise<void> {
    this.onMessage = onMessage;
    this.secrets = await ensureInboxSecret();
    const port = inboxPort();
    this.server = createServer((req, res) => {
      void this.handleHttp(req, res).catch((err: any) => {
        this.log(`app inbox error: ${err?.message || err}`);
        if (!res.headersSent) sendJson(res, 500, { error: err?.message || 'error' });
        else res.end();
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(port, '0.0.0.0', () => {
        this.log(`app inbox listening on :${port}`);
        resolve();
      });
    });
    await new Promise<void>((resolve) => {
      this.loopResolve = resolve;
    });
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.onMessage = null;
    try {
      this.server?.close();
    } catch {
      /* ignore */
    }
    this.server = null;
    this.listeners.clear();
    this.loopResolve?.();
    this.loopResolve = null;
  }
}
