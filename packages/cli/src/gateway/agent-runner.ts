/**
 * Headless agent runner for gateway / cron (no TUI).
 * Coding-focused: AbortSignal support for /stop.
 */

import {
  EnhancedAgent,
  CodingToolExecutor,
  SkillManager,
  parseFallbackProviders,
  type ProviderEndpoint,
  type ProviderType,
  type DangerousApprovalHandler,
} from 'xibecode-core';

export type AskUserHandler = (req: {
  question: string;
  choices?: string[];
}) => Promise<string>;
import { ConfigManager } from '../utils/config.js';
import { builtInSkillsDir } from '../utils/built-in-skills-dir.js';
import { daemonHome } from '../utils/xibecode-home.js';
import * as path from 'path';
import * as os from 'os';

export interface HeadlessRunOptions {
  prompt: string;
  workdir?: string;
  profile?: string;
  model?: string | null;
  provider?: string | null;
  apiKey?: string | null;
  baseUrl?: string | null;
  maxIterations?: number;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  systemPrefix?: string;
  onEvent?: (type: string, data: any) => void;
  /** Abort mid-run (gateway /stop). */
  signal?: AbortSignal;
  /** Pause high-risk tools until the user approves (Telegram / Discord / Slack). */
  onDangerousApproval?: DangerousApprovalHandler;
 /** Pause for clarify / ask_user (). */
  onAskUser?: AskUserHandler;
  /**
   * Called once the agent is constructed so the gateway can mid-run steer
 * (messaging gateway busy_input_mode=steer) without aborting the turn.
   */
  onAgentReady?: (api: { steer: (text: string) => boolean }) => void;
  /**
   * Gateway rigor: yolo | default | strict
   * Controls completion evidence + post-edit verification.
   * (Approval prompts are still controlled by onDangerousApproval presence.)
   */
  rigorLevel?: 'yolo' | 'default' | 'strict';
  /**
   * Verbose agent/tool logging. Defaults from XIBECODE_DAEMON_VERBOSE=1|true
   * or XIBECODE_VERBOSE=1|true when not set explicitly.
   */
  verbose?: boolean;
}

function resolveDaemonVerbose(explicit?: boolean): boolean {
  if (typeof explicit === 'boolean') return explicit;
  const v =
    process.env.XIBECODE_DAEMON_VERBOSE ||
    process.env.XIBECODE_VERBOSE ||
    '';
  return /^(1|true|yes|on)$/i.test(v.trim());
}

export interface HeadlessRunResult {
  ok: boolean;
  text: string;
  error?: string;
  cancelled?: boolean;
  iterations?: number;
  messages?: Array<{ role: string; content: any }>;
}

function resolveFallbacks(config: ConfigManager): ProviderEndpoint[] {
  const raw = (config.getAll() as any).fallbackProviders;
  const env = process.env.XIBECODE_FALLBACK_PROVIDERS;
  return parseFallbackProviders(raw, env);
}

