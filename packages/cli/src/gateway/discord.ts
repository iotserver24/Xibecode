/**
 * Discord Gateway adapter (WebSocket) for coding 24/7 chat.
 * Uses REST for replies + Gateway v10 for MESSAGE_CREATE + slash commands.
 * Requires DISCORD_BOT_TOKEN. Slash menu registered like Telegram setMyCommands.
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import fetch from 'node-fetch';
import type { InboundMessage, MessagingAdapter, SendLocalFileOptions } from './types.js';
import {
  chunkForChat,
  GATEWAY_BOT_COMMANDS,
  stripLeakedToolMarkup,
} from './format.js';

/** Commands that accept free-text args after the name (shown as option in Discord UI). */
const COMMANDS_WITH_ARGS = new Set([
  'cmd',
  'queue',
  'workdir',
  'progress',
  'level',
  'model',
  'models',
  'skills',
  'skill',
  'update',
  'pair',
]);

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
  private applicationId: string | null = null;
  private slashRegistered = false;

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
    const cleaned = stripLeakedToolMarkup(text);
    if (!cleaned.trim()) return;
    const chunks = chunkForChat(cleaned, 1900); // Discord limit 2000
    for (const chunk of chunks) {
      await this.rest(`/channels/${chatId}/messages`, {
        method: 'POST',
        // flags: SUPPRESS_EMBEDS (1<<2) — match Telegram disable_web_page_preview
        body: { content: chunk, flags: 4 },
      });
    }
  }

  async sendLocalFile(
    chatId: string,
    filePath: string,
    opts?: SendLocalFileOptions,
  ): Promise<void> {
    const abs = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(opts?.workdir || process.cwd(), filePath);
    const st = await stat(abs);
    if (!st.isFile()) throw new Error(`file not found: ${path.basename(filePath)}`);
    const max = 25 * 1024 * 1024;
    if (st.size > max) {
      throw new Error(`too large for Discord upload (${st.size} bytes)`);
    }
    const name = path.basename(abs);
    const buf = await readFile(abs);
    const form = new FormData();
    form.append('files[0]', new Blob([buf]), name);
    form.append(
      'payload_json',
      JSON.stringify({
        content: (opts?.caption || '').slice(0, 1900),
        flags: 4,
      }),
    );
    const res = await fetch(`https://discord.com/api/v10/channels/${chatId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${this.token}`,
        'User-Agent': 'XibeCode-Gateway (https://github.com/iotserver24/xibecode, 1.0)',
      },
      body: form as any,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Discord file ${res.status}: ${text.slice(0, 200)}`);
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
    // Defense in depth: never show leaked tool markup in progress/draft bubbles
    const body = stripLeakedToolMarkup(text).slice(0, 1900);
    if (!body.trim()) return previousMessageId;
    try {
      if (previousMessageId) {
        await this.rest(`/channels/${chatId}/messages/${previousMessageId}`, {
          method: 'PATCH',
          body: { content: body, flags: 4 },
        });
        return previousMessageId;
      }
    } catch {
      /* send new */
    }
    try {
      const msg = await this.rest(`/channels/${chatId}/messages`, {
        method: 'POST',
        body: { content: body, flags: 4 },
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

  /**
   * Register global slash commands so typing `/` shows the same menu as Telegram.
   * Uses bulk overwrite (PUT). Propagation can take a minute for global commands.
   *
   * Note: plain-text `/pair list` in a **server channel** is invisible without
   * Message Content Intent — use the slash picker or @mention the bot.
   */
  private async registerSlashCommands(): Promise<void> {
    if (this.slashRegistered || !this.applicationId) return;
    try {
      const body = GATEWAY_BOT_COMMANDS.map((c) => {
        const cmd: Record<string, unknown> = {
          name: c.command.slice(0, 32).toLowerCase(),
          // Discord description max 100 chars (Telegram allows 256)
          description: c.description.slice(0, 100) || c.command,
          type: 1, // CHAT_INPUT
          // Visible in DMs with the bot
          dm_permission: true,
        };

        // Rich /pair subcommands (list | approve | channel | server | …)
        if (c.command === 'pair') {
          cmd.options = [
            {
              type: 1, // SUB_COMMAND
              name: 'list',
              description: 'Pending codes + approved users/channels',
            },
            {
              type: 1,
              name: 'channel',
              description: 'Open THIS channel to everyone',
            },
            {
              type: 1,
              name: 'server',
              description: 'Open THIS Discord server to everyone',
            },
            {
              type: 1,
              name: 'help',
              description: 'How pairing works',
            },
            {
              type: 1,
              name: 'approve',
              description: 'Approve a user pairing code',
              options: [
                {
                  type: 3, // STRING
                  name: 'code',
                  description: 'The code the user received',
                  required: true,
                },
              ],
            },
            {
              type: 1,
              name: 'revoke',
              description: 'Revoke user/channel/server access',
              options: [
                {
                  type: 3,
                  name: 'id',
                  description: 'User / channel / server id',
                  required: true,
                },
                {
                  type: 3,
                  name: 'scope',
                  description: 'What kind of id (default: any)',
                  required: false,
                  choices: [
                    { name: 'any', value: 'any' },
                    { name: 'user', value: 'user' },
                    { name: 'channel', value: 'channel' },
                    { name: 'server', value: 'server' },
                  ],
                },
              ],
            },
          ];
          return cmd;
        }

        if (COMMANDS_WITH_ARGS.has(c.command)) {
          cmd.options = [
            {
              name: 'args',
              description: 'Arguments for this command',
              type: 3, // STRING
              required: c.command === 'cmd' || c.command === 'skill',
            },
          ];
        }
        return cmd;
      });
      await this.rest(`/applications/${this.applicationId}/commands`, {
        method: 'PUT',
        body,
      });
      this.slashRegistered = true;
      this.log(
        `registered ${body.length} Discord slash commands (/ menu) — may take ~1 min to appear`,
      );
    } catch (err: any) {
      this.log(`Discord slash command register failed: ${err?.message || err}`);
    }
  }

  /** Acknowledge interaction within Discord's 3s window (ephemeral). */
  private async ackInteraction(
    interactionId: string,
    interactionToken: string,
    content?: string,
  ): Promise<void> {
    try {
      await fetch(
        `https://discord.com/api/v10/interactions/${interactionId}/${interactionToken}/callback`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'XibeCode-Gateway (https://github.com/iotserver24/xibecode, 1.0)',
          },
          body: JSON.stringify({
            type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
            data: {
              content: (content || '…').slice(0, 200),
              flags: 64, // EPHEMERAL — only the invoker sees the ack
            },
          }),
        },
      );
    } catch (err: any) {
      this.log(`interaction ack failed: ${err?.message || err}`);
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
                // DMs + messages that @mention the bot include content without the
                // privileged MESSAGE_CONTENT intent (which many bots leave off).
                // Set DISCORD_MESSAGE_CONTENT_INTENT=1 after enabling it in the portal
                // if you need full guild message content without a mention.
                intents:
                  (1 << 0) | // GUILDS
                  (1 << 9) | // GUILD_MESSAGES
                  (1 << 12) | // DIRECT_MESSAGES
                  (process.env.DISCORD_MESSAGE_CONTENT_INTENT === '1' ||
                  process.env.DISCORD_MESSAGE_CONTENT_INTENT === 'true'
                    ? 1 << 15 // MESSAGE_CONTENT (privileged)
                    : 0),
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
          this.applicationId = d?.application?.id
            ? String(d.application.id)
            : this.selfId;
          this.log(`ready as ${d?.user?.username || this.selfId}`);
          void this.registerSlashCommands();
        } else if (op === 0 && t === 'INTERACTION_CREATE') {
          await this.handleInteraction(d, onMessage);
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

  /**
   * Discord native slash command → same `/cmd` text path as Telegram.
   */
  private async handleInteraction(
    d: any,
    onMessage: (msg: InboundMessage) => Promise<void>,
  ): Promise<void> {
    // type 2 = APPLICATION_COMMAND
    if (!d || d.type !== 2) return;

    const userId = String(d.member?.user?.id || d.user?.id || '');
    const chatId = String(d.channel_id || '');
    const name = String(d.data?.name || '').toLowerCase().trim();
    if (!chatId || !userId || !name) return;

    const opts: any[] = Array.isArray(d.data?.options) ? d.data.options : [];
    // Subcommand (type 1): /pair list, /pair approve code:XXX
    const sub = opts.find((o) => o?.type === 1 || (o?.options && !o?.value));
    let args = '';
    if (sub?.name) {
      const subOpts: any[] = Array.isArray(sub.options) ? sub.options : [];
      const parts = [String(sub.name)];
      for (const so of subOpts) {
        if (so?.name === 'scope' && so.value && so.value !== 'any') {
          parts.push(String(so.value));
        } else if (so?.name === 'code' || so?.name === 'id') {
          parts.push(String(so.value ?? '').trim());
        } else if (so?.value != null && so.value !== '') {
          parts.push(String(so.value).trim());
        }
      }
      // revoke: prefer "scope id" order for chat-controller
      if (sub.name === 'revoke') {
        const scope = subOpts.find((o) => o?.name === 'scope')?.value;
        const id = subOpts.find((o) => o?.name === 'id')?.value;
        if (id) {
          args =
            scope && scope !== 'any'
              ? `${scope} ${id}`
              : String(id);
        } else {
          args = parts.slice(1).join(' ');
        }
        args = `revoke ${args}`.trim();
      } else {
        args = parts.join(' ');
      }
    } else {
      for (const o of opts) {
        if (o?.name === 'args' || o?.name === 'command' || o?.name === 'input') {
          args = String(o.value ?? '').trim();
          break;
        }
      }
      if (!args) {
        const first = opts.find((o) => typeof o?.value === 'string');
        if (first) args = String(first.value).trim();
      }
    }

    const text = args ? `/${name} ${args}` : `/${name}`;

    // Must ack within 3s; real replies go via sendMessage like normal chat
    await this.ackInteraction(
      String(d.id),
      String(d.token),
      `✓ \`${text.slice(0, 80)}\``,
    );

    const username = d.member?.user?.username || d.user?.username;
    const guildId = d.guild_id ? String(d.guild_id) : undefined;
    if (
      !(await this.authorizeUser(userId, chatId, {
        guildId,
        username,
      }))
    ) {
      return;
    }

    try {
      await onMessage({
        platform: 'discord',
        chatId,
        userId,
        text,
        messageId: d.id ? String(d.id) : undefined,
        username,
        guildId,
      });
    } catch (err: any) {
      this.log(`slash handler error: ${err?.message || err}`);
      await this.sendMessage(chatId, `Error: ${err?.message || err}`).catch(
        () => {},
      );
    }
  }

  /**
   * Access: allowlist user → paired user → paired channel → paired guild → code.
   */
  private async authorizeUser(
    userId: string,
    chatId: string,
    meta?: { guildId?: string; username?: string },
  ): Promise<boolean> {
    // null allowed = GATEWAY_ALLOW_ALL_USERS
    if (!this.allowed) return true;
    if (this.allowed.has(userId) || this.allowed.has(chatId)) return true;
    try {
      const {
        isAccessPaired,
        requestPairing,
        formatPairingDenied,
      } = await import('./pairing.js');
      if (
        await isAccessPaired({
          platform: 'discord',
          userId,
          chatId,
          guildId: meta?.guildId,
        })
      ) {
        return true;
      }
      const code = await requestPairing('discord', userId, chatId, {
        guildId: meta?.guildId,
        username: meta?.username,
      });
      this.log(
        `denied user ${userId}${meta?.username ? ` (@${meta.username})` : ''} — pairing ${code}`,
      );
      const isDm = !meta?.guildId;
      await this.sendMessage(
        chatId,
        formatPairingDenied({
          platform: 'discord',
          code,
          context: isDm ? 'dm' : 'channel',
        }),
      ).catch(() => {});
      // Ping operator home channel if set (so they see the code without watching this chat)
      const home = this.homeChannel;
      if (home && home !== chatId) {
        await this.sendMessage(
          home,
          `🔔 Pairing request (Discord)\n` +
            `User: ${meta?.username || userId} (\`${userId}\`)\n` +
            `Chat: \`${chatId}\`\n` +
            (meta?.guildId ? `Guild: \`${meta.guildId}\`\n` : '') +
            `Code: \`${code}\`\n` +
            `Approve: \`/pair approve ${code}\``,
        ).catch(() => {});
      }
    } catch {
      await this.sendMessage(
        chatId,
        'Access denied. Add your user id to DISCORD_ALLOWED_USERS or use `/pair`.',
      ).catch(() => {});
    }
    return false;
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
    const guildId = d.guild_id ? String(d.guild_id) : undefined;
    const username = d.author?.username;
    let text = String(d.content || '').trim();
    if (!chatId || !userId) return;

    // Guild messages without Message Content Intent arrive with empty content
    // unless the bot is @mentioned (or it's a DM / slash interaction).
    if (!text) {
      if (d.guild_id) {
        // Silently ignore — user should use slash menu or @mention
        return;
      }
      return;
    }

    // Require mention in guild channels unless it's a DM (guild_id missing)
    const isDm = !d.guild_id;
    if (!isDm && this.selfId) {
      const mention = `<@${this.selfId}>`;
      const mentionNick = `<@!${this.selfId}>`;
      if (!text.includes(mention) && !text.includes(mentionNick)) {
        // Allow slash-like commands without mention if they start with /
        // (only works when Message Content Intent is on)
        if (!text.startsWith('/')) return;
      }
      text = text.replace(mention, '').replace(mentionNick, '').trim();
      if (!text) return;
    }

    if (
      !(await this.authorizeUser(userId, chatId, {
        guildId,
        username,
      }))
    ) {
      return;
    }

    try {
      await onMessage({
        platform: 'discord',
        chatId,
        userId,
        text,
        messageId: d.id ? String(d.id) : undefined,
        username,
        guildId,
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
