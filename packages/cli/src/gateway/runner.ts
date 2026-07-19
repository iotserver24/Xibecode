/**
 * XibeCode Gateway — coding-focused 24/7 process.
 *
 * - Cron scheduler
 * - Telegram / Discord / Slack messaging
 * - Shared coding chat controller (progress, /stop, workdir)
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  startCronScheduler,
  type CronJob,
  type JobRunResult,
} from 'xibecode-core';
import { ConfigManager } from '../utils/config.js';
import { gatewayHome } from './agent-runner.js';
import { ChatController, loadGatewayConfig, saveGatewayConfig } from './chat-controller.js';
import { isSilent, wrapCron } from './format.js';
import { TelegramAdapter } from './telegram.js';
import { DiscordAdapter } from './discord.js';
import { SlackAdapter } from './slack.js';
import type { MessagingAdapter, PlatformName } from './types.js';
import { runHeadlessAgent } from './agent-runner.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { ledgerPendingRedeliveries, ledgerMarkDelivered, ledgerMarkSending, ledgerMarkFailed } from './delivery-ledger.js';

export interface GatewayOptions {
  profile?: string;
  workdir?: string;
  cronIntervalMs?: number;
  cronOnly?: boolean;
}

export class GatewayRunner {
  private options: GatewayOptions;
  private config: ConfigManager;
  private stopCron: (() => void) | null = null;
  private adapters = new Map<PlatformName, MessagingAdapter>();
  private breakers = new Map<PlatformName, CircuitBreaker>();
  private chat: ChatController | null = null;
  private stopping = false;

  constructor(options: GatewayOptions = {}) {
    this.options = options;
    this.config = new ConfigManager(options.profile);
  }

  private log(msg: string): void {
    const line = `[gateway ${new Date().toISOString()}] ${msg}`;
    console.log(line);
    void this.appendLog(line);
  }

  private async appendLog(line: string): Promise<void> {
    try {
      const dir = path.join(gatewayHome(), 'logs');
      await fs.mkdir(dir, { recursive: true });
      await fs.appendFile(path.join(dir, 'gateway.log'), line + '\n', 'utf-8');
    } catch {
      /* ignore */
    }
  }

  private defaultWorkdir(): string {
    return (
      this.options.workdir ||
      process.env.XIBECODE_GATEWAY_WORKDIR ||
      (this.config.getAll() as any).gatewayWorkdir ||
      process.cwd()
    );
  }

  private getAdapter(platform: PlatformName): MessagingAdapter | null {
    return this.adapters.get(platform) || null;
  }

  private async runCronJob(job: CronJob): Promise<JobRunResult> {
    const workdir = job.workdir || this.defaultWorkdir();
    this.log(`cron job ${job.id} start (workdir=${workdir})`);
    const result = await runHeadlessAgent({
      prompt: [
        'You are running as a scheduled coding cron task.',
        'Complete the task and write a clear engineering summary.',
        'If everything is healthy and there is nothing to report, reply with only: [SILENT]',
        '',
        job.prompt,
      ].join('\n'),
      workdir,
      profile: this.options.profile,
      model: job.model,
      provider: job.provider,
      apiKey: job.apiKey,
      baseUrl: job.baseUrl,
      maxIterations: 50,
      onEvent: (type, data) => {
        if (type === 'warning' || type === 'error') {
          this.log(
            `cron ${job.id} ${type}: ${data?.message || data?.error || ''}`,
          );
        }
      },
    });

    const output = result.ok
      ? result.text
      : `FAILED: ${result.error || 'unknown'}\n${result.text}`;
    await this.deliver(job.deliver, output, job.origin);

    if (!result.ok) return { ok: false, output, error: result.error };
    return { ok: true, output: result.text };
  }

  private async deliver(
    deliver: string,
    text: string,
    origin?: string,
  ): Promise<void> {
    if (isSilent(text)) {
      this.log('delivery suppressed ([SILENT])');
      return;
    }

    const targets = deliver.split(',').map((s) => s.trim()).filter(Boolean);
    for (const t of targets) {
      if (t === 'local') continue;

      if (t === 'origin' && origin) {
        await this.deliverToTarget(origin, text);
        continue;
      }

      for (const platform of ['telegram', 'discord', 'slack'] as PlatformName[]) {
        if (t === platform || t.startsWith(`${platform}:`)) {
          const chatId = t.includes(':')
            ? t.split(':').slice(1).join(':')
            : this.getAdapter(platform)?.homeChannel;
          if (chatId) {
            const adapter = this.getAdapter(platform);
            if (adapter) {
              await adapter.sendMessage(chatId, wrapCron(text));
            } else {
              this.log(`cannot deliver to ${platform} (adapter off)`);
            }
          } else {
            this.log(`cannot deliver to ${platform} (no chat id / home)`);
          }
          break;
        }
      }
    }
  }

  private async deliverToTarget(origin: string, text: string): Promise<void> {
    const [platform, ...rest] = origin.split(':');
    const chatId = rest.join(':');
    const adapter = this.getAdapter(platform as PlatformName);
    if (adapter && chatId) {
      await adapter.sendMessage(chatId, wrapCron(text));
    }
  }

  private async setupAdapters(gwCfg: Record<string, any>): Promise<void> {
    const cfgAll = this.config.getAll() as any;

    // Telegram
    const tgToken =
      process.env.TELEGRAM_BOT_TOKEN ||
      process.env.XIBECODE_TELEGRAM_BOT_TOKEN ||
      cfgAll.telegramBotToken ||
      gwCfg.telegramBotToken;
    if (tgToken) {
      const tg = new TelegramAdapter(
        {
          botToken: tgToken,
          homeChatId:
            gwCfg.telegramHomeChatId ||
            process.env.TELEGRAM_HOME_CHANNEL ||
            cfgAll.telegramHomeChatId,
        },
        (m) => this.log(m),
      );
      this.adapters.set('telegram', tg);
      this.log('telegram enabled');
    }

    // Discord
    const dcToken =
      process.env.DISCORD_BOT_TOKEN ||
      process.env.XIBECODE_DISCORD_BOT_TOKEN ||
      cfgAll.discordBotToken ||
      gwCfg.discordBotToken;
    if (dcToken) {
      const dc = new DiscordAdapter(
        {
          botToken: dcToken,
          homeChatId:
            gwCfg.discordHomeChatId ||
            process.env.DISCORD_HOME_CHANNEL ||
            cfgAll.discordHomeChatId,
        },
        (m) => this.log(m),
      );
      this.adapters.set('discord', dc);
      this.log('discord enabled');
    }

    // Slack
    const slackBot =
      process.env.SLACK_BOT_TOKEN ||
      process.env.XIBECODE_SLACK_BOT_TOKEN ||
      cfgAll.slackBotToken ||
      gwCfg.slackBotToken;
    const slackApp =
      process.env.SLACK_APP_TOKEN ||
      process.env.XIBECODE_SLACK_APP_TOKEN ||
      cfgAll.slackAppToken ||
      gwCfg.slackAppToken;
    if (slackBot && slackApp) {
      const sl = new SlackAdapter(
        {
          botToken: slackBot,
          appToken: slackApp,
          homeChatId:
            gwCfg.slackHomeChatId ||
            process.env.SLACK_HOME_CHANNEL ||
            cfgAll.slackHomeChatId,
        },
        (m) => this.log(m),
      );
      this.adapters.set('slack', sl);
      this.log('slack enabled');
    } else if (slackBot || slackApp) {
      this.log(
        'slack incomplete — need both SLACK_BOT_TOKEN (xoxb-) and SLACK_APP_TOKEN (xapp-)',
      );
    }
  }

  async start(): Promise<void> {
    await fs.mkdir(gatewayHome(), { recursive: true });
    this.log(`starting (pid ${process.pid})`);
    this.log(`workdir ${this.defaultWorkdir()}`);

    this.stopCron = startCronScheduler({
      intervalMs: this.options.cronIntervalMs ?? 60_000,
      runJob: (job) => this.runCronJob(job),
      log: (m) => this.log(m),
    });
    this.log('cron scheduler started (60s tick)');

    const waitForever = () =>
      new Promise<void>((resolve) => {
        const onSig = () => {
          this.stopping = true;
          this.stop();
          resolve();
        };
        process.on('SIGINT', onSig);
        process.on('SIGTERM', onSig);
      });

    if (this.options.cronOnly) {
      this.log('cron-only mode');
      await waitForever();
      return;
    }

    const gwCfg = await loadGatewayConfig();
    await this.setupAdapters(gwCfg);

    // Circuit breakers per adapter
    for (const name of this.adapters.keys()) {
      this.breakers.set(
        name,
        new CircuitBreaker(name, 5, (m) => this.log(`[breaker] ${m}`)),
      );
    }

    this.chat = new ChatController({
      profile: this.options.profile,
      defaultWorkdir: () => this.defaultWorkdir(),
      log: (m) => this.log(m),
      getAdapter: (p) => this.getAdapter(p),
      isPlatformAllowed: (p) => this.breakers.get(p)?.allow() !== false,
      onPlatformSuccess: (p) => this.breakers.get(p)?.recordSuccess(),
      onPlatformFailure: (p, err) => this.breakers.get(p)?.recordFailure(err),
      onSetHome: async (platform, chatId) => {
        const key =
          platform === 'telegram'
            ? 'telegramHomeChatId'
            : platform === 'discord'
              ? 'discordHomeChatId'
              : 'slackHomeChatId';
        await saveGatewayConfig({ [key]: chatId });
        const adapter = this.getAdapter(platform);
        if (adapter) adapter.homeChannel = chatId;
      },
      statusExtra: () => [
        `profile: ${this.config.getProfileName()}`,
        `cron: ${this.stopCron ? 'on' : 'off'}`,
        `telegram: ${this.adapters.has('telegram') ? 'on' : 'off'}`,
        `discord: ${this.adapters.has('discord') ? 'on' : 'off'}`,
        `slack: ${this.adapters.has('slack') ? 'on' : 'off'}`,
        ...[...this.breakers.values()].map((b) => b.statusLine()),
      ],
    });

    if (this.adapters.size === 0) {
      this.log(
        'no messaging adapters — cron-only. Set TELEGRAM_BOT_TOKEN, DISCORD_BOT_TOKEN, and/or SLACK_BOT_TOKEN+SLACK_APP_TOKEN',
      );
      await waitForever();
      return;
    }

    // Redeliver pending ledger messages from prior crash
    try {
      const pending = await ledgerPendingRedeliveries();
      if (pending.length) {
        this.log(`redelivering ${pending.length} ledger message(s)`);
        for (const e of pending) {
          const adapter = this.getAdapter(e.platform as PlatformName);
          if (!adapter) continue;
          try {
            await ledgerMarkSending(e.id);
            const text =
              e.attempts > 0
                ? `♻️ Recovered reply — may be a duplicate\n\n${e.text}`
                : e.text;
            await adapter.sendMessage(e.chatId, text, { threadId: e.threadId });
            await ledgerMarkDelivered(e.id);
          } catch (err: any) {
            await ledgerMarkFailed(e.id, err?.message || String(err));
          }
        }
      }
    } catch (err: any) {
      this.log(`ledger redelivery error: ${err?.message || err}`);
    }

    const onSig = () => {
      if (this.stopping) return;
      this.stopping = true;
      this.log('shutdown signal');
      this.stop();
    };
    process.on('SIGINT', onSig);
    process.on('SIGTERM', onSig);

    // Run all adapters concurrently
    await Promise.all(
      [...this.adapters.values()].map((adapter) =>
        adapter.runLoop(async (msg) => {
          await this.chat!.handle(msg);
        }),
      ),
    );
  }

  stop(): void {
    this.stopCron?.();
    this.stopCron = null;
    for (const a of this.adapters.values()) a.stop();
    this.adapters.clear();
    this.log('stopped');
  }
}

