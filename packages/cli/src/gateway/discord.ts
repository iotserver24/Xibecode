/**
 * Discord Gateway adapter (WebSocket) for coding 24/7 chat.
 * Uses REST for replies + Gateway v10 for MESSAGE_CREATE.
 * Requires DISCORD_BOT_TOKEN and Message Content Intent enabled.
 */

import fetch from 'node-fetch';
import type { InboundMessage, MessagingAdapter } from './types.js';
import { chunkForChat } from './format.js';

export interface DiscordConfig {
  botToken: string;
  allowedUsers?: string[];
  /** Guild channel or user id for cron home. */
  homeChatId?: string;
}

type WsLike = {
  send: (data: string) => void;
  close: () => void;
  addEventListener?: (type: string, fn: (ev: any) => void) => void;
  on?: (event: string, fn: (...args: any[]) => void) => void;
  readyState?: number;
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
  // Fallback: optional 'ws' package
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
      'Discord needs WebSocket support (Node 22+ global WebSocket, or install `ws`)',
    );
  }
}

function onWs(ws: WsLike, event: string, fn: (data: any) => void): void {
  if (typeof ws.addEventListener === 'function') {
    ws.addEventListener(event, (ev: any) => {
      if (event === 'message') {
        const data = typeof ev.data === 'string' ? ev.data : ev.data?.toString?.() ?? ev;
        fn(data);
      } else {
        fn(ev);
      }
    });
  } else if (typeof ws.on === 'function') {
    ws.on(event, fn);
  }
}

export class DiscordAdapter implements MessagingAdapter {
  readonly name = 'discord' as const;
  private token: string;
  private allowed: Set<string> | null;
  homeChannel?: string;
  private stopped = false;
  private ws: WsLike | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private sequence: number | null = null;
  private log: (m: string) => void;
  private selfId: string | null = null;

