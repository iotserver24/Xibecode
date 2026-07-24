/**
 * Telegram gateway engine for XibeCode.
 *
 * Ports the messaging surface of messaging gateway plugins/platforms/telegram/adapter.py:
 * - MarkdownV2 format_message + plain fallback
 * - Long-poll getUpdates with abort on stop
 * - Inline approvals (ea:), clarify (cl:), model picker (mp/mm/mg/mb/mx/mpv)
 * - Choice pickers (lv:, cp:)
 * - Progress: new messages per tool by default (messaging gateway separate grouping)
 * - Approval/ask: edit same message + clear buttons after resolve
 * - Documents / photos (basic media)
 * - setMyCommands menu
 *
 * Adapted from messaging gateway Agent (MIT, Nous Research) — see NOTICE.
 */

import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import type {
  InboundMessage,
  MessagingAdapter,
  SendMessageOptions,
} from '../types.js';
import { chunkForChat, GATEWAY_BOT_COMMANDS } from '../format.js';
import { formatMessage, stripMdv2, truncateLabel } from './mdv2.js';
import {
  buildModelKeyboard,
  buildProviderKeyboard,
  modelListText,
  providerListText,
  type ModelPickerState,
  type PickerProvider,
} from './model-picker.js';

export interface TelegramConfig {
  botToken: string;
  allowedUsers?: string[];
  homeChatId?: string;
}

export interface ModelPickerOptions {
  models: string[];
  current: string;
  profileDefault: string;
  chatOverride?: string;
 /** Multi-provider list (messaging gateway). Defaults to one "default" provider. */
  providers?: PickerProvider[];
  providerSlug?: string;
  onModelSelected?: (
    chatId: string,
    modelId: string,
    providerSlug: string,
  ) => Promise<string>;
}

const TG_TEXT_LIMIT = 4096;

export class TelegramEngine implements MessagingAdapter {
  readonly name = 'telegram' as const;
  private token: string;
  private allowed: Set<string> | null;
  homeChannel?: string;
  private offset = 0;
  private stopped = false;
  private log: (m: string) => void;
  private pollAbort: AbortController | null = null;

  private modelPicker = new Map<string, ModelPickerState>();
  private choicePicker = new Map<
    string,
    { values: string[]; prefix: string }
  >();

