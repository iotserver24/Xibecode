/**
 * Shared coding-chat handler for Telegram / Discord / Slack.
 * Live tool progress, /stop, dangerous-command approval, session continuity.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import {
  globalProcessRegistry,
  SkillManager,
  type DangerousApprovalChoice,
  type DangerousApprovalRequest,
} from 'xibecode-core';
import { runHeadlessAgent, gatewayHome } from './agent-runner.js';
import {
  appendTurn,
  getOrCreateSession,
  resetSession,
  updateSessionMeta,
} from './session-store.js';
import {
  codingSystemPrefix,
  describeRigor,
  formatApprovalPrompt,
  formatBusyAck,
  formatProgressHeader,
  formatToolProgress,
  formatToolResult,
  HELP_TEXT,
  isSilent,
  longRunningStatusPhrase,
  parseApprovalReply,
  type GatewayRigorLevel,
} from './format.js';
import type {
  ActiveRun,
  InboundMessage,
  MessagingAdapter,
  PlatformName,
} from './types.js';
import {
  ledgerRecordPending,
  ledgerMarkSending,
  ledgerMarkDelivered,
  ledgerMarkFailed,
} from './delivery-ledger.js';
import { ConfigManager } from '../utils/config.js';
import { builtInSkillsDir } from '../utils/built-in-skills-dir.js';

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

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
  private approvalSeq = 0;

  constructor(options: ChatControllerOptions) {
    this.options = options;
  }

  private key(platform: string, chatId: string): string {
    return `${platform}:${chatId}`;
  }

  isBusy(platform: string, chatId: string): boolean {
    return this.active.has(this.key(platform, chatId));
  }

  stopRun(platform: string, chatId: string): { stopped: boolean; killedCmds: number } {
    const run = this.active.get(this.key(platform, chatId));
    if (!run) return { stopped: false, killedCmds: 0 };
    if (run.pendingApproval) {
      run.pendingApproval.resolve('deny');
      run.pendingApproval = undefined;
    }
    if (run.pendingAsk) {
      run.pendingAsk.reject(new Error('Cancelled by /stop'));
      run.pendingAsk = undefined;
    }
    let killedCmds = 0;
    try {
      killedCmds = run.interruptCommands?.() ?? 0;
    } catch {
      /* ignore */
    }
    run.abort.abort();
    return { stopped: true, killedCmds };
  }

  /** Resolve a pending approval if the chat is waiting on one. */
  tryResolveApproval(
    platform: string,
    chatId: string,
    choice: DangerousApprovalChoice,
  ): boolean {
    const run = this.active.get(this.key(platform, chatId));
    if (!run?.pendingApproval) return false;
    run.pendingApproval.resolve(choice);
    run.pendingApproval = undefined;
    return true;
  }

  tryResolveAsk(platform: string, chatId: string, answer: string): boolean {
    const run = this.active.get(this.key(platform, chatId));
    if (!run?.pendingAsk) return false;
    run.pendingAsk.resolve(answer);
    run.pendingAsk = undefined;
    return true;
  }

  getQueue(platform: string, chatId: string): string[] {
    return [...(this.queues.get(this.key(platform, chatId)) || [])];
  }

  clearQueue(platform: string, chatId: string): number {
    const k = this.key(platform, chatId);
    const n = (this.queues.get(k) || []).length;
    this.queues.set(k, []);
    return n;
  }

  /** Abort every active run (used on daemon SIGTERM so Node can exit). */
  stopAll(): number {
    let n = 0;
    for (const [k, run] of this.active) {
      const [platform, chatId] = k.includes(':')
        ? [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)]
        : [k, ''];
      if (this.stopRun(platform, chatId).stopped) n += 1;
      else {
        try {
          run.abort.abort();
        } catch {
          /* ignore */
        }
      }
    }
    try {
      globalProcessRegistry.killAllForeground('SIGTERM');
    } catch {
      /* ignore */
    }
    return n;
  }

  /** Send with delivery ledger (at-least-once). Falls back to direct send if ledger breaks. */
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

    let id: string | undefined;
    try {
      id = await ledgerRecordPending(platform, chatId, body, opts?.threadId);
    } catch (err: any) {
      // Ledger must never block slash replies (/model, /status, …)
      this.options.log(`ledger record failed: ${err?.message || err}`);
      await adapter.sendMessage(chatId, body, { threadId: opts?.threadId });
      this.options.onPlatformSuccess?.(platform);
      return;
    }

    try {
      await ledgerMarkSending(id);
      await adapter.sendMessage(chatId, body, { threadId: opts?.threadId });
      await ledgerMarkDelivered(id);
      this.options.onPlatformSuccess?.(platform);
    } catch (err: any) {
      const msg = err?.message || String(err);
      try {
        await ledgerMarkFailed(id, msg);
      } catch {
        /* ignore */
      }
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

    // Approval / ask replies while a run is waiting on the human
    const k = this.key(msg.platform, msg.chatId);
    const run = this.active.get(k);

    if (run?.pendingApproval) {
      const choice = parseApprovalReply(text);
      if (choice) {
        this.tryResolveApproval(msg.platform, msg.chatId, choice);
        const adapter = this.options.getAdapter(msg.platform);
        const labels: Record<DangerousApprovalChoice, string> = {
          once: 'Allowed once',
          session: 'Allowed for this session',
          always: 'Always allowed (until daemon restart)',
          deny: 'Denied',
        };
        await adapter
          ?.sendMessage(msg.chatId, `🔐 ${labels[choice]}`, {
            threadId: msg.threadId,
          })
          .catch(() => {});
        return;
      }
      if (text.startsWith('/')) {
        await this.handleSlash(msg, text);
        return;
      }
      const adapter = this.options.getAdapter(msg.platform);
      await adapter
        ?.sendMessage(
          msg.chatId,
          '⏳ Waiting for approval. Use `/once`, `/session`, `/always`, or `/deny` (or the buttons).',
          { threadId: msg.threadId },
        )
        .catch(() => {});
      return;
    }

    if (run?.pendingAsk) {
      // All slash commands stay available while waiting for an answer
      if (text.startsWith('/')) {
        await this.handleSlash(msg, text);
        return;
      }
      // Hermes clarify button: __ask:<askId>:<idx>
      let answer: string;
      const cl = /^__ask:([^:]+):(\d+)$/.exec(text);
      if (cl && cl[1] === run.pendingAsk.id) {
        const idx = Number(cl[2]);
        const choices = run.pendingAsk.choices || [];
        answer =
          Number.isInteger(idx) && idx >= 0 && idx < choices.length
            ? choices[idx]
            : text;
      } else {
        answer = this.normalizeAskAnswer(text, run.pendingAsk.choices);
      }
      this.tryResolveAsk(msg.platform, msg.chatId, answer);
      const adapter = this.options.getAdapter(msg.platform);
      await adapter
        ?.sendMessage(msg.chatId, `💬 Got it: ${answer}`, {
          threadId: msg.threadId,
        })
        .catch(() => {});
      return;
    }

    if (text.startsWith('/')) {
      await this.handleSlash(msg, text);
      return;
    }

    if (this.active.has(k)) {
      // Short status probes while busy — don't queue as another coding task
      if (/^(\?+|status|ping|hello|hi)$/i.test(text.trim())) {
        const busyRun = this.active.get(k)!;
        const secs = Math.round((Date.now() - busyRun.startedAt) / 1000);
        const qlen = (this.queues.get(k) || []).length;
        const adapter = this.options.getAdapter(msg.platform);
        await adapter
          ?.sendMessage(
            msg.chatId,
            [
              `⏳ Still coding (${secs}s)`,
              busyRun.lastToolLine ? `last: ${busyRun.lastToolLine}` : null,
              `tools: ${busyRun.toolCount || 0}`,
              qlen ? `queue: ${qlen}` : null,
              busyRun.pendingApproval
                ? 'waiting for approval — use buttons or `/once` `/deny`'
                : busyRun.pendingAsk
                  ? 'waiting for your answer to a question'
                  : 'Send `/stop` to interrupt, or a follow-up (queued). `/queue` to list.',
            ]
              .filter(Boolean)
              .join('\n'),
            { threadId: msg.threadId },
          )
          .catch(() => {});
        return;
      }
      // Queue follow-up coding messages (don't interrupt mid-edit)
      const q = this.queues.get(k) || [];
      q.push(text);
      this.queues.set(k, q);
      const adapter = this.options.getAdapter(msg.platform);
      await adapter
        ?.sendMessage(
          msg.chatId,
          `📥 Queued #${q.length}. Current run continues.\n` +
            `\`/queue\` list · \`/queue clear\` · \`/stop\` interrupt`,
          { threadId: msg.threadId },
        )
        .catch(() => {});
      return;
    }

    // CRITICAL: do not await the full agent loop here.
    // Telegram long-polling awaits onMessage — if we block, /stop /status /queue
    // never run until the coding loop finishes (looks like "commands don't work").
    void this.runTask(msg, text).catch((err: any) => {
      this.options.log(
        `runTask ${msg.platform}:${msg.chatId} error: ${err?.message || err}`,
      );
    });
  }

  private async runTask(msg: InboundMessage, text: string): Promise<void> {
    const k = this.key(msg.platform, msg.chatId);
    const adapter = this.options.getAdapter(msg.platform);
    if (!adapter) return;

    // Claim the busy slot BEFORE any await so concurrent messages queue
    // instead of starting a second agent run.
    if (this.active.has(k)) {
      const q = this.queues.get(k) || [];
      q.push(text);
      this.queues.set(k, q);
      await adapter
        .sendMessage(
          msg.chatId,
          `📥 Queued #${q.length} (run already starting).`,
          { threadId: msg.threadId },
        )
        .catch(() => {});
      return;
    }

    const abort = new AbortController();
    const activeRun: ActiveRun = {
      abort,
      startedAt: Date.now(),
      prompt: text,
      toolCount: 0,
      criticalWarnings: 0,
    };
    this.active.set(k, activeRun);

    let session;
    try {
      session = await getOrCreateSession(msg.platform, msg.chatId);
    } catch (err: any) {
      this.active.delete(k);
      await adapter
        .sendMessage(
          msg.chatId,
          `❌ Session error: ${err?.message || err}`,
          { threadId: msg.threadId },
        )
        .catch(() => {});
      return;
    }

    const workdir = session.workdir || this.options.defaultWorkdir();
    const progressOn = session.progressEnabled !== false;
    const rigor: GatewayRigorLevel = session.rigorLevel || 'default';
    const basen = path.basename(workdir);

    let lastActivityAt = Date.now();
    const toolLines: string[] = [];
    const MAX_CRITICAL = 6;

    const { GatewayStreamConsumer } = await import('./stream-consumer.js');
    // Hermes: one short status line as the progress bubble header (not "Coding… dir · rigor")
    const stream = new GatewayStreamConsumer({
      adapter,
      chatId: msg.chatId,
      threadId: msg.threadId,
      progressHeader: formatProgressHeader(basen, rigor),
      enabled: progressOn,
    });

    const flushProgress = async (footer?: string) => {
      await stream.flushProgress(footer);
    };

    /** Append a real tool/warning line (Hermes-style: tools only, no step N/0). */
    const pushProgress = async (line: string, opts?: { replaceLast?: boolean }) => {
      lastActivityAt = Date.now();
      activeRun.lastToolLine = line;
      if (opts?.replaceLast && toolLines.length > 0) {
        toolLines[toolLines.length - 1] = line;
      } else {
        toolLines.push(line);
      }
      await stream.pushToolLine(line, opts);
    };

    const typingTimer = setInterval(() => {
      // Waiting on human — don't spam "still working"
      if (activeRun.pendingAsk || activeRun.pendingApproval) {
        void adapter.sendTyping?.(msg.chatId, { threadId: msg.threadId });
        return;
      }
      void adapter.sendTyping?.(msg.chatId, { threadId: msg.threadId });
      // Hermes long-running phrases (not "_still working… Ns · N tools_")
      if (Date.now() - lastActivityAt > 25_000 && progressOn) {
        void flushProgress(longRunningStatusPhrase(Date.now()));
        lastActivityAt = Date.now();
      }
    }, 4000);
    void adapter.sendTyping?.(msg.chatId, { threadId: msg.threadId });

    // Hermes: single progress bubble with short phrase — no separate "✓ Got it — …" message
    if (progressOn && adapter.sendOrEditProgress) {
      await flushProgress();
    } else {
      // Fallback platforms without edit: one short ack only
      await adapter
        .sendMessage(msg.chatId, formatBusyAck(basen), { threadId: msg.threadId })
        .catch(() => {});
    }

    const requestApproval = async (
      req: DangerousApprovalRequest,
    ): Promise<DangerousApprovalChoice> => {
      if (abort.signal.aborted) return 'deny';
      this.approvalSeq += 1;
      const approvalId = String(this.approvalSeq);
      const prompt = formatApprovalPrompt(req);

      await pushProgress(`⚠️ approval needed: ${req.toolName}`);

      if (adapter.sendApprovalPrompt) {
        await adapter
          .sendApprovalPrompt(msg.chatId, prompt, approvalId, {
            threadId: msg.threadId,
          })
          .catch(async () => {
            await adapter.sendMessage(msg.chatId, prompt, {
              threadId: msg.threadId,
            });
          });
      } else {
        await adapter.sendMessage(msg.chatId, prompt, {
          threadId: msg.threadId,
        });
      }

      return new Promise<DangerousApprovalChoice>((resolve) => {
        let settled = false;
        const finish = (choice: DangerousApprovalChoice) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          abort.signal.removeEventListener('abort', onAbort);
          if (activeRun.pendingApproval?.id === approvalId) {
            activeRun.pendingApproval = undefined;
          }
          resolve(choice);
        };

        const onAbort = () => finish('deny');
        abort.signal.addEventListener('abort', onAbort);

        const timer = setTimeout(() => {
          this.options.log(
            `${msg.platform}:${msg.chatId} approval timed out (${req.toolName})`,
          );
          void adapter
            .sendMessage(
              msg.chatId,
              '⌛ Approval timed out — treating as deny.',
              { threadId: msg.threadId },
            )
            .catch(() => {});
          finish('deny');
        }, APPROVAL_TIMEOUT_MS);

        activeRun.pendingApproval = {
          id: approvalId,
          request: req,
          resolve: finish,
          createdAt: Date.now(),
        };
      });
    };

    const ASK_TIMEOUT_MS = 10 * 60 * 1000;
    const requestAsk = async (req: {
      question: string;
      choices?: string[];
    }): Promise<string> => {
      if (abort.signal.aborted) {
        throw new Error('Cancelled');
      }
      this.approvalSeq += 1;
      const askId = String(this.approvalSeq);
      const lines = ['❓ **Question**', '', req.question.trim()];
      if (req.choices?.length) {
        lines.push('', ...req.choices.map((c, i) => `${i + 1}. ${c}`));
        lines.push('', '_Reply with a number or type your own answer._');
      } else {
        lines.push('', '_Reply with your answer (or `/stop` to cancel)._');
      }
      const prompt = lines.join('\n');
      await pushProgress('❓ waiting for your reply…');
      // Hermes-style clarify buttons when platform supports it
      if (adapter.sendAskPrompt) {
        await adapter
          .sendAskPrompt(msg.chatId, req.question, req.choices, askId, {
            threadId: msg.threadId,
          })
          .catch(async () => {
            await adapter
              .sendMessage(msg.chatId, prompt, { threadId: msg.threadId })
              .catch(() => {});
          });
      } else {
        await adapter
          .sendMessage(msg.chatId, prompt, { threadId: msg.threadId })
          .catch(() => {});
      }
      await flushProgress('_reply or tap a button (or `/stop`)_');

      return new Promise<string>((resolve, reject) => {
        let settled = false;
        const finishOk = (answer: string) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          abort.signal.removeEventListener('abort', onAbort);
          if (activeRun.pendingAsk?.id === askId) {
            activeRun.pendingAsk = undefined;
          }
          resolve(answer);
        };
        const finishErr = (err: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          abort.signal.removeEventListener('abort', onAbort);
          if (activeRun.pendingAsk?.id === askId) {
            activeRun.pendingAsk = undefined;
          }
          reject(err);
        };
        const onAbort = () => finishErr(new Error('Cancelled by /stop'));
        abort.signal.addEventListener('abort', onAbort);
        const timer = setTimeout(() => {
          void adapter
            .sendMessage(msg.chatId, '⌛ Question timed out.', {
              threadId: msg.threadId,
            })
            .catch(() => {});
          finishErr(new Error('ask_user timed out'));
        }, ASK_TIMEOUT_MS);

        activeRun.pendingAsk = {
          id: askId,
          question: req.question,
          choices: req.choices,
          resolve: finishOk,
          reject: finishErr,
          createdAt: Date.now(),
        };
      });
    };

    try {
      // No "_starting…_" — Hermes only shows the short phrase until first tool

      const history = session.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Wire interrupt so /stop kills hanging foreground shells
      activeRun.interruptCommands = () =>
        globalProcessRegistry.killAllForeground('SIGTERM');

      const result = await runHeadlessAgent({
        prompt: text,
        workdir,
        profile: this.options.profile,
        model: session.model || undefined,
        history,
        maxIterations: 0,
        systemPrefix: codingSystemPrefix(workdir, rigor),
        signal: abort.signal,
        rigorLevel: rigor,
        onDangerousApproval: requestApproval,
        onAskUser: requestAsk,
        onEvent: (type, data) => {
          if (type === 'tool_call') {
            activeRun.toolCount = (activeRun.toolCount || 0) + 1;
            const name = data?.name || data?.tool || 'tool';
            const line = formatToolProgress(name, data?.input || data?.args);
            void pushProgress(line);
          } else if (type === 'tool_result') {
            const name = data?.name || data?.tool || 'tool';
            const success = data?.success !== false;
            let preview: string | undefined;
            const r = data?.result;
            if (typeof r === 'string') preview = r;
            else if (r && typeof r === 'object') {
              preview =
                (typeof r.message === 'string' && r.message) ||
                (typeof r.stdout === 'string' && r.stdout) ||
                undefined;
            }
            // Replace the "running …" line with ✓/✗ when possible
            void pushProgress(formatToolResult(name, success, preview), {
              replaceLast: true,
            });
          } else if (type === 'stream_text' || type === 'stream_delta') {
            const t = typeof data?.text === 'string' ? data.text : '';
            if (t) {
              lastActivityAt = Date.now();
              void stream.onDelta(t);
            }
          } else if (type === 'warning') {
            const w = String(data?.message || '');
            this.options.log(`${msg.platform} warning: ${w}`);
            const isCritical = /CRITICAL|Loop detected|near-identical|blocked finalize|Stop-hook/i.test(
              w,
            );
            if (isCritical) {
              activeRun.criticalWarnings = (activeRun.criticalWarnings || 0) + 1;
              // Short user-visible note (not the full CRITICAL dump every time)
              const short = w.includes('near-identical')
                ? '⚠️ Stuck repeating the same tool — changing approach…'
                : w.includes('Stop-hook')
                  ? '⚠️ Verifying before finish…'
                  : w.includes('TASK_COMPLETE') || w.includes('finalize')
                    ? '⚠️ Verifying completion evidence…'
                    : `⚠️ ${w.slice(0, 120)}`;
              void pushProgress(short);
              // Auto-stop runaway loops so the chat doesn't freeze forever
              if ((activeRun.criticalWarnings || 0) >= MAX_CRITICAL) {
                this.options.log(
                  `${msg.platform}:${msg.chatId} auto-stop after ${MAX_CRITICAL} critical warnings`,
                );
                void adapter
                  .sendMessage(
                    msg.chatId,
                    '🛑 Auto-stopped: agent was stuck repeating the same actions.\n' +
                      'Send a clearer follow-up, or `/level strict` for stronger checks.\n' +
                      'Last tool: ' +
                      (activeRun.lastToolLine || '(none)'),
                    { threadId: msg.threadId },
                  )
                  .catch(() => {});
                abort.abort();
              }
            }
          }
          // Intentionally ignore raw `iteration` events (were showing step 17/0 spam).
        },
      });

      // Hermes: leave tool lines as-is (or soft footer); don't shout _done_ / _starting_
      if (result.cancelled) {
        await flushProgress('stopped');
      } else {
        await flushProgress();
      }
      stream.close();

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
      try {
        stream.close();
      } catch {
        /* ignore */
      }
      clearInterval(typingTimer);
      if (activeRun.pendingApproval) {
        activeRun.pendingApproval.resolve('deny');
        activeRun.pendingApproval = undefined;
      }
      if (activeRun.pendingAsk) {
        activeRun.pendingAsk.reject(new Error('Run ended'));
        activeRun.pendingAsk = undefined;
      }
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

    // Telegram may send "/model@BotName" (already stripped) or trailing junk
    const without = raw.slice(1).trim();
    const space = without.search(/\s/);
    let cmd = (space < 0 ? without : without.slice(0, space)).toLowerCase();
    // Keep only bot-command chars (a-z 0-9 _) so "/model." / ZWSP don't miss
    cmd = cmd.replace(/[^a-z0-9_].*$/, '');
    const arg = space < 0 ? '' : without.slice(space + 1).trim();

    const reply = async (text: string) => {
      try {
        await this.reliableSend(msg.platform, msg.chatId, text, {
          threadId: msg.threadId,
        });
      } catch (err: any) {
        // Direct path if ledger/network path threw after partial work
        this.options.log(`slash reply failed: ${err?.message || err}`);
        await adapter
          .sendMessage(msg.chatId, text, { threadId: msg.threadId })
          .catch((e: any) => {
            this.options.log(`slash direct send failed: ${e?.message || e}`);
          });
      }
    };

    // Approval shortcuts as slash commands
    if (
      cmd === 'once' ||
      cmd === 'session' ||
      cmd === 'always' ||
      cmd === 'deny' ||
      cmd === 'approve'
    ) {
      const mapped: DangerousApprovalChoice =
        cmd === 'approve'
          ? parseApprovalReply(arg ? `/approve ${arg}` : '/once') || 'once'
          : (cmd as DangerousApprovalChoice);
      const ok = this.tryResolveApproval(msg.platform, msg.chatId, mapped);
      await reply(
        ok
          ? `🔐 ${mapped === 'deny' ? 'Denied' : `Allowed (${mapped})`}`
          : 'Nothing waiting for approval.',
      );
      return;
    }

    if (cmd === 'help' || cmd === 'start') {
      await reply(HELP_TEXT);
      return;
    }

    if (cmd === 'stop') {
      const { stopped, killedCmds } = this.stopRun(msg.platform, msg.chatId);
      if (!stopped) {
        await reply('Nothing running.');
        return;
      }
      await reply(
        killedCmds > 0
          ? `⏹ Interrupted — stopped run and killed ${killedCmds} active command(s).`
          : '⏹ Interrupted — stopping current coding run…',
      );
      return;
    }

    if (cmd === 'queue') {
      const sub = arg.toLowerCase().trim();
      if (sub === 'clear' || sub === 'flush' || sub === 'empty') {
        const n = this.clearQueue(msg.platform, msg.chatId);
        await reply(n ? `🗑 Cleared ${n} queued message(s).` : 'Queue already empty.');
        return;
      }
      const q = this.getQueue(msg.platform, msg.chatId);
      if (!q.length) {
        await reply('Queue empty. Follow-ups while busy are queued automatically.');
        return;
      }
      const preview = q
        .map((t, i) => `${i + 1}. ${t.length > 80 ? t.slice(0, 77) + '…' : t}`)
        .join('\n');
      await reply(`**Queue (${q.length})**\n${preview}\n\n\`/queue clear\` to drop all.`);
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
      const run = this.active.get(this.key(msg.platform, msg.chatId));
      const elapsed = run
        ? `${Math.round((Date.now() - run.startedAt) / 1000)}s`
        : '—';
      const cfg = new ConfigManager(this.options.profile);
      const model = session.model || cfg.getModel();
      const lines = [
        '**Gateway status**',
        `platform: ${msg.platform}`,
        `busy: ${busy ? `yes (${elapsed})` : 'idle'}`,
        run?.lastToolLine ? `last: ${run.lastToolLine}` : null,
        run?.toolCount != null && busy ? `tools: ${run.toolCount}` : null,
        run?.pendingApproval
          ? `approval: waiting (${run.pendingApproval.request.toolName})`
          : 'approval: none',
        run?.pendingAsk
          ? `ask: waiting — reply with text (not /status)\n  Q: ${run.pendingAsk.question.slice(0, 120)}`
          : null,
        `workdir: ${session.workdir || this.options.defaultWorkdir()}`,
        `model: ${model}${session.model ? ' (chat)' : ''}`,
        `level: ${describeRigor(session.rigorLevel || 'default')}`,
        `progress: ${session.progressEnabled === false ? 'off' : 'on'}`,
        ...(this.options.statusExtra?.() || []),
      ].filter(Boolean) as string[];
      await reply(lines.join('\n'));
      return;
    }

    if (cmd === 'model' || cmd === 'models') {
      await this.handleModelSlash(msg, cmd, arg, reply);
      return;
    }

    if (cmd === 'level' || cmd === 'rigor') {
      const v = arg.toLowerCase().trim() as GatewayRigorLevel | '';
      if (v === 'yolo' || v === 'default' || v === 'strict') {
        await updateSessionMeta(msg.platform, msg.chatId, { rigorLevel: v });
        await reply(`Rigor set to **${v}**\n${describeRigor(v)}`);
        return;
      }
      const session = await getOrCreateSession(msg.platform, msg.chatId);
      const cur = session.rigorLevel || 'default';
      const title = [
        `**Rigor level** — current: **${cur}**`,
        describeRigor(cur),
        '',
        'Tap a level or send `/level yolo|default|strict`',
      ].join('\n');
      if (adapter.sendChoicePicker) {
        try {
          await adapter.sendChoicePicker(
            msg.chatId,
            title,
            [
              {
                value: 'yolo',
                label: 'yolo — fast, no approvals',
                current: cur === 'yolo',
              },
              {
                value: 'default',
                label: 'default — balanced',
                current: cur === 'default',
              },
              {
                value: 'strict',
                label: 'strict — anti-hallucination',
                current: cur === 'strict',
              },
            ],
            'lv',
          );
          return;
        } catch {
          /* text fallback */
        }
      }
      await reply(
        [
          title,
          '',
          '`/level yolo` — no approval prompts',
          '`/level default` — approvals + balanced evidence',
          '`/level strict` — approvals + strict anti-hallucination',
        ].join('\n'),
      );
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

    if (cmd === 'skills' || cmd === 'skill') {
      await this.handleSkillsSlash(msg, cmd, arg, reply);
      return;
    }

    if (cmd === 'update') {
      await this.handleUpdateSlash(msg, arg, reply);
      return;
    }

    await reply(`Unknown \`/${cmd}\`. Try \`/help\`.`);
  }

  /**
   * E2B/hosted: ask → `/update yes` installs npm package and auto-restarts daemon.
   */
  private async handleUpdateSlash(
    msg: InboundMessage,
    arg: string,
    reply: (text: string) => Promise<void>,
  ): Promise<void> {
    const {
      applySelfUpdate,
      checkCliUpdate,
      formatUpdateOffer,
      isE2bHostedRuntime,
    } = await import('../utils/self-update.js');

    const sub = arg.trim().toLowerCase();
    const confirm =
      sub === 'yes' ||
      sub === 'y' ||
      sub === 'apply' ||
      sub === 'confirm' ||
      sub === 'ok' ||
      sub === 'install';
    const deny = sub === 'no' || sub === 'n' || sub === 'dismiss' || sub === 'later';

    if (deny) {
      await reply('OK — skipped. Ask again anytime with `/update`.');
      return;
    }

    if (!confirm) {
      const avail = await checkCliUpdate({ forceRefresh: false });
      await reply(formatUpdateOffer(avail));
      // Buttons send as plain text "yes"/"no" via choice picker → handle as /update yes
      const adapter = this.options.getAdapter(msg.platform);
      if (avail.updateAvailable && adapter?.sendChoicePicker) {
        try {
          await adapter.sendChoicePicker(
            msg.chatId,
            'Install update and auto-restart daemon?',
            [
              { value: '/update yes', label: 'Update & restart' },
              { value: '/update no', label: 'Not now' },
            ],
            'up',
          );
        } catch {
          /* text offer already sent */
        }
      }
      return;
    }

    // Confirm path
    await reply('Updating CLI… then auto-restarting daemon (this may take a minute).');
    const hosted = isE2bHostedRuntime();
    const result = await applySelfUpdate({
      restartDaemon: hosted, // E2B: install + relaunch self
    });

    if (!result.ok) {
      await reply(
        `Update failed: ${result.error || 'unknown'}\n\`${(result.logs || '').slice(0, 400)}\``,
      );
      return;
    }

    if (result.logs === 'already_latest') {
      await reply(`Already on latest · \`${result.from}\``);
      return;
    }

    await reply(
      `Updated \`${result.from}\` → \`${result.verified}\`` +
        (result.restarted
          ? '\nRestarting daemon… brb.'
          : '\nRestart the daemon from the dashboard if channels go quiet.'),
    );
  }

  /** Hermes-style /skills list and /skill <name> view. */
  private async handleSkillsSlash(
    msg: InboundMessage,
    cmd: string,
    arg: string,
    reply: (text: string) => Promise<void>,
  ): Promise<void> {
    const workdir =
      (await getOrCreateSession(msg.platform, msg.chatId)).workdir ||
      this.options.defaultWorkdir();
    const manager = new SkillManager(
      workdir,
      undefined,
      undefined,
      undefined,
      undefined,
      builtInSkillsDir,
    );
    try {
      await manager.loadSkills();
    } catch (err: any) {
      await reply(`Failed to load skills: ${err?.message || err}`);
      return;
    }

    // /skill <name> or /skills show <name>
    const showName =
      cmd === 'skill'
        ? arg.trim()
        : /^show\s+/i.test(arg)
          ? arg.replace(/^show\s+/i, '').trim()
          : '';

    if (showName) {
      const result = manager.viewSkill(showName);
      if (!result.ok) {
        await reply(result.message);
        return;
      }
      const s = result.skill;
      const body = [
        `**${s.name}**${s.provenance ? ` _(${s.provenance})_` : ''}`,
        s.description ? `_${s.description}_` : '',
        '',
        s.instructions.trim().slice(0, 3500),
        s.instructions.length > 3500 ? '\n…(truncated; agent can view_skill for full body)' : '',
      ]
        .filter(Boolean)
        .join('\n');
      await reply(body);
      return;
    }

    // /skills search <q> or /skills <q>
    let query = '';
    const tokens = arg.trim();
    if (/^search\s+/i.test(tokens)) {
      query = tokens.replace(/^search\s+/i, '').trim();
    } else if (tokens && !/^list$/i.test(tokens)) {
      query = tokens;
    }

    const catalog = manager.listSkillsCatalog({
      query: query || undefined,
      limit: 40,
    });
    if (!catalog.length) {
      await reply(
        query
          ? `No skills match \`${query}\`.`
          : 'No skills found. Add under `.xibecode/skills` or `~/.xibecode/skills`.',
      );
      return;
    }
    const lines = catalog.map(
      (s) =>
        `• **${s.name}**${s.provenance ? ` _(${s.provenance})_` : ''}${
          s.description ? ` — ${s.description.slice(0, 80)}` : ''
        }`,
    );
    await reply(
      [
        `**Skills (${catalog.length}${query ? ` matching "${query}"` : ''})**`,
        '',
        ...lines,
        '',
        '`/skill <name>` — full instructions',
        '`/skills search <query>` — filter',
        'During coding, the agent uses `list_skills` + `view_skill`.',
      ].join('\n'),
    );
  }

  /** Map "1" / "2" to choice text when ask_user offered options. */
  private normalizeAskAnswer(text: string, choices?: string[]): string {
    const t = text.trim();
    if (!choices?.length) return t;
    const n = Number(t);
    if (Number.isInteger(n) && n >= 1 && n <= choices.length) {
      return choices[n - 1];
    }
    // "1. foo" style
    const m = /^(\d+)[.)]\s*/.exec(t);
    if (m) {
      const idx = Number(m[1]);
      if (idx >= 1 && idx <= choices.length) return choices[idx - 1];
    }
    return t;
  }

  /**
   * Hermes-style /model — list or switch.
   *   /model | /models     current + short list
   *   /model <name>        set for this chat
   *   /model <name> --global  also write profile default
   *   /model clear         drop chat override
   */
  private async handleModelSlash(
    msg: InboundMessage,
    cmd: string,
    arg: string,
    reply: (text: string) => Promise<void>,
  ): Promise<void> {
    void cmd;
    const adapter = this.options.getAdapter(msg.platform);
    try {
      const cfg = new ConfigManager(this.options.profile);
      const session = await getOrCreateSession(msg.platform, msg.chatId);
      const profileModel = cfg.getModel() || '(unset)';
      const current = session.model || profileModel;

      const tokens = arg.split(/\s+/).filter(Boolean);
      const globalFlag = tokens.some((t) => t === '--global' || t === '-g');
      const nameParts = tokens.filter((t) => t !== '--global' && t !== '-g');
      const name = nameParts.join(' ').trim();

      if (name === 'clear' || name === 'reset' || name === 'default') {
        await updateSessionMeta(msg.platform, msg.chatId, { model: '' });
        await reply(
          `Model cleared for this chat.\nUsing profile default: \`${profileModel}\``,
        );
        return;
      }

      if (name) {
        await updateSessionMeta(msg.platform, msg.chatId, { model: name });
        if (globalFlag) {
          cfg.set('model', name);
          await reply(
            `Model set to \`${name}\`\n• this chat\n• profile **${cfg.getProfileName()}** (persisted)`,
          );
        } else {
          await reply(
            `Model set to \`${name}\` for this chat.\nProfile default stays \`${profileModel}\`.\nUse \`/model ${name} --global\` to persist.`,
          );
        }
        return;
      }

      let listed: string[] = [];
      let listErr: string | undefined;
      try {
        listed = await fetchModelsList(cfg);
      } catch (err: any) {
        listErr = err?.message || String(err);
      }

      // Hermes-style model picker (provider → paginated models → switch)
      if (adapter?.sendModelPicker) {
        try {
          const provider =
            (cfg.get('provider') as string | undefined) || 'default';
          await adapter.sendModelPicker(msg.chatId, {
            models: listed,
            current,
            profileDefault: profileModel,
            chatOverride: session.model,
            providerSlug: provider,
            onModelSelected: async (_chatId, modelId, _providerSlug) => {
              await updateSessionMeta(msg.platform, msg.chatId, {
                model: modelId,
              });
              return (
                `✓ Model switched to \`${modelId}\` for this chat.\n` +
                `Profile default stays \`${profileModel}\`.\n` +
                `Use \`/model ${modelId} --global\` to persist.`
              );
            },
          });
          if (listErr) {
            await reply(`(list warning: ${listErr})`);
          }
          return;
        } catch (err: any) {
          this.options.log(`model picker failed: ${err?.message || err}`);
        }
      }

      const lines = [
        '**Model**',
        `current: \`${current}\`${session.model ? ' (chat)' : ' (profile)'}`,
        `profile default: \`${profileModel}\``,
        `profile: ${cfg.getProfileName()}`,
        '',
      ];
      if (listed.length) {
        const show = listed.slice(0, 25);
        lines.push(
          `**Available** (${listed.length}${listed.length > 25 ? ', first 25' : ''}):`,
        );
        lines.push(...show.map((m, i) => `${i + 1}. \`${m}\``));
        lines.push(
          '',
          'Set: `/model <name>` · persist: `/model <name> --global` · clear: `/model clear`',
        );
      } else {
        lines.push(
          listErr ? `Could not list models: ${listErr}` : 'No models from API.',
          '',
          'Set anyway: `/model <model-id>`',
        );
      }
      await reply(lines.join('\n'));
    } catch (err: any) {
      this.options.log(`/model error: ${err?.message || err}`);
      await reply(`Model command failed: ${err?.message || err}`).catch(() => {});
    }
  }
}

async function fetchModelsList(cfg: ConfigManager): Promise<string[]> {
  const { fetchProviderModels, PROVIDER_CONFIGS } = await import('xibecode-core');
  const apiKey = cfg.getApiKey();
  const baseUrl = (cfg.getBaseUrl() || '').replace(/\/+$/, '');
  if (!baseUrl) throw new Error('no base URL configured');
  const provider = (cfg.get('provider') as string | undefined) || undefined;
  const format =
    (cfg.get('customProviderFormat') as 'openai' | 'anthropic' | undefined) ||
    (provider && provider !== 'custom' && PROVIDER_CONFIGS[provider as keyof typeof PROVIDER_CONFIGS]
      ? PROVIDER_CONFIGS[provider as keyof typeof PROVIDER_CONFIGS].format
      : 'openai');
  const result = await fetchProviderModels({
    baseUrl,
    apiKey,
    format,
    provider,
    timeoutMs: 10_000,
  });
  if (!result.models.length && result.error) {
    throw new Error(result.error);
  }
  return result.models;
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