  constructor(config: DiscordConfig, log?: (m: string) => void) {
    this.token = config.botToken;
    this.homeChannel =
      config.homeChatId ||
      process.env.DISCORD_HOME_CHANNEL ||
      process.env.DISCORD_HOME_CHANNEL_ID;
    this.log = log || ((m) => console.log(`[discord] ${m}`));

    if (config.allowedUsers?.length) {
      this.allowed = new Set(config.allowedUsers.map(String));
    } else if (process.env.DISCORD_ALLOWED_USERS?.trim()) {
      this.allowed = new Set(
        process.env.DISCORD_ALLOWED_USERS.split(',').map((s) => s.trim()).filter(Boolean),
      );
    } else if (process.env.GATEWAY_ALLOW_ALL_USERS === 'true') {
      this.allowed = null;
    } else {
      this.allowed = new Set();
      this.log(
        'No DISCORD_ALLOWED_USERS — denying all. Set DISCORD_ALLOWED_USERS or GATEWAY_ALLOW_ALL_USERS=true',
      );
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  private rest(path: string, init?: { method?: string; body?: any }): Promise<any> {
    return fetch(`https://discord.com/api/v10${path}`, {
      method: init?.method || 'GET',
      headers: {
        Authorization: `Bot ${this.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'XibeCode-Gateway (https://github.com/iotserver24/xibecode, 1.0)',
      },
      body: init?.body != null ? JSON.stringify(init.body) : undefined,
    }).then(async (res) => {
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      if (!res.ok) {
        throw new Error(`Discord REST ${path}: ${res.status} ${text.slice(0, 200)}`);
      }
      return data;
    });
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    const chunks = chunkForChat(text, 1900); // Discord limit 2000
    for (const chunk of chunks) {
      await this.rest(`/channels/${chatId}/messages`, {
        method: 'POST',
        body: { content: chunk },
      });
    }
  }

  async sendTyping(chatId: string): Promise<void> {
    try {
      await this.rest(`/channels/${chatId}/typing`, { method: 'POST', body: {} });
    } catch {
      /* ignore */
    }
  }

  async sendOrEditProgress(
    chatId: string,
    text: string,
    previousMessageId?: string,
  ): Promise<string | undefined> {
    const body = text.slice(0, 1900);
    try {
      if (previousMessageId) {
        await this.rest(`/channels/${chatId}/messages/${previousMessageId}`, {
          method: 'PATCH',
          body: { content: body },
        });
        return previousMessageId;
      }
    } catch {
      /* send new */
    }
    try {
      const msg = await this.rest(`/channels/${chatId}/messages`, {
        method: 'POST',
        body: { content: body },
      });
      return msg?.id ? String(msg.id) : undefined;
    } catch {
      return previousMessageId;
    }
  }

  async runLoop(onMessage: (msg: InboundMessage) => Promise<void>): Promise<void> {
    this.log('connecting to Discord Gateway…');
    const gateway = await this.rest('/gateway/bot');
    const url = `${gateway.url}?v=10&encoding=json`;

    while (!this.stopped) {
      try {
        await this.session(url, onMessage);
      } catch (err: any) {
        if (this.stopped) break;
        this.log(`gateway error: ${err?.message || err}; reconnect in 5s`);
        await sleep(5000);
      }
    }
  }

  private async session(
    url: string,
    onMessage: (msg: InboundMessage) => Promise<void>,
  ): Promise<void> {
    const ws = await createWebSocket(url);
    this.ws = ws;
    let heartbeatInterval = 41250;
    let identified = false;

    await new Promise<void>((resolve, reject) => {
      const handlePayload = async (raw: string) => {
        let payload: any;
        try {
          payload = JSON.parse(typeof raw === 'string' ? raw : String(raw));
        } catch {
          return;
        }
        if (payload.s != null) this.sequence = payload.s;
        const op = payload.op;
        const t = payload.t;
        const d = payload.d;

        if (op === 10) {
          // Hello
          heartbeatInterval = d.heartbeat_interval || 41250;
          this.startHeartbeat(ws, heartbeatInterval);
          ws.send(
            JSON.stringify({
              op: 2,
              d: {
                token: this.token,
                intents:
                  (1 << 0) | // GUILDS
                  (1 << 9) | // GUILD_MESSAGES
                  (1 << 12) | // DIRECT_MESSAGES
                  (1 << 15), // MESSAGE_CONTENT
                properties: {
                  os: process.platform,
                  browser: 'xibecode',
                  device: 'xibecode',
                },
              },
            }),
          );
          identified = true;
          this.log('identified');
        } else if (op === 11) {
          // heartbeat ack
        } else if (op === 7 || op === 9) {
          this.log(`reconnect requested (op ${op})`);
          ws.close();
          resolve();
        } else if (op === 0 && t === 'READY') {
          this.selfId = d?.user?.id ? String(d.user.id) : null;
          this.log(`ready as ${d?.user?.username || this.selfId}`);
        } else if (op === 0 && t === 'MESSAGE_CREATE') {
          await this.handleMessageCreate(d, onMessage);
        }
      };

      onWs(ws, 'message', (data) => {
        void handlePayload(data);
      });
      onWs(ws, 'close', () => {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
        resolve();
      });
      onWs(ws, 'error', (err) => {
        if (!identified) reject(err);
        else this.log(`ws error: ${err?.message || err}`);
      });
    });
  }

  private startHeartbeat(ws: WsLike, interval: number): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      try {
        ws.send(JSON.stringify({ op: 1, d: this.sequence }));
      } catch {
        /* ignore */
      }
    }, interval);
  }

  private async handleMessageCreate(
    d: any,
    onMessage: (msg: InboundMessage) => Promise<void>,
  ): Promise<void> {
    if (!d || d.author?.bot) return;
    if (this.selfId && String(d.author?.id) === this.selfId) return;

    const userId = String(d.author?.id || '');
    const chatId = String(d.channel_id || '');
    let text = String(d.content || '').trim();
    if (!chatId || !userId || !text) return;

    // Require mention in guild channels unless it's a DM (guild_id missing)
    const isDm = !d.guild_id;
    if (!isDm && this.selfId) {
      const mention = `<@${this.selfId}>`;
      const mentionNick = `<@!${this.selfId}>`;
      if (!text.includes(mention) && !text.includes(mentionNick)) {
        // Allow slash-like commands without mention if they start with /
        if (!text.startsWith('/')) return;
      }
      text = text.replace(mention, '').replace(mentionNick, '').trim();
    }

    if (this.allowed && !this.allowed.has(userId)) {
      try {
        const { isPaired, requestPairing } = await import('./pairing.js');
        if (!(await isPaired('discord', userId))) {
          const code = await requestPairing('discord', userId, chatId);
          this.log(`denied user ${userId} — pairing ${code}`);
          await this.sendMessage(
            chatId,
            `Access denied.\nPairing code: \`${code}\`\nOperator: \`xibecode pair approve discord ${code}\``,
          ).catch(() => {});
          return;
        }
      } catch {
        await this.sendMessage(
          chatId,
          'Access denied. Add your user id to DISCORD_ALLOWED_USERS.',
        ).catch(() => {});
        return;
      }
    }

    try {
      await onMessage({
        platform: 'discord',
        chatId,
        userId,
        text,
        messageId: d.id ? String(d.id) : undefined,
        username: d.author?.username,
      });
    } catch (err: any) {
      this.log(`handler error: ${err?.message || err}`);
      await this.sendMessage(chatId, `Error: ${err?.message || err}`).catch(() => {});
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