/** Write a systemd user unit for 24/7 gateway. */
export async function installSystemdUserService(opts?: {
  profile?: string;
  workdir?: string;
}): Promise<string> {
  const home = os.homedir();
  const unitDir = path.join(home, '.config', 'systemd', 'user');
  await fs.mkdir(unitDir, { recursive: true });
  const unitPath = path.join(unitDir, 'xibecode-gateway.service');

  let xibecodeBin = 'xibecode';
  try {
    const { execSync } = await import('child_process');
    xibecodeBin = execSync('command -v xibecode || command -v xc', {
      encoding: 'utf-8',
    }).trim();
  } catch {
    xibecodeBin = path.join(home, '.local', 'share', 'pnpm', 'xibecode');
  }

  const workdir = opts?.workdir || process.cwd();
  const profileFlag = opts?.profile ? ` --profile ${opts.profile}` : '';

  const unit = `[Unit]
Description=XibeCode Gateway (24/7 coding agent + cron + Telegram/Discord/Slack)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${workdir}
ExecStart=${xibecodeBin} gateway${profileFlag} --workdir ${workdir}
Restart=always
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=-${home}/.xibecode/gateway.env
EnvironmentFile=-${home}/.xibecode/.env

[Install]
WantedBy=default.target
`;

  await fs.writeFile(unitPath, unit, 'utf-8');
  return unitPath;
}