  constructor(config: TelegramConfig, log?: (m: string) => void) {
    this.token = config.botToken;
    this.homeChannel = config.homeChatId || process.env.TELEGRAM_HOME_CHANNEL;
    // Always redact bot tokens that node-fetch may put in error messages
    const baseLog = log || ((m) => console.log(`[telegram] ${m}`));
    this.log = (m) =>
      baseLog(String(m).replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot***'));
    if (config.allowedUsers?.length) {
      this.allowed = new Set(
        config.allowedUsers.map((s) => s.trim()).filter(Boolean),
      );
    } else if (process.env.TELEGRAM_ALLOWED_USERS?.trim()) {
      this.allowed = new Set(
        process.env.TELEGRAM_ALLOWED_USERS.split(',')
          .map((s) => s.trim())
          .filter(Boolean),
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
    try {
      this.pollAbort?.abort();
    } catch {
      /* ignore */
    }
  }

  private apiUrl(method: string): string {
    return `https://api.telegram.org/bot${this.token}/${method}`;
  }

  private async api(
    method: string,
    body?: Record<string, unknown>,
  ): Promise<any> {
    const res = await fetch(this.apiUrl(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || data.ok === false) {
      throw new Error(
        `Telegram ${method}: ${res.status} ${data.description || ''}`,
      );
    }
    return data.result;
  }

  /**
   * Download a Telegram document and return UTF-8 text if it looks like text.
   * Returns null for binary/too-large files (caller still mentions the filename).
   */
  private async downloadTextAttachment(
    fileId: string,
    fileName: string,
    mimeType: string,
  ): Promise<string | null> {
    const MAX_BYTES = 512 * 1024; // 512KB inline cap
    const textExt =
      /\.(txt|md|markdown|json|jsonl|csv|tsv|log|ya?ml|toml|xml|html?|css|js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|sh|bash|zsh|env|ini|cfg|conf|sql|graphql|vue|svelte|r|php|pl|lua|zig|nim|ex|exs|erl|hs|clj|scala|dart|proto|gradle|properties|gitignore|dockerignore|editorconfig)$/i;
    const textMime = /^(text\/|application\/(json|xml|javascript|x-sh|x-yaml|toml))/i;
    const looksText =
      textExt.test(fileName) || textMime.test(mimeType || '') || !mimeType;

    const info = (await this.api('getFile', { file_id: fileId })) as {
      file_path?: string;
      file_size?: number;
    };
    if (!info?.file_path) throw new Error('getFile missing file_path');
    if (typeof info.file_size === 'number' && info.file_size > MAX_BYTES) {
      return null;
    }

    const url = `https://api.telegram.org/file/bot${this.token}/${info.file_path}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`file download HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return null;

    // Heuristic: if not clearly text and has many NUL bytes, treat as binary
    if (!looksText) {
      const sample = buf.subarray(0, Math.min(buf.length, 8000));
      let nuls = 0;
      for (let i = 0; i < sample.length; i++) if (sample[i] === 0) nuls++;
      if (nuls > 2) return null;
    }

    let text = buf.toString('utf8');
    // Strip UTF-8 BOM
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    // Reject if mostly replacement chars (not utf8)
    const bad = (text.match(/\uFFFD/g) || []).length;
    if (bad > 20 && bad / Math.max(text.length, 1) > 0.05) return null;
    return text;
  }

  /**
 * messaging gateway send: MarkdownV2 first, plain strip fallback.
   * Returns the last sent message_id when available (for interactive prompts).
   */
  async sendMessage(
    chatId: string,
    text: string,
    opts?: SendMessageOptions,
  ): Promise<void> {
    await this.sendMessageReturningId(chatId, text, opts);
  }

  private async sendMessageReturningId(
    chatId: string,
    text: string,
    opts?: SendMessageOptions,
  ): Promise<string | undefined> {
    const chunks = chunkForChat(text, 3500);
    let lastId: string | undefined;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const markup =
        i === chunks.length - 1 && opts?.replyMarkup
          ? opts.replyMarkup
          : undefined;
      const md = formatMessage(chunk);
      try {
        const result = await this.api('sendMessage', {
          chat_id: chatId,
          text: md.slice(0, TG_TEXT_LIMIT),
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
          ...(markup ? { reply_markup: markup } : {}),
        });
        if (result?.message_id != null) lastId = String(result.message_id);
      } catch {
        try {
          const result = await this.api('sendMessage', {
            chat_id: chatId,
            text:
              stripMdv2(md).slice(0, TG_TEXT_LIMIT) ||
              chunk.slice(0, TG_TEXT_LIMIT),
            disable_web_page_preview: true,
            ...(markup ? { reply_markup: markup } : {}),
          });
          if (result?.message_id != null) lastId = String(result.message_id);
        } catch {
          const result = await this.api('sendMessage', {
            chat_id: chatId,
            text: chunk.slice(0, TG_TEXT_LIMIT),
            disable_web_page_preview: true,
            ...(markup ? { reply_markup: markup } : {}),
          });
          if (result?.message_id != null) lastId = String(result.message_id);
        }
      }
    }
    return lastId;
  }

  /**
 * messaging gateway: after approval / clarify, edit the same message and drop buttons
   * (`reply_markup` empty) so the keyboard does not stick around.
   */
  async editInteractiveMessage(
    chatId: string,
    messageId: string,
    text: string,
  ): Promise<void> {
    const md = formatMessage(text);
    const emptyKb = { inline_keyboard: [] as unknown[] };
    try {
      await this.api('editMessageText', {
        chat_id: chatId,
        message_id: Number(messageId),
        text: md.slice(0, TG_TEXT_LIMIT),
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
        reply_markup: emptyKb,
      });
    } catch {
      try {
        await this.api('editMessageText', {
          chat_id: chatId,
          message_id: Number(messageId),
          text: text.slice(0, TG_TEXT_LIMIT),
          disable_web_page_preview: true,
          reply_markup: emptyKb,
        });
      } catch {
        /* non-fatal — buttons may linger if Telegram rejects the edit */
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

  async sendApprovalPrompt(
    chatId: string,
    text: string,
    approvalId: string,
  ): Promise<string | undefined> {
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '✅ Once', callback_data: `ea:once:${approvalId}` },
          { text: '✅ Session', callback_data: `ea:session:${approvalId}` },
        ],
        [
          { text: '✅ Always', callback_data: `ea:always:${approvalId}` },
          { text: '❌ Deny', callback_data: `ea:deny:${approvalId}` },
        ],
      ],
    };
    return this.sendMessageReturningId(chatId, text, { replyMarkup });
  }

 /** messaging gateway send_clarify */
  async sendAskPrompt(
    chatId: string,
    question: string,
    choices: string[] | undefined,
    askId: string,
  ): Promise<string | undefined> {
    let body = `❓ **Question**\n\n${question.trim()}`;
    if (choices?.length) {
      body +=
        '\n\n' + choices.map((c, i) => `${i + 1}. ${c}`).join('\n');
    }
    const replyMarkup =
      choices && choices.length
        ? {
            inline_keyboard: [
              ...choices.map((_, idx) => [
                { text: String(idx + 1), callback_data: `cl:${askId}:${idx}` },
              ]),
              [
                {
                  text: '✏️ Other (type answer)',
                  callback_data: `cl:${askId}:other`,
                },
              ],
            ],
          }
        : undefined;
    return this.sendMessageReturningId(chatId, body, { replyMarkup });
  }

  /**
 * messaging gateway send_model_picker — provider list → model pages → select.
   * With a single provider, jumps straight to model list.
   */
  async sendModelPicker(
    chatId: string,
    opts: ModelPickerOptions,
  ): Promise<void> {
    const providerSlug = opts.providerSlug || 'default';
    const providers: PickerProvider[] =
      opts.providers && opts.providers.length
        ? opts.providers
        : [
            {
              slug: providerSlug,
              name: providerSlug === 'default' ? 'Configured API' : providerSlug,
              models: opts.models.slice(0, 200),
              total_models: opts.models.length,
              is_current: true,
            },
          ];

    const onModelSelected =
      opts.onModelSelected ||
      (async (_c, modelId) => `Model set to \`${modelId}\` for this chat.`);

    const state: ModelPickerState = {
      providers,
      current_model: opts.current,
      current_provider: providerSlug,
      provider_page: 0,
      onModelSelected,
    };

    // Single provider with models → open model list directly (less friction)
    if (providers.length === 1 && providers[0].models.length > 0) {
      state.selected_provider = providers[0].slug;
      state.selected_provider_name = providers[0].name;
      state.model_list = providers[0].models;
      state.model_page = 0;
      const { keyboard, pageInfo } = buildModelKeyboard(providers[0].models, 0);
      const text = modelListText(state, pageInfo);
      try {
        const msg = await this.api('sendMessage', {
          chat_id: chatId,
          text: text.slice(0, TG_TEXT_LIMIT),
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
          reply_markup: keyboard,
        });
        state.msgId =
          msg?.message_id != null ? String(msg.message_id) : undefined;
      } catch {
        await this.sendMessage(
          chatId,
          [
            '⚙ Model Configuration',
            `Current: ${opts.current}`,
            '',
            ...providers[0].models.slice(0, 30).map((m, i) => `${i + 1}. ${m}`),
            '',
            'Tap failed — use /model <name>',
          ].join('\n'),
        );
      }
      this.modelPicker.set(chatId, state);
      return;
    }

    const { keyboard, pageInfo } = buildProviderKeyboard(providers, 0);
    const text = providerListText(state, pageInfo);
    try {
      const msg = await this.api('sendMessage', {
        chat_id: chatId,
        text: text.slice(0, TG_TEXT_LIMIT),
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
        reply_markup: keyboard,
      });
      state.msgId =
        msg?.message_id != null ? String(msg.message_id) : undefined;
    } catch (err: any) {
      this.log(`sendModelPicker failed: ${err?.message || err}`);
      await this.sendMessage(
        chatId,
        [
          'Model',
          `current: ${opts.current}`,
          `profile: ${opts.profileDefault}`,
          '',
          ...opts.models.slice(0, 25).map((m, i) => `${i + 1}. ${m}`),
          '',
          'Set: /model <name>',
        ].join('\n'),
      );
    }
    this.modelPicker.set(chatId, state);
  }

  async sendChoicePicker(
    chatId: string,
    title: string,
    choices: Array<{ value: string; label: string; current?: boolean }>,
    prefix = 'cp',
  ): Promise<void> {
    const values = choices.map((c) => c.value);
    this.choicePicker.set(`${chatId}:${prefix}`, { values, prefix });
    const rows = choices.map((c, i) => [
      {
        text: truncateLabel(c.current ? `✓ ${c.label}` : c.label, 40),
        callback_data: `${prefix}:${i}`,
      },
    ]);
    await this.sendMessage(chatId, title, {
      replyMarkup: { inline_keyboard: rows },
    });
  }

  async registerBotCommands(): Promise<void> {
    try {
      await this.api('setMyCommands', {
        commands: GATEWAY_BOT_COMMANDS.map((c) => ({
          command: c.command,
          description: c.description.slice(0, 256),
        })),
      });
      this.log(
        `registered ${GATEWAY_BOT_COMMANDS.length} bot commands for Telegram / menu`,
      );
    } catch (err: any) {
      this.log(`setMyCommands failed: ${err?.message || err}`);
    }
  }

  async sendOrEditProgress(
    chatId: string,
    text: string,
    previousMessageId?: string,
  ): Promise<string | undefined> {
    const plain = text.slice(0, 3500);
    const md = formatMessage(plain);
    if (previousMessageId) {
      try {
        await this.api('editMessageText', {
          chat_id: chatId,
          message_id: Number(previousMessageId),
          text: md.slice(0, TG_TEXT_LIMIT),
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
        });
        return previousMessageId;
      } catch {
        try {
          await this.api('editMessageText', {
            chat_id: chatId,
            message_id: Number(previousMessageId),
            text: plain,
            disable_web_page_preview: true,
          });
          return previousMessageId;
        } catch {
          /* new message */
        }
      }
    }
    try {
      const result = await this.api('sendMessage', {
        chat_id: chatId,
        text: md.slice(0, TG_TEXT_LIMIT),
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
      });
      return result?.message_id != null ? String(result.message_id) : undefined;
    } catch {
      try {
        const result = await this.api('sendMessage', {
          chat_id: chatId,
          text: plain,
          disable_web_page_preview: true,
        });
        return result?.message_id != null ? String(result.message_id) : undefined;
      } catch {
        return previousMessageId;
      }
    }
  }

  /**
   * Upload a local file via Telegram Bot API multipart/form-data.
   * Routes by kind: sendPhoto / sendVideo / sendAudio / sendVoice / sendDocument.
   * Any non-media type (code, zip, pdf, …) goes through sendDocument (≤50MB).
   * @see https://core.telegram.org/bots/api#sending-files
   * @see https://core.telegram.org/bots/api#senddocument
   */
  async sendLocalFile(
    chatId: string,
    filePath: string,
    opts?: {
      caption?: string;
      kind?: 'photo' | 'video' | 'audio' | 'voice' | 'document';
      workdir?: string;
    },
  ): Promise<void> {
    const { validateMediaPath, TG_LIMITS } = await import(
      '../media-delivery.js'
    );
    const validated = validateMediaPath(filePath, { workdir: opts?.workdir });
    if (!validated.ok) {
      throw new Error(`Cannot send file: ${validated.reason}`);
    }
    let kind = opts?.kind || validated.kind;

    const abs = validated.path;
    const caption = opts?.caption?.slice(0, 1024);
    const filename = path.basename(abs);

    if (kind === 'photo') {
      try {
        await this.uploadMedia(chatId, 'sendPhoto', 'photo', abs, caption, filename);
        return;
      } catch (err: any) {
        const msg = String(err?.message || err);
 // Invalid dimensions / format → fall back to document (messaging gateway behavior)
        this.log(`sendPhoto failed (${msg.slice(0, 120)}); falling back to sendDocument`);
        kind = 'document';
      }
    }

    if (kind === 'video') {
      try {
        await this.uploadMedia(chatId, 'sendVideo', 'video', abs, caption, filename);
        return;
      } catch (err: any) {
        this.log(`sendVideo failed; falling back to sendDocument: ${err?.message || err}`);
        kind = 'document';
      }
    }

    if (kind === 'audio') {
      try {
        await this.uploadMedia(chatId, 'sendAudio', 'audio', abs, caption, filename);
        return;
      } catch (err: any) {
        this.log(`sendAudio failed; falling back to sendDocument: ${err?.message || err}`);
        kind = 'document';
      }
    }

    if (kind === 'voice') {
      try {
        await this.uploadMedia(chatId, 'sendVoice', 'voice', abs, caption, filename);
        return;
      } catch (err: any) {
        this.log(`sendVoice failed; falling back to sendDocument: ${err?.message || err}`);
        kind = 'document';
      }
    }

    // document (or fallback for any other file type)
    if (validated.size > TG_LIMITS.document) {
      throw new Error(`File exceeds Telegram 50MB document limit`);
    }
    await this.uploadMedia(chatId, 'sendDocument', 'document', abs, caption, filename);
  }

 /** Send a local file as document (messaging gateway send_document). */
  async sendDocument(
    chatId: string,
    filePath: string,
    caption?: string,
  ): Promise<void> {
    await this.sendLocalFile(chatId, filePath, { caption, kind: 'document' });
  }

  /** Send a local image as photo (falls back to document on dimension errors). */
  async sendPhoto(
    chatId: string,
    filePath: string,
    caption?: string,
  ): Promise<void> {
    await this.sendLocalFile(chatId, filePath, { caption, kind: 'photo' });
  }

  async sendVideo(
    chatId: string,
    filePath: string,
    caption?: string,
  ): Promise<void> {
    await this.sendLocalFile(chatId, filePath, { caption, kind: 'video' });
  }

  async sendVoice(
    chatId: string,
    filePath: string,
    caption?: string,
  ): Promise<void> {
    await this.sendLocalFile(chatId, filePath, { caption, kind: 'voice' });
  }

  async sendAudio(
    chatId: string,
    filePath: string,
    caption?: string,
  ): Promise<void> {
    await this.sendLocalFile(chatId, filePath, { caption, kind: 'audio' });
  }

  /**
   * multipart/form-data upload for Telegram Bot API methods that take files.
   * Uses node-fetch File/FormData so filename + content-type are preserved
   * (required for sendDocument so users get the real .pdf/.zip/.ts name).
   * @see https://core.telegram.org/bots/api#sending-files
   */
  private async uploadMedia(
    chatId: string,
    method: 'sendPhoto' | 'sendVideo' | 'sendDocument' | 'sendVoice' | 'sendAudio',
    field: string,
    filePath: string,
    caption?: string,
    filename?: string,
  ): Promise<void> {
    const { mimeForPath } = await import('../media-delivery.js');
    const name = filename || path.basename(filePath);
    const mime = mimeForPath(filePath);

    // Prefer node-fetch File/FormData so multipart includes a real filename.
    // Fall back to Blob if unavailable.
    let form: FormData;
    try {
      const nf = await import('node-fetch');
      const FormDataCtor = (nf as any).FormData || FormData;
      const FileCtor = (nf as any).File || (globalThis as any).File;
      form = new FormDataCtor();
      form.append('chat_id', chatId);
      const buf = await fs.promises.readFile(filePath);
      if (typeof FileCtor === 'function') {
        const file = new FileCtor([buf], name, { type: mime });
        form.append(field, file);
      } else {
        const BlobCtor = (nf as any).Blob || Blob;
        form.append(field, new BlobCtor([buf], { type: mime }), name);
      }
    } catch {
      form = new FormData();
      form.append('chat_id', chatId);
      const buf = await fs.promises.readFile(filePath);
      form.append(field, new Blob([buf], { type: mime }), name);
    }

    if (caption) form.append('caption', caption.slice(0, 1024));

    try {
      const action =
        method === 'sendPhoto'
          ? 'upload_photo'
          : method === 'sendVideo'
            ? 'upload_video'
            : method === 'sendVoice'
              ? 'upload_voice'
              : method === 'sendAudio'
                ? 'upload_document'
                : 'upload_document';
      await this.api('sendChatAction', { chat_id: chatId, action });
    } catch {
      /* ignore */
    }
    const res = await fetch(this.apiUrl(method), {
      method: 'POST',
      body: form as any,
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || data.ok === false) {
      throw new Error(
        `${method}: ${data.description || res.status || 'upload failed'}`,
      );
    }
  }

  private async isAuthorized(userId: string, chatId: string): Promise<boolean> {
    if (!this.allowed) return true;
    if (this.allowed.has(userId) || this.allowed.has(chatId)) return true;
    try {
      const { isPaired, requestPairing } = await import('../pairing.js');
      if (await isPaired('telegram', userId)) return true;
      if (this.allowed.size === 0) {
        const code = await requestPairing('telegram', userId, chatId);
        this.log(`denied user ${userId} — pairing code ${code}`);
        await this.sendMessage(
          chatId,
          `Access denied.\nPairing code: \`${code}\`\nOperator: \`xibecode pair approve telegram ${code}\``,
        ).catch(() => {});
        return false;
      }
      this.log(`denied user ${userId}`);
      await this.sendMessage(
        chatId,
        'Access denied. Add your user id to TELEGRAM_ALLOWED_USERS or use pairing.',
      ).catch(() => {});
      return false;
    } catch {
      return false;
    }
  }

  async runLoop(
    onMessage: (msg: InboundMessage) => Promise<void>,
  ): Promise<void> {
 // Drop webhook so long-poll works ()
    try {
      await this.api('deleteWebhook', { drop_pending_updates: false });
    } catch {
      /* ignore */
    }
    await this.registerBotCommands();
    this.log('long-polling started');
    while (!this.stopped) {
      this.pollAbort = new AbortController();
      try {
        // POST body (not GET query) — avoids embedding the bot token in error URLs
        const res = await fetch(this.apiUrl('getUpdates'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timeout: 30,
            offset: this.offset,
            allowed_updates: ['message', 'callback_query'],
          }),
          signal: this.pollAbort.signal as any,
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          if (res.status === 409 || /Conflict/i.test(body)) {
            this.log(
              'getUpdates 409 conflict — another bot instance is polling. Stop other gateways.',
            );
            await sleep(5000);
            continue;
          }
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
          if (this.stopped) break;
          this.offset = Math.max(this.offset, (update.update_id || 0) + 1);
          if (update.callback_query) {
            await this.handleCallbackQuery(update.callback_query, onMessage);
            continue;
          }
          const msg = update.message;
          if (!msg) continue;
          const chatId = String(msg.chat?.id ?? '');
          const userId = String(msg.from?.id ?? '');
          if (!chatId || !userId) continue;
          if (!(await this.isAuthorized(userId, chatId))) continue;

          let text = typeof msg.text === 'string' ? msg.text : '';
          if (!text && typeof msg.caption === 'string') text = msg.caption;

          // Download text-like documents so the agent can read the body
          // (previously only the filename was mentioned — prompts-in-.txt failed).
          if (msg.document?.file_id) {
            const name = String(msg.document.file_name || 'attachment');
            const mime = String(msg.document.mime_type || '');
            try {
              const body = await this.downloadTextAttachment(
                msg.document.file_id,
                name,
                mime,
              );
              if (body != null) {
                text = text
                  ? `${text}\n\n--- attached file: ${name} ---\n${body}\n--- end ${name} ---`
                  : `User sent file \`${name}\`. Contents:\n\n${body}`;
              } else {
                text = text
                  ? `${text}\n\n[attached file: ${name} — binary or too large to inline; ask user to paste text or save path if available]`
                  : `User attached file \`${name}\` (could not inline contents — binary/too large). Ask them to paste text or describe the task.`;
              }
            } catch (e: any) {
              this.log(`document download failed: ${e?.message || e}`);
              text = text
                ? `${text}\n\n[attached file: ${name} — download failed: ${e?.message || e}]`
                : `User attached file \`${name}\` but download failed: ${e?.message || e}`;
            }
          } else if (msg.photo?.length && !text.trim()) {
            text = '[photo attached — no download path; describe what you need or paste text]';
          }
          if (!text.trim()) continue;
          text = text.replace(/^\/([a-zA-Z0-9_]+)@[^\s]+/, '/$1');

          const inbound: InboundMessage = {
            platform: 'telegram',
            chatId,
            userId,
            text: text.trim(),
            messageId:
              msg.message_id != null ? String(msg.message_id) : undefined,
            username: msg.from?.username,
          };
          void Promise.resolve(onMessage(inbound)).catch(async (err: any) => {
            this.log(`handler error: ${err?.message || err}`);
            await this.sendMessage(
              chatId,
              `Error: ${err?.message || err}`,
            ).catch(() => {});
          });
        }
      } catch (err: any) {
        if (this.stopped) break;
        if (err?.name === 'AbortError') break;
        this.log(`poll error: ${err?.message || err}`);
        await sleep(5000);
      }
    }
    this.log('long-polling stopped');
  }

  private async editPickerMessage(
    chatId: string,
    messageId: number | undefined,
    text: string,
    keyboard: unknown,
  ): Promise<void> {
    if (messageId == null) return;
    try {
      await this.api('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: text.slice(0, TG_TEXT_LIMIT),
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
        reply_markup: keyboard,
      });
    } catch {
      try {
        await this.api('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: stripMdv2(text).slice(0, TG_TEXT_LIMIT),
          disable_web_page_preview: true,
          reply_markup: keyboard,
        });
      } catch {
        /* ignore */
      }
    }
  }

