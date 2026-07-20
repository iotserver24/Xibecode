/**
 * Hermes-style Telegram gateway engine for XibeCode.
 *
 * Ports the messaging surface of Hermes plugins/platforms/telegram/adapter.py:
 * - MarkdownV2 format_message + plain fallback
 * - Long-poll getUpdates with abort on stop
 * - Inline approvals (ea:), clarify (cl:), model picker (mp/mm/mg/mb/mx/mpv)
 * - Choice pickers (lv:, cp:)
 * - Progress edit-in-place
 * - Documents / photos (basic media)
 * - setMyCommands menu
 *
 * Adapted from Hermes Agent (MIT, Nous Research) — see NOTICE.
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
  /** Multi-provider list (Hermes). Defaults to one "default" provider. */
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

  /** Hermes send: MarkdownV2 first, plain strip fallback. */
  async sendMessage(
    chatId: string,
    text: string,
    opts?: SendMessageOptions,
  ): Promise<void> {
    const chunks = chunkForChat(text, 3500);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const markup =
        i === chunks.length - 1 && opts?.replyMarkup
          ? opts.replyMarkup
          : undefined;
      const md = formatMessage(chunk);
      try {
        await this.api('sendMessage', {
          chat_id: chatId,
          text: md.slice(0, TG_TEXT_LIMIT),
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
          ...(markup ? { reply_markup: markup } : {}),
        });
      } catch {
        try {
          await this.api('sendMessage', {
            chat_id: chatId,
            text: stripMdv2(md).slice(0, TG_TEXT_LIMIT) || chunk.slice(0, TG_TEXT_LIMIT),
            disable_web_page_preview: true,
            ...(markup ? { reply_markup: markup } : {}),
          });
        } catch {
          await this.api('sendMessage', {
            chat_id: chatId,
            text: chunk.slice(0, TG_TEXT_LIMIT),
            disable_web_page_preview: true,
            ...(markup ? { reply_markup: markup } : {}),
          });
        }
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
  ): Promise<void> {
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
    await this.sendMessage(chatId, text, { replyMarkup });
  }

  /** Hermes send_clarify */
  async sendAskPrompt(
    chatId: string,
    question: string,
    choices: string[] | undefined,
    askId: string,
  ): Promise<void> {
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
    await this.sendMessage(chatId, body, { replyMarkup });
  }

  /**
   * Hermes send_model_picker — provider list → model pages → select.
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

  /** Send a local file as document (Hermes send_document subset). */
  async sendDocument(
    chatId: string,
    filePath: string,
    caption?: string,
  ): Promise<void> {
    const form = new FormData();
    form.append('chat_id', chatId);
    const buf = await fs.promises.readFile(filePath);
    const blob = new Blob([buf]);
    form.append('document', blob, path.basename(filePath));
    if (caption) form.append('caption', caption.slice(0, 1024));
    const res = await fetch(this.apiUrl('sendDocument'), {
      method: 'POST',
      body: form as any,
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || data.ok === false) {
      throw new Error(`sendDocument: ${data.description || res.status}`);
    }
  }

  async sendPhoto(
    chatId: string,
    filePath: string,
    caption?: string,
  ): Promise<void> {
    const form = new FormData();
    form.append('chat_id', chatId);
    const buf = await fs.promises.readFile(filePath);
    form.append('photo', new Blob([buf]), path.basename(filePath));
    if (caption) form.append('caption', caption.slice(0, 1024));
    const res = await fetch(this.apiUrl('sendPhoto'), {
      method: 'POST',
      body: form as any,
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || data.ok === false) {
      throw new Error(`sendPhoto: ${data.description || res.status}`);
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
    // Drop webhook so long-poll works (Hermes-style)
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
          if (msg.document?.file_name) {
            const name = msg.document.file_name;
            text = text
              ? `${text}\n\n[attached file: ${name}]`
              : `Review attached file: ${name}`;
          }
          if (msg.photo?.length && !text.trim()) {
            text = '[photo attached]';
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

    // Hermes model picker first (handles in-adapter, no chat dispatch)
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
      dispatch(
        `/${choice}`,
        choice === 'deny'
          ? 'Denied'
          : choice === 'once'
            ? 'Allowed once'
            : choice === 'session'
              ? 'Allowed for session'
              : 'Always allowed',
      );
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
        return;
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
