/**
 * Slack Socket Mode adapter for coding 24/7 chat.
 * Needs SLACK_BOT_TOKEN (xoxb-*) and SLACK_APP_TOKEN (xapp-* with connections:write).
 */

import fetch from 'node-fetch';
import type { InboundMessage, MessagingAdapter } from './types.js';
import { chunkForChat } from './format.js';

export interface SlackConfig {
  botToken: string;
  appToken: string;
  allowedUsers?: string[];
  homeChatId?: string;
}

type WsLike = {
  send: (data: string) => void;
  close: () => void;
  addEventListener?: (type: string, fn: (ev: any) => void) => void;
  on?: (event: string, fn: (...args: any[]) => void) => void;
};

async function createWebSocket(url: string): Promise<WsLike> {
  const g: any = globalThis as any;
  if (typeof g.WebSocket === 'function') {
    const ws = new g.WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', (e: any) => reject(e?.error || e));
    });
    return ws;
  }
  try {
    const mod = await import('ws');
    const WS = (mod as any).default || mod;
    const ws = new WS(url);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    return ws;
  } catch {
    throw new Error(
      'Slack needs WebSocket support (Node 22+ or install `ws`)',
    );
  }
}

function onWs(ws: WsLike, event: string, fn: (data: any) => void): void {
  if (typeof ws.addEventListener === 'function') {
    ws.addEventListener(event, (ev: any) => {
      if (event === 'message') {
        fn(typeof ev.data === 'string' ? ev.data : ev.data?.toString?.() ?? ev);
      } else fn(ev);
    });
  } else if (typeof ws.on === 'function') {
    ws.on(event, fn);
  }
}

export class SlackAdapter implements MessagingAdapter {
  readonly name = 'slack' as const;
  private botToken: string;
  private appToken: string;
  private allowed: Set<string> | null;
  homeChannel?: string;
  private stopped = false;
  private ws: WsLike | null = null;
  private log: (m: string) => void;
  private selfId: string | null = null;

  constructor(config: SlackConfig, log?: (m: string) => void) {
    this.botToken = config.botToken;
    this.appToken = config.appToken;
    this.homeChannel =
      config.homeChatId ||
      process.env.SLACK_HOME_CHANNEL ||
      process.env.SLACK_HOME_CHANNEL_ID;
    this.log = log || ((m) => console.log(`[slack] ${m}`));

    if (config.allowedUsers?.length) {
      this.allowed = new Set(config.allowedUsers.map(String));
    } else if (process.env.SLACK_ALLOWED_USERS?.trim()) {
      this.allowed = new Set(
        process.env.SLACK_ALLOWED_USERS.split(',').map((s) => s.trim()).filter(Boolean),
      );
    } else if (process.env.GATEWAY_ALLOW_ALL_USERS === 'true') {
      this.allowed = null;
    } else {
      this.allowed = new Set();
      this.log(
        'No SLACK_ALLOWED_USERS — denying all. Set SLACK_ALLOWED_USERS or GATEWAY_ALLOW_ALL_USERS=true',
      );
    }
  }