  private async handleModelPickerCallback(
    data: string,
    chatId: string,
    messageId: number | undefined,
    answer: (t?: string) => Promise<void>,
  ): Promise<boolean> {
    const state = this.modelPicker.get(chatId);
    if (
      !data.startsWith('mp:') &&
      !data.startsWith('mm:') &&
      !data.startsWith('mg:') &&
      !data.startsWith('mpv:') &&
      data !== 'mb' &&
      data !== 'mx' &&
      data !== 'mx:noop' &&
      !data.startsWith('mc:')
    ) {
      return false;
    }
    if (!state && data !== 'mx' && data !== 'mx:noop') {
      await answer('Picker expired — use /model again');
      return true;
    }
    if (data === 'mx:noop') {
      await answer();
      return true;
    }
    if (data === 'mx') {
      this.modelPicker.delete(chatId);
      if (messageId != null) {
        try {
          await this.api('editMessageText', {
            chat_id: chatId,
            message_id: messageId,
            text: 'Model selection cancelled.',
            reply_markup: { inline_keyboard: [] },
          });
        } catch {
          /* ignore */
        }
      }
      await answer('Cancelled');
      return true;
    }
    if (!state) return true;

    if (data.startsWith('mp:')) {
      const slug = data.slice(3);
      const provider = state.providers.find((p) => p.slug === slug);
      if (!provider) {
        await answer('Provider not found');
        return true;
      }
      state.selected_provider = slug;
      state.selected_provider_name = provider.name;
      state.model_list = provider.models;
      state.model_page = 0;
      const { keyboard, pageInfo } = buildModelKeyboard(provider.models, 0);
      await this.editPickerMessage(
        chatId,
        messageId,
        modelListText(state, pageInfo),
        keyboard,
      );
      await answer();
      return true;
    }

    if (data.startsWith('mg:')) {
      const page = Number(data.slice(3));
      const models = state.model_list || [];
      state.model_page = page;
      const { keyboard, pageInfo } = buildModelKeyboard(models, page);
      await this.editPickerMessage(
        chatId,
        messageId,
        modelListText(state, pageInfo),
        keyboard,
      );
      await answer();
      return true;
    }

    if (data.startsWith('mpv:')) {
      const page = Number(data.slice(4));
      state.provider_page = page;
      const { keyboard, pageInfo } = buildProviderKeyboard(
        state.providers,
        page,
      );
      await this.editPickerMessage(
        chatId,
        messageId,
        providerListText(state, pageInfo),
        keyboard,
      );
      await answer();
      return true;
    }

    if (data === 'mb') {
      const page = state.provider_page || 0;
      const { keyboard, pageInfo } = buildProviderKeyboard(
        state.providers,
        page,
      );
      await this.editPickerMessage(
        chatId,
        messageId,
        providerListText(state, pageInfo),
        keyboard,
      );
      await answer();
      return true;
    }

    if (data.startsWith('mm:') || data.startsWith('mc:')) {
      const idx = Number(data.slice(3));
      const models = state.model_list || [];
      if (idx < 0 || idx >= models.length) {
        await answer('Invalid model');
        return true;
      }
      const modelId = models[idx];
      const providerSlug = state.selected_provider || state.current_provider;
      let resultText: string;
      let failed = false;
      try {
        resultText = await state.onModelSelected(chatId, modelId, providerSlug);
      } catch (exc: any) {
        resultText = `Error switching model: ${exc?.message || exc}`;
        failed = true;
      }
      const formatted = formatMessage(resultText);
      if (messageId != null) {
        try {
          await this.api('editMessageText', {
            chat_id: chatId,
            message_id: messageId,
            text: formatted.slice(0, TG_TEXT_LIMIT),
            parse_mode: 'MarkdownV2',
            reply_markup: { inline_keyboard: [] },
          });
        } catch {
          try {
            await this.api('editMessageText', {
              chat_id: chatId,
              message_id: messageId,
              text: resultText.slice(0, TG_TEXT_LIMIT),
              reply_markup: { inline_keyboard: [] },
            });
          } catch {
            /* ignore */
          }
        }
      }
      await answer(failed ? 'Switch failed' : 'Model switched!');
      this.modelPicker.delete(chatId);
      return true;
    }

    return false;
  }

