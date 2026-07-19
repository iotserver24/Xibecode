/**
 * Telegram long-polling adapter — coding gateway.
 * MarkdownV2-safe plain text with optional Markdown parse mode fallback.
 */

import fetch from 'node-fetch';
import type { InboundMessage, MessagingAdapter } from './types.js';
import { chunkForChat } from './format.js';

export interface TelegramConfig {
  botToken: string;
  allowedUsers?: string[];
  homeChatId?: string;
}

export class TelegramAdapter implements MessagingAdapter {
  readonly name = 'telegram' as const;
  private token: string;
  private allowed: Set<string> | null;
  homeChannel?: string;
  private offset = 0;
  private stopped = false;
  private log: (m: string) => void;

  constructor(config: TelegramConfig, log?: (m: string) => void) {
    this.token = config.botToken;
    this.homeChannel = config.homeChatId || process.env.TELEGRAM_HOME_CHANNEL;
    this.log = log || ((m) => console.log(`[telegram] ${m}`));
    if (config.allowedUsers?.length) {
      this.allowed = new Set(config.allowedUsers.map((s) => s.trim()).filter(Boolean));
    } else if (process.env.TELEGRAM_ALLOWED_USERS?.trim()) {
      this.allowed = new Set(
        process.env.TELEGRAM_ALLOWED_USERS.split(',').map((s) => s.trim()).filter(Boolean),
      );
    } else if (process.env.GATEWAY_ALLOW_ALL_USERS === 'true') {
      this.allowed = null;
    } else {
      this.allowed = new Set();
      this.log(
        'No TELEGRAM_ALLOWED_USERS — denying all. Set TELEGRAM_ALLOWED_USERS or GATEWAY_ALLOW_ALL_USERS=true',
      );
    }
  }

  stop(): void {
    this.stopped = true;
  }

  private apiUrl(method: string): string {
    return `https://api.telegram.org/bot${this.token}/${method}`;
  }

  private async api(method: string, body: Record<string, unknown>): Promise<any> {
    const res = await fetch(this.apiUrl(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || data.ok === false) {
      const desc = data.description || (await res.text().catch(() => ''));
      throw new Error(`Telegram ${method}: ${res.status} ${desc}`);
    }
    return data.result;
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    const chunks = chunkForChat(text, 3900);
    for (const chunk of chunks) {
      try {
        await this.api('sendMessage', {
          chat_id: chatId,
          text: chunk,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        });
      } catch {
        // Fallback plain text if Markdown fails (unbalanced fences etc.)
        await this.api('sendMessage', {
          chat_id: chatId,
          text: chunk,
          disable_web_page_preview: true,
        });
      }
    }
  }

  async sendTyping(chatId: string): Promise<void> {
    try {
      await this.api('sendChatAction', { chat_id: chatId, action: 'typing' });
    } catch {
      /* ignore */
    }
  }

  async sendOrEditProgress(
    chatId: string,
    text: string,
    previousMessageId?: string,
  ): Promise<string | undefined> {
    const body = text.slice(0, 3500);
    try {
      if (previousMessageId) {
        await this.api('editMessageText', {
          chat_id: chatId,
          message_id: Number(previousMessageId),
          text: body,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        });
        return previousMessageId;
      }
    } catch {
      /* fall through to send new */
    }
    try {
      const result = await this.api('sendMessage', {
        chat_id: chatId,
        text: body,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });
      return result?.message_id != null ? String(result.message_id) : undefined;
    } catch {
      try {
        const result = await this.api('sendMessage', {
          chat_id: chatId,
          text: body,
          disable_web_page_preview: true,
        });
        return result?.message_id != null ? String(result.message_id) : undefined;
      } catch {
        return previousMessageId;
      }
    }
  }

  async runLoop(onMessage: (msg: InboundMessage) => Promise<void>): Promise<void> {
    this.log('long-polling started');
    while (!this.stopped) {
      try {
        const url = new URL(this.apiUrl('getUpdates'));
        url.searchParams.set('timeout', '30');
        url.searchParams.set('offset', String(this.offset));
        url.searchParams.set(
          'allowed_updates',
          JSON.stringify(['message']),
        );

        const res = await fetch(url.toString(), { method: 'GET' });
        if (!res.ok) {
          this.log(`getUpdates HTTP ${res.status}`);
          await sleep(3000);
          continue;
        }
        const data = (await res.json()) as { ok: boolean; result?: any[] };
        if (!data.ok || !data.result) {
          await sleep(1000);
          continue;
        }

        for (const update of data.result) {
          this.offset = Math.max(this.offset, (update.update_id || 0) + 1);
          const msg = update.message;
          if (!msg) continue;

          const chatId = String(msg.chat?.id ?? '');
          const userId = String(msg.from?.id ?? '');
          if (!chatId || !userId) continue;

          if (this.allowed && !this.allowed.has(userId) && !this.allowed.has(chatId)) {
            // Pairing fallback 
            try {
              const { isPaired, requestPairing } = await import('./pairing.js');
              if (await isPaired('telegram', userId)) {
                // allowed via pairing
              } else {
                const code = await requestPairing('telegram', userId, chatId);
                this.log(`denied user ${userId} — pairing code ${code}`);
                await this.sendMessage(
                  chatId,
                  `Access denied.\nPairing code: \`${code}\`\nOperator: \`xibecode pair approve telegram ${code}\``,
                ).catch(() => {});
                continue;
              }
            } catch {
              this.log(`denied user ${userId}`);
              await this.sendMessage(
                chatId,
                'Access denied. Add your user id to TELEGRAM_ALLOWED_USERS or use pairing.',
              ).catch(() => {});
              continue;
            }
          }

          let text = typeof msg.text === 'string' ? msg.text : '';
          // Caption from code documents
          if (!text && typeof msg.caption === 'string') text = msg.caption;
          // Document filename hint for coding
          if (msg.document?.file_name) {
            const name = msg.document.file_name;
            text = text
              ? `${text}\n\n[attached file: ${name}]`
              : `Review attached file: ${name}`;
          }
          if (!text.trim()) continue;

          // Strip bot username from /cmd@BotName
          text = text.replace(/^\/([a-zA-Z0-9_]+)@[^\s]+/, '/$1');

          try {
            await onMessage({
              platform: 'telegram',
              chatId,
              userId,
              text: text.trim(),
              messageId: msg.message_id != null ? String(msg.message_id) : undefined,
              username: msg.from?.username,
            });
          } catch (err: any) {
            this.log(`handler error: ${err?.message || err}`);
            await this.sendMessage(chatId, `Error: ${err?.message || err}`).catch(() => {});
          }
        }
      } catch (err: any) {
        if (this.stopped) break;
        this.log(`poll error: ${err?.message || err}`);
        await sleep(5000);
      }
    }
    this.log('long-polling stopped');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