  stop(): void {
    this.stopped = true;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  private async slackApi(
    method: string,
    body: Record<string, unknown>,
    token?: string,
  ): Promise<any> {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token || this.botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as any;
    if (!data.ok) {
      throw new Error(`Slack ${method}: ${data.error || res.status}`);
    }
    return data;
  }

  async sendMessage(
    chatId: string,
    text: string,
    opts?: { threadId?: string },
  ): Promise<void> {
    const chunks = chunkForChat(text, 3500);
    for (const chunk of chunks) {
      await this.slackApi('chat.postMessage', {
        channel: chatId,
        text: chunk,
        thread_ts: opts?.threadId || undefined,
        mrkdwn: true,
      });
    }
  }

  async sendTyping(chatId: string): Promise<void> {
    // Slack has no universal typing in all surfaces; no-op
    void chatId;
  }

  async sendOrEditProgress(
    chatId: string,
    text: string,
    previousMessageId?: string,
    opts?: { threadId?: string },
  ): Promise<string | undefined> {
    const body = text.slice(0, 3500);
    try {
      if (previousMessageId) {
        await this.slackApi('chat.update', {
          channel: chatId,
          ts: previousMessageId,
          text: body,
        });
        return previousMessageId;
      }
    } catch {
      /* new message */
    }
    try {
      const data = await this.slackApi('chat.postMessage', {
        channel: chatId,
        text: body,
        thread_ts: opts?.threadId || undefined,
        mrkdwn: true,
      });
      return data.ts ? String(data.ts) : undefined;
    } catch {
      return previousMessageId;
    }
  }

  async runLoop(onMessage: (msg: InboundMessage) => Promise<void>): Promise<void> {
    this.log('opening Slack Socket Mode connection…');
    try {
      const auth = await this.slackApi('auth.test', {});
      this.selfId = auth.user_id ? String(auth.user_id) : null;
      this.log(`bot user ${auth.user || this.selfId}`);
    } catch (err: any) {
      this.log(`auth.test failed: ${err?.message || err}`);
    }

    while (!this.stopped) {
      try {
        await this.socketSession(onMessage);
      } catch (err: any) {
        if (this.stopped) break;
        this.log(`socket error: ${err?.message || err}; reconnect in 5s`);
        await sleep(5000);
      }
    }
  }

  private async socketSession(
    onMessage: (msg: InboundMessage) => Promise<void>,
  ): Promise<void> {
    const opened = await this.slackApi(
      'apps.connections.open',
      {},
      this.appToken,
    );
    const url = opened.url;
    if (!url) throw new Error('No Socket Mode URL from apps.connections.open');

    const ws = await createWebSocket(url);
    this.ws = ws;
    this.log('socket connected');

    await new Promise<void>((resolve) => {
      onWs(ws, 'message', (raw) => {
        void this.handleSocketMessage(raw, onMessage).catch((err) => {
          this.log(`handle error: ${err?.message || err}`);
        });
      });
      onWs(ws, 'close', () => resolve());
      onWs(ws, 'error', (err) => {
        this.log(`ws error: ${err?.message || err}`);
      });
    });
  }

  private async handleSocketMessage(
    raw: string,
    onMessage: (msg: InboundMessage) => Promise<void>,
  ): Promise<void> {
    let payload: any;
    try {
      payload = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    } catch {
      return;
    }

    // Ack envelope
    if (payload.envelope_id && this.ws) {
      try {
        this.ws.send(JSON.stringify({ envelope_id: payload.envelope_id }));
      } catch {
        /* ignore */
      }
    }

    if (payload.type === 'hello') return;

    const event = payload.payload?.event || payload.event;
    if (!event) return;
    if (event.type !== 'message' && event.type !== 'app_mention') return;
    if (event.subtype) return; // edits, bot messages, etc.
    if (event.bot_id || event.user === this.selfId) return;

    const userId = String(event.user || '');
    const chatId = String(event.channel || '');
    let text = String(event.text || '').trim();
    if (!chatId || !userId || !text) return;

    // Strip bot mention
    text = text.replace(/<@[A-Z0-9]+>/g, '').trim();
    if (!text) return;

    if (this.allowed && !this.allowed.has(userId)) {
      try {
        const { isPaired, requestPairing } = await import('./pairing.js');
        if (!(await isPaired('slack', userId))) {
          const code = await requestPairing('slack', userId, chatId);
          this.log(`denied user ${userId} — pairing ${code}`);
          await this.sendMessage(
            chatId,
            `Access denied. Pairing code: \`${code}\` — operator: \`xibecode pair approve slack ${code}\``,
            { threadId: event.thread_ts || event.ts },
          ).catch(() => {});
          return;
        }
      } catch {
        await this.sendMessage(
          chatId,
          'Access denied. Add your user id to SLACK_ALLOWED_USERS.',
          { threadId: event.thread_ts || event.ts },
        ).catch(() => {});
        return;
      }
    }

    const threadId = event.thread_ts || event.ts;

    try {
      await onMessage({
        platform: 'slack',
        chatId,
        userId,
        text,
        messageId: event.ts ? String(event.ts) : undefined,
        threadId: threadId ? String(threadId) : undefined,
      });
    } catch (err: any) {
      this.log(`handler error: ${err?.message || err}`);
      await this.sendMessage(chatId, `Error: ${err?.message || err}`, {
        threadId: threadId ? String(threadId) : undefined,
      }).catch(() => {});
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