export async function runHeadlessAgent(
  options: HeadlessRunOptions,
): Promise<HeadlessRunResult> {
  const workdir = options.workdir
    ? path.resolve(options.workdir)
    : process.cwd();

  const prevCwd = process.cwd();
  let chdirOk = false;
  try {
    if (workdir !== prevCwd) {
      process.chdir(workdir);
      chdirOk = true;
    }
  } catch {
    /* keep prev cwd */
  }

  const restoreCwd = () => {
    if (chdirOk) {
      try {
        process.chdir(prevCwd);
      } catch {
        /* ignore */
      }
    }
  };

  if (options.signal?.aborted) {
    restoreCwd();
    return { ok: false, text: '', error: 'Cancelled', cancelled: true };
  }

  const config = new ConfigManager(options.profile);
  const apiKey =
    options.apiKey ||
    config.getApiKey() ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    restoreCwd();
    return { ok: false, text: '', error: 'No API key configured' };
  }

  const model = options.model || config.getModel();
  const baseUrl = options.baseUrl || config.getBaseUrl();
  const provider =
    (options.provider as ProviderType | undefined) ||
    (config.get('provider') as ProviderType | undefined);
  const maxIterations = options.maxIterations ?? config.get('maxIterations') ?? 0;

  let defaultSkillsPrompt = options.systemPrefix || '';
  let skillManager: SkillManager | undefined;
  try {
    skillManager = new SkillManager(
      workdir,
      apiKey,
      baseUrl,
      model,
      provider as any,
      builtInSkillsDir,
    );
    await skillManager.loadSkills();
    const built = await skillManager.buildDefaultSkillsPromptForTask(
      options.prompt,
      workdir,
    );
    if (built) {
      defaultSkillsPrompt = [defaultSkillsPrompt, built].filter(Boolean).join('\n\n');
    }
  } catch {
    /* skills optional */
  }

  const fallbackProviders = resolveFallbacks(config);

  const rigor = options.rigorLevel || 'default';
  const completionEvidenceMode =
    rigor === 'yolo' ? 'off' : rigor === 'strict' ? 'strict' : 'balanced';
  // Claude-style: verify edits by default; yolo stays fast
  const postEditVerification =
    rigor === 'yolo' ? 'off' : rigor === 'strict' ? 'strict' : 'balanced';

  // YOLO skips the approval callback entirely even if the caller passed one.
  const onDangerousApproval =
    rigor === 'yolo' ? undefined : options.onDangerousApproval;

  const toolExecutor = new CodingToolExecutor(workdir, {
    dryRun: false,
    skillManager,
    onDangerousApproval,
    onAskUser: options.onAskUser,
    abortSignal: options.signal,
  });

  // Keep interrupt wired if signal is provided after construction
  if (options.signal) {
    toolExecutor.setAbortSignal(options.signal);
    const onAbort = () => {
      try {
        toolExecutor.interruptActiveCommands();
      } catch {
        /* ignore */
      }
    };
    options.signal.addEventListener('abort', onAbort);
  }

  const verbose = resolveDaemonVerbose(options.verbose);

  const agent = new EnhancedAgent(
    {
      apiKey,
      baseUrl,
      model,
      maxIterations,
      verbose,
      mode: 'agent',
      provider: provider as any,
      customProviderFormat: config.get('customProviderFormat'),
      requestFormat: config.get('requestFormat') ?? 'auto',
      defaultSkillsPrompt,
      fallbackProviders,
      completionEvidenceMode,
      postEditVerification,
      // Prefer ending with real tool evidence rather than pure prose claims
      strictTextOnlyCompletion: rigor === 'strict',
    },
    provider as any,
  );

 // mid-run steer hook for messaging gateway
  try {
    options.onAgentReady?.({
      steer: (text: string) => {
        try {
          return agent.steer(text);
        } catch {
          return false;
        }
      },
    });
  } catch {
    /* ignore */
  }

  if (options.history?.length) {
    agent.setMessages(
      options.history.map((m) => ({
        role: m.role,
        content: m.content,
      })) as any,
    );
  }

  let lastText = '';
  let errorMsg: string | undefined;
  let cancelled = false;

  const onAbort = () => {
    cancelled = true;
  };
  options.signal?.addEventListener('abort', onAbort);

  agent.on('event', (event: { type: string; data: any }) => {
    if (options.signal?.aborted) return;
    options.onEvent?.(event.type, event.data);
    switch (event.type) {
      case 'stream_text':
        if (typeof event.data?.text === 'string') lastText += event.data.text;
        break;
      case 'stream_start':
        lastText = '';
        break;
      case 'response':
        if (typeof event.data?.text === 'string' && event.data.text.trim()) {
          lastText = event.data.text;
        }
        break;
      case 'error':
        errorMsg =
          event.data?.error ||
          event.data?.message ||
          (typeof event.data === 'string' ? event.data : undefined);
        break;
      default:
        break;
    }
  });

  try {
    const runOpts: any = {};
    if (options.signal) runOpts.signal = options.signal;

    await agent.run(
      options.prompt,
      toolExecutor.getTools(),
      toolExecutor,
      runOpts,
    );
    options.signal?.removeEventListener('abort', onAbort);
    restoreCwd();

    if (cancelled || options.signal?.aborted) {
      return {
        ok: false,
        text: lastText.trim(),
        error: 'Cancelled by user (/stop)',
        cancelled: true,
        messages: agent.getMessages(),
      };
    }

    const text = lastText.trim();
    if (!text && errorMsg) {
      return {
        ok: false,
        text: '',
        error: errorMsg,
        messages: agent.getMessages(),
      };
    }
    return {
      ok: true,
      text: text || '(no response)',
      iterations: agent.getStats?.()?.iterations,
      messages: agent.getMessages(),
    };
  } catch (err: any) {
    options.signal?.removeEventListener('abort', onAbort);
    restoreCwd();
    const msg = err?.message || String(err);
    const wasAbort =
      cancelled ||
      options.signal?.aborted ||
      /abort|cancel/i.test(msg);
    return {
      ok: false,
      text: lastText.trim(),
      error: wasAbort ? 'Cancelled by user (/stop)' : msg,
      cancelled: wasAbort,
      messages: agent.getMessages?.(),
    };
  }
}

/** Runtime root for Xibe Daemon (~/.xibecode/daemon; migrates from gateway/). */
export function gatewayHome(): string {
  return daemonHome();
}