  private async handleCallbackQuery(
    cq: any,
    onMessage: (msg: InboundMessage) => Promise<void>,
  ): Promise<void> {
    const data = typeof cq.data === 'string' ? cq.data : '';
    const chatId = String(cq.message?.chat?.id ?? cq.from?.id ?? '');
    const userId = String(cq.from?.id ?? '');
    const cbId = cq.id;
    const messageId =
      cq.message?.message_id != null ? Number(cq.message.message_id) : undefined;
    const messageIdStr =
      cq.message?.message_id != null ? String(cq.message.message_id) : undefined;

    const answer = async (text?: string) => {
      try {
        await this.api('answerCallbackQuery', {
          callback_query_id: cbId,
          ...(text ? { text, show_alert: false } : {}),
        });
      } catch {
        /* ignore */
      }
    };

    if (!chatId || !userId) {
      await answer();
      return;
    }
    if (!(await this.isAuthorized(userId, chatId))) {
      await answer('Not authorized');
      return;
    }

 // messaging gateway model picker first (handles in-adapter, no chat dispatch)
    if (await this.handleModelPickerCallback(data, chatId, messageId, answer)) {
      return;
    }

    const dispatch = (text: string, toast?: string) => {
      void answer(toast);
      void Promise.resolve(
        onMessage({
          platform: 'telegram',
          chatId,
          userId,
          text,
          messageId: messageIdStr,
          username: cq.from?.username,
          fromCallback: true,
        }),
      ).catch((err: any) => {
        this.log(`callback handler error: ${err?.message || err}`);
      });
    };

    const ea = /^ea:(once|session|always|deny):(.+)$/.exec(data);
    if (ea) {
      const choice = ea[1];
      const labels: Record<string, string> = {
        once: '✅ Approved once',
        session: '✅ Approved for session',
        always: '✅ Approved permanently',
        deny: '❌ Denied',
      };
      const label = labels[choice] || 'Resolved';
 // messaging gateway: edit same message + remove buttons before routing the resolve
      if (messageIdStr) {
        const who = cq.from?.first_name || cq.from?.username || 'User';
        await this.editInteractiveMessage(
          chatId,
          messageIdStr,
          `${label} by ${who}`,
        );
      }
      dispatch(`/${choice}`, label);
      return;
    }

    // Legacy flat model list (md:N) if any
    if (data === 'md:clear') {
      dispatch('/model clear', 'Cleared');
      return;
    }
    if (data === 'md:refresh') {
      dispatch('/model', 'Refreshing…');
      return;
    }

    const cl = /^cl:([^:]+):(other|\d+)$/.exec(data);
    if (cl) {
      const askId = cl[1];
      const which = cl[2];
      if (which === 'other') {
        await answer('Type your answer in chat');
 // messaging gateway: drop number buttons while waiting for free text
        if (messageIdStr) {
          const prev =
            typeof cq.message?.text === 'string' ? cq.message.text : '❓ Question';
          await this.editInteractiveMessage(
            chatId,
            messageIdStr,
            `${prev}\n\n_Awaiting typed response…_`,
          );
        }
        return;
      }
 // messaging gateway: clear buttons on the same message when a choice is tapped
      if (messageIdStr) {
        const who = cq.from?.first_name || cq.from?.username || 'User';
        const prev =
          typeof cq.message?.text === 'string' ? cq.message.text : '❓ Question';
        await this.editInteractiveMessage(
          chatId,
          messageIdStr,
          `${prev}\n\n**${who}:** choice ${Number(which) + 1}`,
        );
      }
      dispatch(`__ask:${askId}:${which}`, `Choice ${Number(which) + 1}`);
      return;
    }

    // Level picker lv:N
    const lv = /^lv:(\d+)$/.exec(data);
    if (lv) {
      const levels = ['yolo', 'default', 'strict'];
      const v = levels[Number(lv[1])];
      if (v) dispatch(`/level ${v}`, v);
      else await answer();
      return;
    }

    // Generic choice picker prefix:idx
    const cp = /^([a-z]+):(\d+)$/.exec(data);
    if (cp) {
      const prefix = cp[1];
      const idx = Number(cp[2]);
      const st = this.choicePicker.get(`${chatId}:${prefix}`);
      if (st && st.values[idx] != null) {
        if (prefix === 'lv') {
          dispatch(`/level ${st.values[idx]}`, st.values[idx]);
        } else {
          dispatch(st.values[idx], truncateLabel(st.values[idx], 30));
        }
        return;
      }
    }

    await answer();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Alias used by runner import path */
export { TelegramEngine as TelegramAdapter };
