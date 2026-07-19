/**
 * Shared coding-chat handler for Telegram / Discord / Slack.
 * Progress updates, /stop, per-chat workdir, session continuity.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { runHeadlessAgent, gatewayHome } from './agent-runner.js';
import {
  appendTurn,
  getOrCreateSession,
  resetSession,
  updateSessionMeta,
} from './session-store.js';
import {
  codingSystemPrefix,
  formatToolProgress,
  HELP_TEXT,
  isSilent,
} from './format.js';
import type { ActiveRun, InboundMessage, MessagingAdapter, PlatformName } from './types.js';
import {
  ledgerRecordPending,
  ledgerMarkSending,
  ledgerMarkDelivered,
  ledgerMarkFailed,
} from './delivery-ledger.js';

export interface ChatControllerOptions {
  profile?: string;
  defaultWorkdir: () => string;
  log: (msg: string) => void;
  getAdapter: (platform: PlatformName) => MessagingAdapter | null;
  onSetHome?: (platform: PlatformName, chatId: string) => Promise<void>;
  statusExtra?: () => string[];
  /** Circuit breaker check — false means platform is tripped */
  isPlatformAllowed?: (platform: PlatformName) => boolean;
  onPlatformSuccess?: (platform: PlatformName) => void;
  onPlatformFailure?: (platform: PlatformName, err: string) => void;
}

export class ChatController {
  private options: ChatControllerOptions;
  private active = new Map<string, ActiveRun>();
  private queues = new Map<string, string[]>();

  constructor(options: ChatControllerOptions) {
    this.options = options;
  }

  private key(platform: string, chatId: string): string {
    return `${platform}:${chatId}`;
  }

  isBusy(platform: string, chatId: string): boolean {
    return this.active.has(this.key(platform, chatId));
  }

  stopRun(platform: string, chatId: string): boolean {
    const run = this.active.get(this.key(platform, chatId));
    if (!run) return false;
    run.abort.abort();
    return true;
  }

  /** Send with delivery ledger (at-least-once). */
  async reliableSend(
    platform: PlatformName,
    chatId: string,
    text: string,
    opts?: { threadId?: string; recovered?: boolean },
  ): Promise<void> {
    const adapter = this.options.getAdapter(platform);
    if (!adapter) return;
    if (this.options.isPlatformAllowed && !this.options.isPlatformAllowed(platform)) {
      this.options.log(`${platform} circuit open — drop send`);
      return;
    }
    const body = opts?.recovered
      ? `♻️ Recovered reply — may be a duplicate\n\n${text}`
      : text;
    const id = await ledgerRecordPending(platform, chatId, body, opts?.threadId);
    try {
      await ledgerMarkSending(id);
      await adapter.sendMessage(chatId, body, { threadId: opts?.threadId });
      await ledgerMarkDelivered(id);
      this.options.onPlatformSuccess?.(platform);
    } catch (err: any) {
      const msg = err?.message || String(err);
      await ledgerMarkFailed(id, msg);
      this.options.onPlatformFailure?.(platform, msg);
      throw err;
    }
  }

  async handle(msg: InboundMessage): Promise<void> {
    const text = msg.text.trim();
    if (!text) return;

    if (this.options.isPlatformAllowed && !this.options.isPlatformAllowed(msg.platform)) {
      const adapter = this.options.getAdapter(msg.platform);
      await adapter
        ?.sendMessage(
          msg.chatId,
          '⛔ This platform adapter is paused (circuit breaker). Operator: resume in gateway logs.',
          { threadId: msg.threadId },
        )
        .catch(() => {});
      return;
    }

    if (text.startsWith('/')) {
      await this.handleSlash(msg, text);
      return;
    }

    const k = this.key(msg.platform, msg.chatId);
    if (this.active.has(k)) {
      // Queue follow-up coding messages (don't interrupt mid-edit)
      const q = this.queues.get(k) || [];
      q.push(text);
      this.queues.set(k, q);
      const adapter = this.options.getAdapter(msg.platform);
      await adapter
        ?.sendMessage(
          msg.chatId,
          `⏳ Queued (${q.length}). Current coding run continues. Send \`/stop\` to cancel.`,
          { threadId: msg.threadId },
        )
        .catch(() => {});
      return;
    }

    await this.runTask(msg, text);
  }

  private async runTask(msg: InboundMessage, text: string): Promise<void> {
    const k = this.key(msg.platform, msg.chatId);
    const adapter = this.options.getAdapter(msg.platform);
    if (!adapter) return;

    const session = await getOrCreateSession(msg.platform, msg.chatId);
    const workdir = session.workdir || this.options.defaultWorkdir();
    const progressOn = session.progressEnabled !== false;

    const abort = new AbortController();
    this.active.set(k, { abort, startedAt: Date.now(), prompt: text });

    let progressMsgId: string | undefined;
    let lastProgressAt = 0;
    const toolLines: string[] = [];

    const typingTimer = setInterval(() => {
      void adapter.sendTyping?.(msg.chatId, { threadId: msg.threadId });
    }, 4000);
    void adapter.sendTyping?.(msg.chatId, { threadId: msg.threadId });

    const pushProgress = async (line: string) => {
      if (!progressOn || !adapter.sendOrEditProgress) return;
      const now = Date.now();
      // Throttle edits to ~1.5s
      if (now - lastProgressAt < 1500 && toolLines.length > 1) {
        toolLines[toolLines.length - 1] = line;
        return;
      }
      lastProgressAt = now;
      toolLines.push(line);
      const body =
        `💻 **Coding…** \`${path.basename(workdir)}\`\n` +
        toolLines.slice(-8).join('\n');
      progressMsgId = await adapter.sendOrEditProgress(
        msg.chatId,
        body,
        progressMsgId,
        { threadId: msg.threadId },
      );
    };

    try {
      await pushProgress('_starting agent_');

      const history = session.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const result = await runHeadlessAgent({
        prompt: text,
        workdir,
        profile: this.options.profile,
        history,
        maxIterations: 0,
        systemPrefix: codingSystemPrefix(workdir),
        signal: abort.signal,
        onEvent: (type, data) => {
          if (type === 'tool_call') {
            const name = data?.name || data?.tool || 'tool';
            const line = formatToolProgress(name, data?.input || data?.args);
            void pushProgress(line);
          } else if (type === 'warning') {
            this.options.log(
              `${msg.platform} warning: ${data?.message || ''}`,
            );
          } else if (type === 'iteration') {
            const cur = data?.current ?? data?.iteration;
            const total = data?.total ?? '?';
            if (cur != null) void pushProgress(`_iteration ${cur}/${total}_`);
          }
        },
      });

      const reply = result.cancelled
        ? `⏹ Stopped.\n${result.text || ''}`.trim()
        : result.ok
          ? result.text
          : `❌ Error: ${result.error || 'agent failed'}\n${result.text || ''}`.trim();

      if (!isSilent(reply)) {
        await this.reliableSend(msg.platform, msg.chatId, reply, {
          threadId: msg.threadId,
        });
      }
      await appendTurn(msg.platform, msg.chatId, text, reply);
    } finally {
      clearInterval(typingTimer);
      this.active.delete(k);

      // Drain one queued follow-up
      const q = this.queues.get(k) || [];
      if (q.length) {
        const next = q.shift()!;
        this.queues.set(k, q);
        void this.runTask(msg, next);
      }
    }
  }

  private async handleSlash(msg: InboundMessage, raw: string): Promise<void> {
    const adapter = this.options.getAdapter(msg.platform);
    if (!adapter) return;

    const without = raw.slice(1).trim();
    const space = without.indexOf(' ');
    const cmd = (space < 0 ? without : without.slice(0, space)).toLowerCase();
    const arg = space < 0 ? '' : without.slice(space + 1).trim();

    const reply = async (text: string) => {
      await this.reliableSend(msg.platform, msg.chatId, text, {
        threadId: msg.threadId,
      });
    };

    if (cmd === 'help' || cmd === 'start') {
      await reply(HELP_TEXT);
      return;
    }

    if (cmd === 'stop') {
      const ok = this.stopRun(msg.platform, msg.chatId);
      await reply(ok ? '⏹ Stopping current coding run…' : 'Nothing running.');
      return;
    }

    if (cmd === 'new' || cmd === 'reset') {
      await resetSession(msg.platform, msg.chatId);
      await reply('Conversation cleared (workdir kept).');
      return;
    }

    if (cmd === 'status') {
      const session = await getOrCreateSession(msg.platform, msg.chatId);
      const busy = this.isBusy(msg.platform, msg.chatId);
      const lines = [
        '**Gateway status**',
        `platform: ${msg.platform}`,
        `busy: ${busy ? 'yes (coding)' : 'idle'}`,
        `workdir: ${session.workdir || this.options.defaultWorkdir()}`,
        `progress: ${session.progressEnabled === false ? 'off' : 'on'}`,
        ...(this.options.statusExtra?.() || []),
      ];
      await reply(lines.join('\n'));
      return;
    }

    if (cmd === 'workdir') {
      if (!arg) {
        const session = await getOrCreateSession(msg.platform, msg.chatId);
        await reply(
          `workdir: \`${session.workdir || this.options.defaultWorkdir()}\`\n` +
            `Set with: \`/workdir /absolute/path/to/repo\``,
        );
        return;
      }
      const resolved = path.resolve(arg.replace(/^~/, process.env.HOME || ''));
      try {
        const st = await fs.stat(resolved);
        if (!st.isDirectory()) {
          await reply(`Not a directory: \`${resolved}\``);
          return;
        }
      } catch {
        await reply(`Path not found: \`${resolved}\``);
        return;
      }
      await updateSessionMeta(msg.platform, msg.chatId, { workdir: resolved });
      await reply(`workdir set to \`${resolved}\``);
      return;
    }

    if (cmd === 'progress') {
      const v = arg.toLowerCase();
      if (v === 'on' || v === 'off') {
        await updateSessionMeta(msg.platform, msg.chatId, {
          progressEnabled: v === 'on',
        });
        await reply(`Tool progress ${v}.`);
        return;
      }
      const session = await getOrCreateSession(msg.platform, msg.chatId);
      await reply(
        `progress is ${session.progressEnabled === false ? 'off' : 'on'}. Use \`/progress on|off\`.`,
      );
      return;
    }

    if (cmd === 'sethome') {
      await this.options.onSetHome?.(msg.platform, msg.chatId);
      await reply(
        `Home channel set for **${msg.platform}**. Cron jobs with \`deliver=${msg.platform}\` land here.`,
      );
      return;
    }

    await reply(`Unknown \`/${cmd}\`. Try \`/help\`.`);
  }
}

export async function loadGatewayConfig(): Promise<Record<string, any>> {
  try {
    return JSON.parse(
      await fs.readFile(path.join(gatewayHome(), 'config.json'), 'utf-8'),
    );
  } catch {
    return {};
  }
}

export async function saveGatewayConfig(patch: Record<string, any>): Promise<void> {
  await fs.mkdir(gatewayHome(), { recursive: true });
  const p = path.join(gatewayHome(), 'config.json');
  let data: Record<string, any> = {};
  try {
    data = JSON.parse(await fs.readFile(p, 'utf-8'));
  } catch {
    data = {};
  }
  Object.assign(data, patch);
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf-8');
}
