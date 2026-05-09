import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool, ToolUseBlock, TextBlock, ContentBlock } from '@anthropic-ai/sdk/resources/messages';
import fetch from 'node-fetch';
import { existsSync, readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { EventEmitter } from 'events';
import { AgentMode, MODE_CONFIG, ModeState, createModeState, transitionMode, ModeOrchestrator, parseModeRequest, stripModeRequests, parseTaskComplete, stripTaskComplete, parsePlanReady, stripPlanReady, parseQuestions, stripQuestions, ModeTransitionPolicy } from './modes.js';
import { NeuralMemory } from './memory.js';
import { SessionMemory } from './session-memory.js';
import type { UUID } from 'crypto';
import { generateUuid, isTranscriptMessage, type FileHistorySnapshot } from './transcript-types.js';
import type { Entry } from './transcript-types.js';
import { getTranscriptWriter } from './transcript-writer.js';
import { registerCleanup, setupGracefulShutdown } from './graceful-shutdown.js';
import { PROVIDER_CONFIGS, ProviderType } from './types/index.js';
import { PermissionManager } from './permissions.js';
import { ToolOrchestrator, type ToolExecutionUpdate } from './tool-orchestrator.js';
import { compactConversation } from './context-compactor.js';
import {
  autoLoadProjectMemories,
  formatMemoriesForContext,
  isAutoMemoryLoadEnabled,
} from './utils/auto-memory.js';
import type { ImageAttachment } from './types/index.js';
import type { StreamEvent, StreamOptions } from './types/index.js';
import { SettingsManager } from './settings/settings.js';
import { PermissionRuleManager } from './permission-rules/permission-rules.js';
import { HooksManager } from './hooks/hooks.js';
import { AutoMemoryManager } from './auto-memory/auto-memory.js';
import { microcompact, shouldAutoCompact, resetMicrocompactCircuitBreaker, estimateTokenCount } from './microcompact.js';

/** Reasoning tier for hierarchical (AX-lite) behavior: strategic = plan only, tactical = per-step decisions, operational = tool use. */
export type ReasoningTier = 'strategic' | 'tactical' | 'operational';

/** CoM-style reasoning mindset: influences system-prompt fragment for this turn. */
export type ReasoningMindset = 'convergent' | 'divergent' | 'algorithmic';

export interface AgentConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxIterations?: number;
  verbose?: boolean;
  mode?: AgentMode;
  provider?: ProviderType;
  customProviderFormat?: 'openai' | 'anthropic';
  /** When set, overrides provider default for Anthropic Messages vs OpenAI chat completions. */
  requestFormat?: 'auto' | 'openai' | 'anthropic';
  /** When true, force a strategic plan (one-shot, no tools) before tactical/operational execution. */
  planFirst?: boolean;
  /** Optional session memory for this run (attempts, failures, learnings). */
  sessionMemory?: SessionMemory;
  /** Optional list of file paths suggested as relevant to the task (context pruning). */
  contextHintFiles?: string[];
  /** Model for strategic tier (multi-model routing). */
  planningModel?: string;
  /** Model for tactical/operational tier (multi-model routing). */
  executionModel?: string;
  /** Enable mindset-adaptive reasoning (CoM-style: convergent/divergent/algorithmic). */
  mindsetAdaptive?: boolean;
  /**
   * When true (e.g. `run-pr`), if the assistant ends a turn with text but no tool calls,
   * require `[[TASK_COMPLETE | summary=...]]` in the text or inject a continuation nudge instead of exiting.
   */
  strictTextOnlyCompletion?: boolean;
  /** Markdown from `SkillManager.formatBuiltInSkillsForSystemPrompt()` — bundled default skills. */
  defaultSkillsPrompt?: string;
  /** Completion verification profile: off, balanced, or strict. */
  completionEvidenceMode?: 'off' | 'balanced' | 'strict';
  /** Post-edit verification profile for mutating tools. */
  postEditVerification?: 'off' | 'balanced' | 'strict';
  /** Minimum neural-memory score required before recall is injected. */
  memoryRecallMinScore?: number;
}

export interface AgentEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'response' | 'error' | 'warning' | 'complete' | 'iteration' | 'stream_start' | 'stream_text' | 'stream_end' | 'mode_changed' | 'mode_change_requested' | 'plan_ready' | 'questions';
  data: any;
}

export class LoopDetector {
  private history: Array<{ tool: string; signature: string; coarse: string; timestamp: number }> = [];
  private readonly maxRepeats = 3;
  private readonly timeWindow = 10000;

  check(toolName: string, toolInput: any): { allowed: boolean; reason?: string } {
    const signature = this.makeSignature(toolName, toolInput);
    const coarse = this.makeCoarseSignature(toolName, toolInput);
    const now = Date.now();

    this.history.push({ tool: toolName, signature, coarse, timestamp: now });
    this.history = this.history.filter(h => now - h.timestamp < this.timeWindow);

    const recentDuplicates = this.history.filter(h => h.signature === signature);
    if (recentDuplicates.length >= this.maxRepeats) {
      return {
        allowed: false,
        reason: `CRITICAL ERROR: Loop detected! You called ${toolName} ${this.maxRepeats}+ times with the exact same parameters. YOU MUST STOP AND RE-EVALUATE YOUR STRATEGY. Do not use this tool again right now. Change your mindset. Use 'search_files' or 'get_context' to gather new facts before proceeding.`,
      };
    }

    const sameTool = this.history.filter(h => h.tool === toolName);
    const sameCoarse = this.history.filter(h => h.coarse === coarse);

    // Aggressive coarse match rejection
    if (sameCoarse.length >= this.maxRepeats + 1) {
      return {
        allowed: false,
        reason: `CRITICAL ERROR: Repeated ${toolName} attempts with near-identical patterns. YOUR ASSUMPTIONS ARE WRONG. Step back, verify file paths with 'search_files', and try a completely different approach.`,
      };
    }

    // Lower threshold for repeated tool failures
    if (sameTool.length >= this.maxRepeats + 2) {
      const uniquePatterns = new Set(sameTool.map(h => h.coarse)).size;
      if (uniquePatterns <= 3) {
        return {
          allowed: false,
          reason: `CRITICAL ERROR: ${toolName} repeated ${sameTool.length} times with little variation. STOP guessing. Use 'read_file' or 'grep_code' to find the actual code structure, or use 'web_search' if you lack documentation.`,
        };
      }
      return {
        allowed: true,
        reason: `Warning: ${toolName} called ${sameTool.length} times recently. Ensure you are making progress.`,
      };
    }

    return { allowed: true };
  }

  reset() {
    this.history = [];
  }

  private makeSignature(toolName: string, input: unknown): string {
    return JSON.stringify({
      tool: toolName,
      input: this.canonicalize(input),
    });
  }

  private makeCoarseSignature(toolName: string, input: unknown): string {
    const canonical = this.canonicalize(input);
    if (!canonical || typeof canonical !== 'object' || Array.isArray(canonical)) {
      return `${toolName}:primitive`;
    }
    const keys = Object.keys(canonical as Record<string, unknown>).sort();
    return `${toolName}:${keys.join(',')}`;
  }

  private canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.canonicalize(item));
    }
    if (value && typeof value === 'object') {
      const inObj = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(inObj).sort()) {
        out[key] = this.canonicalize(inObj[key]);
      }
      return out;
    }
    return value;
  }
}

// ─── Think-tag streaming filter ───────────────────────────────
class ThinkTagFilter {
  private insideThink = false;
  private buffer = '';

  reset() {
    this.insideThink = false;
    this.buffer = '';
  }

  /**
   * Process a streaming text chunk. Returns the text that should be shown
   * to the user (with <think>...</think> blocks removed in real-time).
   */
  push(chunk: string): string {
    const combined = this.buffer + chunk;
    this.buffer = '';
    let output = '';
    let i = 0;

    while (i < combined.length) {
      if (this.insideThink) {
        const closeIdx = combined.indexOf('</think>', i);
        if (closeIdx !== -1) {
          this.insideThink = false;
          i = closeIdx + 8;
        } else {
          // Still inside think block, consume everything
          break;
        }
      } else {
        const openIdx = combined.indexOf('<think>', i);
        if (openIdx !== -1) {
          output += combined.substring(i, openIdx);
          this.insideThink = true;
          i = openIdx + 7;
        } else {
          // Check for partial '<think' or '</think' at the end
          const remaining = combined.substring(i);
          const partialTag = this.findPartialTag(remaining);
          if (partialTag > 0) {
            output += remaining.substring(0, remaining.length - partialTag);
            this.buffer = remaining.substring(remaining.length - partialTag);
          } else {
            output += remaining;
          }
          break;
        }
      }
    }

    return output;
  }

  /** Flush any remaining buffered text */
  flush(): string {
    const leftover = this.buffer;
    this.buffer = '';
    if (this.insideThink) return '';
    return leftover;
  }

  /**
   * Strip all think tags from a complete string (non-streaming).
   */
  static strip(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }

  private findPartialTag(text: string): number {
    const tags = ['<think>', '</think>'];
    for (const tag of tags) {
      for (let len = tag.length - 1; len >= 1; len--) {
        if (text.endsWith(tag.substring(0, len))) {
          return len;
        }
      }
    }
    return 0;
  }
}

const MAX_TOOL_RESULT_CHARS = 30000;

export function compactToolResultPayload(result: unknown, maxChars: number = MAX_TOOL_RESULT_CHARS): unknown {
  if (typeof result === 'string') {
    return compactLargeString(result, maxChars);
  }

  if (Array.isArray(result)) {
    return result.map((item) => compactToolResultPayload(item, maxChars));
  }

  if (!result || typeof result !== 'object') {
    return result;
  }

  const compacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(result as Record<string, unknown>)) {
    if (typeof value === 'string' && ['stdout', 'stderr', 'content', 'output', 'message'].includes(key)) {
      compacted[key] = compactLargeString(value, maxChars);
      if (compacted[key] !== value) {
        compacted[`${key}Truncated`] = true;
        compacted[`${key}OriginalLength`] = value.length;
      }
    } else {
      compacted[key] = compactToolResultPayload(value, Math.max(4000, Math.floor(maxChars / 2)));
    }
  }

  return compacted;
}

function compactLargeString(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const marker = `\n\n[tool result truncated: original length ${value.length} chars]\n\n`;
  const available = Math.max(0, maxChars - marker.length);
  const headLength = Math.ceil(available * 0.6);
  const tailLength = Math.floor(available * 0.4);
  return `${value.slice(0, headLength)}${marker}${value.slice(value.length - tailLength)}`;
}

// ─── Retry Helpers ───────────────────────────────────────────

/** Classify an API error as retryable or fatal. */
function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as any;

  // Network-level errors: always retryable
  const msg = String(e.message || '').toLowerCase();
  if (msg.includes('econnreset') || msg.includes('econnrefused') || msg.includes('etimedout') ||
      msg.includes('socket hang up') || msg.includes('network') || msg.includes('fetch failed') ||
      msg.includes('inactivity timeout') || msg.includes('epipe')) {
    return true;
  }

  // HTTP status-based: retry on 429 (rate limit), 500, 502, 503, 504
  const status = e.status ?? e.statusCode ?? e.httpStatus;
  if (typeof status === 'number') {
    return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
  }

  // API error with embedded status
  if (e.error?.status) {
    const s = e.error.status;
    return s === 429 || s === 500 || s === 502 || s === 503 || s === 504;
  }

  // Overloaded / capacity errors from providers
  if (msg.includes('overloaded') || msg.includes('capacity') || msg.includes('rate limit') ||
      msg.includes('too many requests') || msg.includes('temporarily unavailable') ||
      msg.includes('server error') || msg.includes('service unavailable')) {
    return true;
  }

  return false;
}

/** Check if an error is a rate-limit (429) specifically, for longer backoff. */
function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as any;
  const status = e.status ?? e.statusCode ?? e.httpStatus ?? e.error?.status;
  if (status === 429) return true;
  const msg = String(e.message || '').toLowerCase();
  return msg.includes('rate limit') || msg.includes('too many requests');
}

/** Compute backoff delay with exponential increase and jitter.
 *  @param attempt - 1-based attempt number
 *  @param baseMs - base delay in ms (default 2000)
 *  @param maxMs - cap in ms (default 30000)
 */
function retryDelayMs(attempt: number, baseMs = 2000, maxMs = 30000): number {
  // Exponential: 2s, 4s, 8s, 16s, 30s, 30s, ...
  const exp = Math.min(baseMs * Math.pow(2, attempt - 1), maxMs);
  // Add jitter: random 0-25% of the exponential value
  const jitter = Math.floor(exp * Math.random() * 0.25);
  return exp + jitter;
}

// ─── Agent ────────────────────────────────────────────────────
export class EnhancedAgent extends EventEmitter {
  private client: Anthropic;
  private messages: MessageParam[] = [];
  private loopDetector = new LoopDetector();
  private thinkFilter = new ThinkTagFilter();
  private config: Required<Omit<AgentConfig, 'sessionMemory' | 'contextHintFiles' | 'planningModel' | 'executionModel' | 'mindsetAdaptive' | 'strictTextOnlyCompletion' | 'defaultSkillsPrompt' | 'requestFormat' | 'completionEvidenceMode' | 'postEditVerification' | 'memoryRecallMinScore'>> & { customProviderFormat: 'openai' | 'anthropic'; requestFormat: 'auto' | 'openai' | 'anthropic'; sessionMemory?: SessionMemory | null; contextHintFiles: string[]; planningModel?: string; executionModel?: string; mindsetAdaptive?: boolean; strictTextOnlyCompletion: boolean; completionEvidenceMode: 'off' | 'balanced' | 'strict'; postEditVerification: 'off' | 'balanced' | 'strict'; memoryRecallMinScore: number };
  private iterationCount = 0;
  private toolCallCount = 0;
  private filesChanged: Set<string> = new Set();
  private modeState: ModeState;
  private modeOrchestrator: ModeOrchestrator;
  private provider: ProviderType;
  /** Ranked markdown memories (user + project + .xibecode/memories); injected in getSystemPrompt */
  private autoMemoryMarkdownSection: string = '';
  private totalInputTokens: number = 0;
  private totalOutputTokens: number = 0;
  private sessionCost: number = 0;
  private activeSkill: { name: string; instructions: string } | null = null;
  private defaultSkillsPrompt: string = '';
  private memory: NeuralMemory;
  private injectedMessages: string[] = [];
  /** Current reasoning tier (AX-lite): strategic = plan, tactical = step decisions, operational = tools. */
  private currentTier: ReasoningTier = 'tactical';
  /** When plan-first was used, the initial strategic plan text (for context). */
  private strategicPlanText: string = '';
  private sessionMemory: SessionMemory | null = null;
  private contextHintFiles: string[] = [];
  private mindsetAdaptive: boolean = false;
  private currentMindset: ReasoningMindset = 'convergent';
  /** Transcript session ID for JSONL persistence. */
  private transcriptSessionId: string | null = null;
  /** Transcript file path for JSONL persistence. */
  private transcriptFilePath: string | null = null;
  /** UUID of the last entry written to transcript (for parentUuid chain). */
  private lastTranscriptUuid: UUID | null = null;
  /** Whether transcript cleanup has been registered. */
  private transcriptCleanupRegistered = false;
  /** Pending assistant transcript UUID for the active run turn. */
  private pendingAssistantTranscriptUuid: UUID | null = null;
  /** The current tool executor used by run(), for file-history snapshot finalization. */
  private activeToolExecutor: any | null = null;
  private permissionManager: PermissionManager;
  private toolOrchestrator: ToolOrchestrator;
  private evidenceTrail: Array<{ kind: string; detail: string; ts: number }> = [];
  /** Tracks consecutive completion-gate rejections to avoid infinite nudge loops. */
  private completionGateRetries = 0;
  /** Set to true when [[TASK_COMPLETE]] is detected so the loop breaks immediately. */
  private taskCompletedFlag = false;
  /** Set to true when [[QUESTIONS:...]] is detected so the loop pauses for user answers. */
  private questionsPendingFlag = false;
  private static readonly MAX_COMPLETION_GATE_RETRIES = 2;
  /** Settings manager for multi-source config */
  private settingsManager?: import('./settings/settings.js').SettingsManager;
  /** Permission rule manager for allow/deny/ask rules */
  private ruleManager?: import('./permission-rules/permission-rules.js').PermissionRuleManager;
  /** Hooks manager for lifecycle events */
  private hooksManager?: import('./hooks/hooks.js').HooksManager;
  /** Auto-memory manager for persistent project memories */
  private autoMemManager?: import('./auto-memory/auto-memory.js').AutoMemoryManager;

  private isAbortError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const anyErr = err as any;
    return (
      anyErr.name === 'AbortError' ||
      anyErr.type === 'aborted' ||
      String(anyErr.message || '').toLowerCase().includes('aborted')
    );
  }

  public injectMessage(message: string): void {
    this.injectedMessages.push(message);
  }

  public getInjectedMessages(): string[] {
    return this.injectedMessages;
  }

  public clearInjectedMessages(): void {
    this.injectedMessages = [];
  }

  private recordEvidence(kind: string, detail: string): void {
    this.evidenceTrail.push({ kind, detail, ts: Date.now() });
    if (this.evidenceTrail.length > 80) {
      this.evidenceTrail = this.evidenceTrail.slice(-80);
    }
  }

  private estimateMessageTokens(message: MessageParam): number {
    const text = (() => {
      if (typeof message.content === 'string') return message.content;
      if (!Array.isArray(message.content)) return '';
      return message.content
        .map((block: any) => {
          if (block?.type === 'text') return String(block.text || '');
          if (block?.type === 'tool_use') {
            const input = block.input ? JSON.stringify(block.input) : '{}';
            return `[tool_use:${String(block.name || 'unknown')}] ${input}`;
          }
          if (block?.type === 'tool_result') {
            return `[tool_result:${String(block.tool_use_id || 'unknown')}] ${String(block.content || '')}`;
          }
          return String(block?.content ?? '');
        })
        .join('\n');
    })();
    // Rough estimate for modern tokenizers across mixed text/code.
    return Math.ceil(text.length / 4);
  }

  private estimateConversationTokens(): number {
    return this.messages.reduce((sum, message) => sum + this.estimateMessageTokens(message), 0);
  }

  /** Get the context window size for the current model. */
  private getContextWindowForModel(): number {
    const model = this.config.model.toLowerCase();
    if (model.includes('claude-3-5') || model.includes('claude-3.5')) return 200_000;
    if (model.includes('claude-4') || model.includes('claude-sonnet-4')) return 200_000;
    if (model.includes('claude-3-opus')) return 200_000;
    if (model.includes('claude-3-haiku')) return 200_000;
    if (model.includes('gpt-4o') || model.includes('gpt-4-turbo')) return 128_000;
    if (model.includes('gpt-4')) return 8_192;
    if (model.includes('o1') || model.includes('o3')) return 128_000;
    if (model.includes('deepseek')) return 128_000;
    if (model.includes('qwen')) return 128_000;
    // Default safe fallback
    return 120_000;
  }

  private hasRecentGroundedEvidence(windowMs = 5 * 60 * 1000): boolean {
    const threshold = Date.now() - windowMs;
    return this.evidenceTrail.some((entry) => entry.ts >= threshold);
  }

  private shouldEnforceCompletionEvidence(): boolean {
    if (this.config.completionEvidenceMode === 'off') return false;
    // Allow conversational/informational answers with no file mutations.
    // Even if read-only tools were used (git status, list_directory, etc.),
    // if no files were changed there's nothing to verify evidence for.
    if (this.filesChanged.size === 0 && this.iterationCount <= 2) {
      return false;
    }
    return true;
  }

  private async postEditVerify(
    toolExecutor: any,
    toolUse: ToolUseBlock,
    result: any,
  ): Promise<{ ok: boolean; message: string }> {
    if (this.config.postEditVerification === 'off') {
      return { ok: true, message: 'disabled' };
    }
    if (!['write_file', 'edit_file', 'edit_lines', 'verified_edit'].includes(toolUse.name)) {
      return { ok: true, message: 'not-applicable' };
    }
    const input = (toolUse.input ?? {}) as Record<string, unknown>;
    const path =
      (typeof result?.path === 'string' && result.path) ||
      (typeof input.path === 'string' && input.path) ||
      '';
    if (!path) {
      const strict = this.config.postEditVerification === 'strict';
      return {
        ok: !strict,
        message: strict ? 'post-edit verification failed: missing path' : 'post-edit verification skipped: missing path',
      };
    }

    const readArgs: Record<string, unknown> = { path };
    if (typeof input.start_line === 'number' && typeof input.end_line === 'number') {
      readArgs.start_line = input.start_line;
      readArgs.end_line = input.end_line;
    }

    const check = await toolExecutor.execute('read_file', readArgs);
    if (check?.error || check?.success === false) {
      return {
        ok: false,
        message: `post-edit verification failed: could not read ${path}`,
      };
    }

    if (typeof input.new_content === 'string' && input.new_content.trim().length > 0) {
      const observed = typeof check?.content === 'string' ? check.content : '';
      const expected = input.new_content.trim();
      const normalize = (v: string) => v.replace(/\s+/g, ' ').trim();
      const expectedNeedle = normalize(expected).slice(0, 180);
      if (expectedNeedle && !normalize(observed).includes(expectedNeedle)) {
        return {
          ok: this.config.postEditVerification !== 'strict',
          message: `post-edit verification warning: updated content was not confidently observed in ${path}`,
        };
      }
    }

    this.recordEvidence('post_edit_verify', path);
    return { ok: true, message: `verified ${path}` };
  }

  // Pricing per 1M tokens (input/output) — Claude models
  private static readonly PRICING: Record<string, { input: number; output: number }> = {
    'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
    'claude-opus-4-5-20251101': { input: 15, output: 75 },
    'claude-haiku-4-5-20251015': { input: 1, output: 5 },
    'claude-opus-4-6-20251101': { input: 5, output: 25 },
  };

  constructor(config: AgentConfig, providerOverride?: ProviderType) {
    super();

    const clientConfig: any = { apiKey: config.apiKey };
    if (config.baseUrl) {
      clientConfig.baseURL = config.baseUrl;
    }

    this.client = new Anthropic(clientConfig);
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? '',
      model: config.model,
      maxIterations: config.maxIterations ?? 150,
      verbose: config.verbose ?? false,
      mode: config.mode ?? 'agent',
      provider: config.provider ?? this.detectProvider(config.model),
      customProviderFormat: config.customProviderFormat ?? 'openai',
      requestFormat: config.requestFormat ?? 'auto',
      planFirst: config.planFirst ?? false,
      sessionMemory: config.sessionMemory,
      contextHintFiles: config.contextHintFiles ?? [],
      planningModel: config.planningModel,
      executionModel: config.executionModel,
      mindsetAdaptive: config.mindsetAdaptive ?? false,
      strictTextOnlyCompletion: config.strictTextOnlyCompletion ?? false,
      completionEvidenceMode: config.completionEvidenceMode ?? 'balanced',
      postEditVerification: config.postEditVerification ?? 'balanced',
      memoryRecallMinScore: config.memoryRecallMinScore ?? 2,
    };
    this.defaultSkillsPrompt = config.defaultSkillsPrompt ?? '';
    this.mindsetAdaptive = this.config.mindsetAdaptive ?? false;

    // Initialize mode state and orchestrator
    this.modeState = createModeState(this.config.mode);
    this.permissionManager = new PermissionManager(this.config.mode);
    this.toolOrchestrator = new ToolOrchestrator();
    this.modeOrchestrator = new ModeOrchestrator({
      autoApprovalPolicy: 'prompt-only',
      allowAutoEscalation: true,
    });
    // Prefer explicit provider override from config, otherwise auto-detect
    this.provider = providerOverride ?? config.provider ?? this.detectProvider(this.config.model);

    // Load project memory if it exists
    this.sessionMemory = config.sessionMemory ?? null;
    this.contextHintFiles = config.contextHintFiles ?? [];
    this.memory = new NeuralMemory();
    this.memory.init().catch(console.error);

    // Initialize settings, permission rules, hooks, and auto-memory
    this.settingsManager = new SettingsManager({ cwd: process.cwd() });
    this.ruleManager = new PermissionRuleManager(this.settingsManager);
    this.hooksManager = new HooksManager(this.settingsManager);
    this.autoMemManager = new AutoMemoryManager({ cwd: process.cwd() });

    // Load settings and hooks asynchronously (non-blocking)
    this.initializeFeatures().catch(() => { /* non-fatal */ });
  }

  detectProvider(model: string): ProviderType {
    const m = model.toLowerCase();
    if (m.startsWith('claude')) return 'anthropic';
    if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3')) return 'openai';
    if (m.startsWith('glm')) return 'zai';
    if (m.startsWith('qwen')) return 'alibaba';
    if (m.startsWith('kimi') || m.startsWith('moonshot')) return 'kimi';
    if (m.startsWith('grok')) return 'grok';
    if (m.startsWith('deepseek')) return 'deepseek';
    if (m.startsWith('llama') || m.startsWith('mixtral')) return 'groq';
    if (m.includes('/')) return 'openrouter';
    return 'openai';
  }

  /** Initialize settings, permission rules, hooks, and auto-memory from config files. */
  private async initializeFeatures(): Promise<void> {
    try {
      if (this.settingsManager) {
        const settings = await this.settingsManager.getSettings();

        // Load permission rules
        if (this.ruleManager) {
          this.ruleManager.loadFromSettings(settings);
        }

        // Load hooks
        if (this.hooksManager) {
          this.hooksManager.loadFromSettings(settings);
          await this.hooksManager.execute('SessionStart', {
            event: 'SessionStart',
            sessionId: undefined,
          });
        }

        // Configure auto-memory from settings
        if (this.autoMemManager && settings.autoMemoryEnabled !== undefined) {
          this.autoMemManager.updateConfig({ enabled: settings.autoMemoryEnabled });
        }

        // Initialize auto-memory directory
        if (this.autoMemManager) {
          await this.autoMemManager.initialize();
        }
      }
    } catch {
      /* non-fatal: features degrade gracefully */
    }
  }

  /** Multi-model routing: use planning model for strategic tier, execution model for tactical/operational when set. */
  private getModelForTier(): string {
    if (this.currentTier === 'strategic' && this.config.planningModel) return this.config.planningModel;
    if ((this.currentTier === 'tactical' || this.currentTier === 'operational') && this.config.executionModel) return this.config.executionModel;
    return this.config.model;
  }

  emit(event: AgentEvent['type'], data: any): boolean {
    return super.emit('event', { type: event, data });
  }

  async run(
    initialPrompt: string,
    tools: Tool[],
    toolExecutor: any,
    opts?: { images?: ImageAttachment[]; signal?: AbortSignal },
  ): Promise<void> {
    // Reset per-turn state (keeps conversation history in this.messages)
    this.iterationCount = 0;
    this.toolCallCount = 0;
    this.loopDetector.reset();
    this.evidenceTrail = [];
    this.completionGateRetries = 0;
    this.taskCompletedFlag = false;
    this.questionsPendingFlag = false;
    this.activeToolExecutor = toolExecutor;
    this.pendingAssistantTranscriptUuid = generateUuid();

    if (this.pendingAssistantTranscriptUuid) {
      if (typeof toolExecutor?.setActiveFileHistoryMessageId === 'function') {
        toolExecutor.setActiveFileHistoryMessageId(this.pendingAssistantTranscriptUuid);
      }
      if (typeof toolExecutor?.ensureFileHistoryInitialized === 'function') {
        await toolExecutor.ensureFileHistoryInitialized(this.pendingAssistantTranscriptUuid);
      }
    }

    this.autoMemoryMarkdownSection = '';
    if (isAutoMemoryLoadEnabled()) {
      try {
        const ranked = await autoLoadProjectMemories(process.cwd(), initialPrompt, []);
        this.autoMemoryMarkdownSection = formatMemoriesForContext(ranked);
      } catch {
        /* non-fatal */
      }
    }
    if (!this.autoMemoryMarkdownSection.trim()) {
      const fallbackMd = join(process.cwd(), '.xibecode', 'memory.md');
      if (existsSync(fallbackMd)) {
        try {
          const content = await readFile(fallbackMd, 'utf-8');
          this.autoMemoryMarkdownSection = `\n\n## Project Memory\n\n${content.trim()}`;
        } catch {
          /* ignore */
        }
      }
    }
    // Also fetch context from the new AutoMemoryManager (port from OpenClaude)
    if (this.autoMemManager) {
      try {
        const autoMemContext = await this.autoMemManager.getContextMemories(initialPrompt);
        if (autoMemContext.trim() && !this.autoMemoryMarkdownSection.includes(autoMemContext.trim())) {
          this.autoMemoryMarkdownSection += `\n\n## Auto-Memories\n\n${autoMemContext.trim()}`;
        }
      } catch {
        /* non-fatal */
      }
    }

    if (opts?.images && opts.images.length > 0) {
      const blocks: any[] = [{ type: 'text', text: initialPrompt }];
      for (const img of opts.images) {
        blocks.push({
          type: 'image_url',
          image_url: { url: `data:${img.mime};base64,${img.dataBase64}` },
        });
      }
      this.messages.push({ role: 'user', content: blocks as any });
    } else {
      this.messages.push({
        role: 'user',
        content: initialPrompt,
      });
    }

    // ─── Neural Memory Recall ───
    try {
      const memories = await this.memory.retrieve(initialPrompt, 5, this.config.memoryRecallMinScore);
      if (memories.length > 0) {
        const memoryContext = memories.map(m => `- [${new Date(m.timestamp).toISOString().split('T')[0]}] ${m.trigger} -> ${m.action} (${m.outcome})`).join('\n');
        this.messages.push({
          role: 'user',
          content:
            `\n\n[Neural Memory Recall — UNVERIFIED HINTS]\n` +
            `These are recall hints, not guaranteed facts. Verify with read_file / grep_code / tests before relying on them.\n` +
            `${memoryContext}\n\nUser Prompt: ${initialPrompt}`
        });
        this.emit('thinking', { message: `Recalled ${memories.length} relevant memories` });
      }
    } catch (err) {
      // Ignore memory errors to not block execution
    }

    this.emit('thinking', { message: 'Starting agent...' });

    // ─── Plan-first (AX-lite strategic tier): one-shot plan before execution ───
    if (this.config.planFirst) {
      this.currentTier = 'strategic';
      this.emit('thinking', { message: 'Strategic planning (plan-first mode)...' });
      try {
        const planResult = await this.callModel([], opts?.signal);
        const planContent = planResult.message?.content;
        let planText = '';
        if (Array.isArray(planContent)) {
          for (const block of planContent) {
            if (block.type === 'text' && typeof block.text === 'string') {
              planText += block.text;
            }
          }
        } else if (typeof planContent === 'string') {
          planText = planContent;
        }
        planText = planText.trim() || 'Proceed step by step.';
        this.strategicPlanText = planText;
        this.messages.push({
          role: 'assistant',
          content: planResult.message?.content ?? planText,
        });
        this.messages.push({
          role: 'user',
          content: `[Strategic plan you created]\n\n${planText}\n\nNow execute this plan step by step. Use the available tools to implement each part.`,
        });
        this.currentTier = 'tactical';
        this.emit('thinking', { message: 'Strategic plan complete; starting execution.' });
      } catch (err: any) {
        this.emit('warning', { message: `Plan-first planning failed: ${err?.message ?? err}. Continuing without plan.` });
        this.currentTier = 'tactical';
      }
    }

    while (this.iterationCount < this.config.maxIterations) {
      this.iterationCount++;

      this.emit('iteration', {
        current: this.iterationCount,
        total: this.config.maxIterations,
      });

      this.emit('thinking', { message: 'AI is thinking...' });

      const maxApiRetries = 5;
      let response: any;
      let streamed = false;

      // Heartbeat: emit a thinking event every 30s while waiting for the API
      // so the TUI watchdog doesn't kill the agent during long model responses.
      const heartbeatInterval = setInterval(() => {
        this.emit('thinking', { message: 'Still waiting for model response...' });
      }, 30_000);

      try {
        // Tools are supported for both Anthropic and OpenAI-format models.
        const effectiveTools = tools;
        for (let attempt = 1; attempt <= maxApiRetries; attempt++) {
          try {
            const result = await this.callModel(effectiveTools, opts?.signal);
            response = result.message;
            streamed = result.streamed;
            const persona = result.persona;
            break;
          } catch (apiError: any) {
            if (opts?.signal?.aborted || this.isAbortError(apiError)) {
              throw apiError;
            }

            const retryable = isRetryableError(apiError);
            const rateLimit = isRateLimitError(apiError);
            this.emit('error', { message: 'API Error', error: apiError.message });

            if (!retryable) {
              // Non-retryable error (auth, bad request, etc.) — fail immediately
              throw apiError;
            }

            if (attempt < maxApiRetries) {
              // Exponential backoff: longer for rate limits
              const delay = rateLimit
                ? retryDelayMs(attempt, 5000, 60000)  // 5s base, up to 60s for rate limits
                : retryDelayMs(attempt, 2000, 30000);  // 2s base, up to 30s for other errors
              const reason = rateLimit ? 'rate limited' : 'retryable error';
              this.emit('warning', {
                message: `${reason} — retrying in ${(delay / 1000).toFixed(1)}s (attempt ${attempt}/${maxApiRetries})...`,
              });
              await new Promise((r) => setTimeout(r, delay));
            } else {
              this.emit('warning', {
                message: `Max retries (${maxApiRetries}) exceeded for retryable error.`,
              });
              throw apiError;
            }
          }
        }
      } finally {
        clearInterval(heartbeatInterval);
      }

      try {
        if (!response) {
          throw new Error('API call failed after retries');
        }

        // Add assistant response
        this.messages.push({
          role: 'assistant',
          content: response.content,
        });

        // Track token usage for cost estimation
        if (response.usage) {
          const inputTokens = response.usage.input_tokens || 0;
          const outputTokens = response.usage.output_tokens || 0;
          this.totalInputTokens += inputTokens;
          this.totalOutputTokens += outputTokens;

          // Calculate cost
          const pricing = EnhancedAgent.PRICING[this.config.model];
          if (pricing) {
            this.sessionCost += (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
          }
        }

        // Auto-compact: first try microcompact, then full compaction if needed
        const contextWindow = this.getContextWindowForModel();
        const compactThreshold = this.settingsManager
          ? (await this.settingsManager.getSettings()).autoCompactThreshold ?? 13000
          : 13000;
        let estimatedTokens = this.estimateConversationTokens();

        // Try microcompact first (lighter weight)
        if (estimatedTokens > contextWindow - compactThreshold) {
          const mcResult = microcompact({
            messages: this.messages,
            tokenCount: estimatedTokens,
            contextWindow,
            compactThreshold,
          });

          if (mcResult.strippedCount > 0 || mcResult.ephemeralCount > 0) {
            this.messages = mcResult.messages;
            estimatedTokens = this.estimateConversationTokens();
            this.emit('warning', {
              message: `Microcompact: stripped ${mcResult.strippedCount}, marked ${mcResult.ephemeralCount} ephemeral. Tokens: ${estimatedTokens}`,
            });
          }

          // If microcompact says we need full compaction, do it
          if (mcResult.triggeredFullCompact) {
            const beforeCount = this.messages.length;
            const compacted = compactConversation(this.messages, 24);
            this.messages = compacted.messages;
            estimatedTokens = this.estimateConversationTokens();
            this.emit('warning', {
              message:
                `${compacted.summaryNotice || 'Auto-compacted conversation to save context'} ` +
                `(estimated tokens: ${estimatedTokens})`,
            });

            // Fire PreCompact/PostCompact hooks
            if (this.hooksManager) {
              try {
                await this.hooksManager.execute('PostCompact', {
                  event: 'PostCompact',
                  compactTrigger: 'auto',
                });
              } catch { /* non-fatal */ }
            }
          }
        }

        // Process response
        const content: ContentBlock[] = response.content;
        const textBlocks = content.filter((block): block is TextBlock => block.type === 'text');
        const toolUseBlocks = content.filter((block): block is ToolUseBlock => block.type === 'tool_use');

        // Check for mode change requests in text blocks
        for (const block of textBlocks) {
          if (this.mindsetAdaptive) {
            const mindsetMatch = block.text.match(/\[\[SET_MINDSET:\s*(\w+)\]\]/i);
            if (mindsetMatch) {
              const m = mindsetMatch[1].toLowerCase();
              if (m === 'convergent' || m === 'divergent' || m === 'algorithmic') {
                this.currentMindset = m as ReasoningMindset;
              }
            }
          }
          const modeRequest = parseModeRequest(block.text);
          if (modeRequest) {
            this.modeState = this.modeOrchestrator.requestModeChange(
              this.modeState,
              modeRequest.mode,
              modeRequest.reason,
              'model'
            );

            // Evaluate the request
            const evaluation = this.modeOrchestrator.evaluateModeChangeRequest(this.modeState);
            // Model-initiated mode changes are auto-approved since the model
            // is acting on the user's behalf to complete the requested task.
            const autoApprove = true;
            const approvedByPermission = autoApprove || this.permissionManager.evaluateModeTransition(
              this.modeState.current,
              modeRequest.mode,
            ).approved;

            if (evaluation.approved && approvedByPermission) {
              // Auto-approved - switch immediately
              const oldMode = this.modeState.current;
              this.modeState = transitionMode(this.modeState, modeRequest.mode, modeRequest.reason);
              this.permissionManager.setMode(modeRequest.mode);

              // Update tool executor mode
              if (toolExecutor.setMode) {
                toolExecutor.setMode(modeRequest.mode);
              }

              this.emit('mode_changed', {
                from: oldMode,
                to: modeRequest.mode,
                reason: modeRequest.reason,
                auto: true,
              });
            } else {
              // Requires confirmation
              this.emit('mode_change_requested', {
                from: this.modeState.current,
                to: modeRequest.mode,
                reason: modeRequest.reason,
                requiresConfirmation: evaluation.requiresConfirmation,
                message: evaluation.reason,
              });
            }
          }

          // Check for task completion
          const taskComplete = parseTaskComplete(block.text);
          if (taskComplete) {
            // Switch to review mode so the next user message starts in review context
            this.modeState = transitionMode(this.modeState, 'review', 'Task completed: ' + taskComplete.summary);
            this.permissionManager.setMode('review');
            this.emit('mode_changed', {
              from: this.modeState.previous,
              to: 'review',
              reason: 'Task completion reported',
              auto: true
            });

            // Update tool executor mode if applicable
            if (toolExecutor.setMode) {
              toolExecutor.setMode('review');
            }

            // Mark that the task completed so we break after displaying text.
            // Do NOT push a system user message — that would cause another
            // model call, generating an unwanted extra response.
            this.taskCompletedFlag = true;
          }

          // Check for plan ready signal (planner finished writing implementations.md)
          if (parsePlanReady(block.text)) {
            this.emit('plan_ready', {});
          }

          // Check for structured questions from plan mode
          const questions = parseQuestions(block.text);
          if (questions) {
            this.emit('questions', { questions });
            this.questionsPendingFlag = true;
          }
        }

        // Show text responses (only if not already streamed)
        if (!streamed) {
          for (const block of textBlocks) {
            const cleanText = ThinkTagFilter.strip(block.text);
            // Remove control tags from display output
            const displayText = stripQuestions(stripPlanReady(stripTaskComplete(stripModeRequests(cleanText))));
            if (displayText) {
              this.emit('response', { text: displayText, persona: response.persona });
            }
          }
        }

        // If TASK_COMPLETE was detected, break immediately even if there are
        // pending tool_use blocks (the model shouldn't mix them, but be safe).
        if (this.taskCompletedFlag) {
          this.emit('complete', {
            iterations: this.iterationCount,
            toolCalls: this.toolCallCount,
            filesChanged: this.filesChanged.size,
          });
          this.onAgentComplete().catch(() => { /* non-fatal */ });
          break;
        }

        // If questions were detected, pause the loop so the user can answer.
        // The chat UI will present the questions, collect answers, and then
        // call run() again with the user's answers injected as a message.
        if (this.questionsPendingFlag) {
          this.emit('complete', {
            iterations: this.iterationCount,
            toolCalls: this.toolCallCount,
            filesChanged: this.filesChanged.size,
          });
          break;
        }

        // If no tools, we're done (unless run-pr-style strict completion requires TASK_COMPLETE)
        if (toolUseBlocks.length === 0) {
          const hasTaskComplete = textBlocks.some((b) => parseTaskComplete(b.text) != null);
          const hasEvidence = this.hasRecentGroundedEvidence();
          if (this.shouldEnforceCompletionEvidence()) {
            // In balanced mode, skip the gate when the agent hasn't made any
            // tool calls — it just answered a question and the user can
            // always send another message. Only nudge when the agent did
            // work (toolCallCount > 0) but forgot to provide evidence.
            const needsTaskComplete =
              this.config.completionEvidenceMode === 'strict' || this.toolCallCount > 0;
            if (needsTaskComplete && ((!hasTaskComplete) || !hasEvidence)) {
              if (this.completionGateRetries >= EnhancedAgent.MAX_COMPLETION_GATE_RETRIES) {
                // Give up nudging — finalize to avoid infinite loop
                this.emit('warning', {
                  message: `Completion evidence gate gave up after ${this.completionGateRetries} nudges; finalizing anyway.`,
                });
              } else {
                const reason = !hasEvidence
                  ? 'no recent grounded evidence'
                  : 'missing [[TASK_COMPLETE | summary=...]]';
                this.completionGateRetries++;
                this.emit('warning', {
                  message: `Completion evidence gate blocked finalize: ${reason}.`,
                });
                this.messages.push({
                  role: 'user',
                  content:
                    '[SYSTEM] Completion gate: before finishing, provide grounded evidence from tool results/tests and then emit ' +
                    '[[TASK_COMPLETE | summary=<brief summary> | evidence=<paths/tests/tool proof>]]. Continue working until this is satisfied.',
                });
                continue;
              }
            }
          }
          if (
            this.config.strictTextOnlyCompletion &&
            this.iterationCount < this.config.maxIterations
          ) {
            if (!hasTaskComplete) {
              this.emit('warning', {
                message:
                  'Assistant returned no tool calls without [[TASK_COMPLETE | summary=...]]; nudging to continue.',
              });
              this.messages.push({
                role: 'user',
                content:
                  '[SYSTEM] You ended this turn without tool calls and without [[TASK_COMPLETE | summary=...]]. Continue using tools until the task is fully done (all files edited, checks run), or emit [[TASK_COMPLETE | summary=<brief summary>]] only when finished.',
              });
              continue;
            }
          }
          this.emit('complete', {
            iterations: this.iterationCount,
            toolCalls: this.toolCallCount,
            filesChanged: this.filesChanged.size,
          });

          // Fire hooks and memory extraction on completion
          this.onAgentComplete().catch(() => { /* non-fatal */ });
          break;
        }

        // Execute tools
        const toolResults = [];

        const updates = await this.toolOrchestrator.executeBatches(
          toolUseBlocks,
          async (toolUse, i) => this.executeSingleToolUse(toolExecutor, toolUse, i),
        );
        for (const update of updates) {
          const compactedResult = compactToolResultPayload(update.result);
          const payload =
            typeof compactedResult === 'string'
              ? compactedResult
              : JSON.stringify(compactedResult, null, 2);
          toolResults.push({
            type: 'tool_result' as const,
            tool_use_id: update.toolUse.id,
            content: payload,
            ...(update.success ? {} : { is_error: true as const }),
          });

          // PostToolUse hook
          if (this.hooksManager) {
            try {
              await this.hooksManager.execute('PostToolUse', {
                event: 'PostToolUse',
                toolName: update.toolUse.name,
                toolInput: update.toolUse.input as Record<string, unknown>,
                toolResult: payload,
              });
            } catch {
              /* non-fatal */
            }
          }
        }

        // Add injected messages if any exist
        if (this.injectedMessages.length > 0) {
          const combinedMsg = this.injectedMessages.join('\n');
          toolResults.push({
            type: 'text' as const,
            text: `[USER INTERRUPT/UPDATE]:\n${combinedMsg}`
          } as any);
          this.emit('warning', { message: `Injected ${this.injectedMessages.length} user message(s) into context.` });
          this.injectedMessages = [];
        }

        // Add results to conversation
        this.messages.push({
          role: 'user',
          content: toolResults,
        });

      } catch (error: any) {
        if (opts?.signal?.aborted || this.isAbortError(error)) {
          throw error;
        }
        this.emit('error', {
          message: 'API Error',
          error: error.message,
        });
        throw error;
      }
    }

    if (this.iterationCount >= this.config.maxIterations) {
      this.emit('warning', {
        message: `Reached maximum iterations (${this.config.maxIterations})`,
      });
    }
  }

  /**
   * Call the model with streaming (fallback to non-streaming).
   */
  private async executeSingleToolUse(
    toolExecutor: any,
    toolUse: ToolUseBlock,
    index: number,
  ): Promise<ToolExecutionUpdate> {
    this.toolCallCount++;

    const loopCheck = this.loopDetector.check(toolUse.name, toolUse.input);
    if (!loopCheck.allowed) {
      this.emit('warning', { message: loopCheck.reason });
      return {
        toolUse,
        index,
        result: `Error: ${loopCheck.reason}. Try a different approach.`,
        success: false,
      };
    }

    if (loopCheck.reason) {
      this.emit('warning', { message: loopCheck.reason });
    }

    this.emit('tool_call', {
      name: toolUse.name,
      input: toolUse.input,
      index: index + 1,
    });
    this.recordEvidence('tool_call', toolUse.name);

    // PreToolUse hook: allow/deny tool execution
    if (this.hooksManager) {
      try {
        const hookResult = await this.hooksManager.execute('PreToolUse', {
          event: 'PreToolUse',
          toolName: toolUse.name,
          toolInput: toolUse.input as Record<string, unknown>,
        });
        if (hookResult.decision === 'block') {
          this.emit('warning', { message: `PreToolUse hook blocked: ${hookResult.reason || 'no reason'}` });
          return {
            toolUse,
            index,
            result: `Blocked by PreToolUse hook: ${hookResult.reason || 'no reason provided'}`,
            success: false,
          };
        }
      } catch {
        /* non-fatal */
      }
    }

    // Permission rule check
    if (this.ruleManager) {
      try {
        const decision = this.ruleManager.toPermissionDecision(
          { toolName: toolUse.name, input: toolUse.input as Record<string, unknown> },
          this.permissionManager.getContext().permissionMode,
        );
        if (!decision.allowed && !decision.requiresApproval) {
          this.emit('warning', { message: `Permission rule denied: ${decision.reason}` });
          return {
            toolUse,
            index,
            result: `Denied by permission rule: ${decision.reason}`,
            success: false,
          };
        }
      } catch {
        /* non-fatal */
      }
    }

    try {
      let result = await toolExecutor.execute(toolUse.name, toolUse.input);

      if (['write_file', 'edit_file', 'edit_lines', 'verified_edit'].includes(toolUse.name)) {
        const input = toolUse.input as { path?: string };
        if (typeof input?.path === 'string') this.filesChanged.add(input.path);
      }

      const verification = await this.postEditVerify(toolExecutor, toolUse, result);
      if (!verification.ok) {
        const currentMessage =
          typeof result?.message === 'string' && result.message
            ? `${result.message}; ${verification.message}`
            : verification.message;
        if (result && typeof result === 'object') {
          result = { ...result, message: currentMessage, success: false, error: true, postVerify: verification.message };
        } else {
          result = { success: false, error: true, message: currentMessage, result };
        }
      } else if (result && typeof result === 'object') {
        result = { ...result, postVerify: verification.message };
      }

      const success = !result?.error && result?.success !== false;
      this.emit('tool_result', {
        name: toolUse.name,
        result,
        success,
      });
      this.recordEvidence(
        success ? 'tool_result_ok' : 'tool_result_error',
        `${toolUse.name}:${success ? 'ok' : 'error'}`,
      );
      if (this.sessionMemory) {
        const msg = typeof result === 'object' && result?.message != null ? String(result.message) : undefined;
        this.sessionMemory.recordAttempt(toolUse.name, success, msg);
      }

      return {
        toolUse,
        index,
        result,
        success,
      };
    } catch (error: any) {
      this.emit('error', {
        tool: toolUse.name,
        error: error.message,
      });
      return {
        toolUse,
        index,
        result: `Error: ${error.message}`,
        success: false,
      };
    }
  }

  /**
   * Call the model with streaming (fallback to non-streaming).
   */
  private async callModel(
    tools: Tool[],
    signal?: AbortSignal,
  ): Promise<{ message: any; streamed: boolean; persona?: { name: string; color: string } }> {
    // Route to provider-specific implementation
    // Check if the provider uses the Anthropic format or OpenAI format
    let isAnthropicFormat = false;
    const rf = this.config.requestFormat ?? 'auto';
    if (rf === 'openai') {
      isAnthropicFormat = false;
    } else if (rf === 'anthropic') {
      isAnthropicFormat = true;
    } else if (this.provider !== 'custom') {
      isAnthropicFormat =
        PROVIDER_CONFIGS[this.provider as keyof typeof PROVIDER_CONFIGS]?.format ===
        'anthropic';
    } else {
      isAnthropicFormat = this.config.customProviderFormat === 'anthropic';
    }

    // If it's NOT Anthropic format, use the OpenAI-compatible client
    if (!isAnthropicFormat) {
      const result = await this.callOpenAI(tools, signal);
      const currentModeConfig = MODE_CONFIG[this.modeState.current];
      const persona = {
        name: currentModeConfig.personaName,
        color: currentModeConfig.displayColor,
      };
      return { ...result, persona };
    }

    const params: any = {
      model: this.getModelForTier(),
      max_tokens: 8192,
      messages: this.messages,
      system: this.getSystemPrompt(),
    };

    if (tools.length > 0) {
      params.tools = tools;
    }

    // ── Try streaming first ──
    try {
      if (typeof this.client.messages.stream !== 'function') {
        throw new Error('Streaming not available');
      }

      this.thinkFilter.reset();
      let hasEmittedStart = false;

      const currentModeConfig = MODE_CONFIG[this.modeState.current];
      const persona = {
        name: currentModeConfig.personaName,
        color: currentModeConfig.displayColor,
      };

      const stream = this.client.messages.stream(params);

      stream.on('text', (chunk: string) => {
        const filtered = this.thinkFilter.push(chunk);
        if (filtered) {
          if (!hasEmittedStart) {
            this.emit('stream_start', { persona });
            hasEmittedStart = true;
          }
          this.emit('stream_text', { text: filtered });
        }
      });

      const message = await stream.finalMessage();

      // Flush remaining buffered text
      const remaining = this.thinkFilter.flush();
      if (remaining) {
        if (!hasEmittedStart) {
          this.emit('stream_start', {});
          hasEmittedStart = true;
        }
        this.emit('stream_text', { text: remaining });
      }

      if (hasEmittedStart) {
        this.emit('stream_end', {});
      }

      return { message, streamed: hasEmittedStart };
    } catch (_streamError) {
      // ── Fallback to non-streaming ──
      try {
        const message = await this.client.messages.create(params);
        const currentModeConfig = MODE_CONFIG[this.modeState.current];
        const persona = {
          name: currentModeConfig.personaName,
          color: currentModeConfig.displayColor,
        };
        return { message, streamed: false, persona };
      } catch (error: any) {
        throw error;
      }
    }
  }

  /**
   * Map Anthropic-format tools to OpenAI chat completions tools format.
   */
  private mapToolsToOpenAI(tools: Tool[]): Array<{ type: 'function'; function: { name: string; description: string; parameters: object } }> {
    return tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description ?? '',
        parameters: t.input_schema ?? { type: 'object', properties: {} },
      },
    }));
  }

  /**
   * Build OpenAI-format messages from internal Anthropic-style history (including tool_calls and tool results).
   */
  private buildOpenAIMessages(): Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content?: any;
    tool_call_id?: string;
    tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  }> {
    const out: Array<{
      role: 'system' | 'user' | 'assistant' | 'tool';
      content?: any;
      tool_call_id?: string;
      tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
    }> = [];

    out.push({ role: 'system', content: this.getSystemPrompt() });

    for (const msg of this.messages) {
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          out.push({ role: 'user', content: msg.content });
        } else if (Array.isArray(msg.content)) {
          const arr = msg.content as ContentBlock[];
          const toolResults = arr.filter((b: any) => b.type === 'tool_result');
          if (toolResults.length > 0) {
            for (const tr of toolResults) {
              const raw =
                typeof (tr as any).content === 'string'
                  ? (tr as any).content
                  : JSON.stringify((tr as any).content);
              const failed = (tr as any).is_error === true;
              out.push({
                role: 'tool',
                tool_call_id: (tr as any).tool_use_id,
                content: failed ? `Tool failed: ${raw}` : raw,
              });
            }
          } else {
            const textBlocks = arr.filter((b: any) => b.type === 'text') as TextBlock[];
            const text = textBlocks.map((b) => b.text).join('\n');
            const imageBlocks = arr.filter((b: any) => b.type === 'image_url');
            if (imageBlocks.length > 0) {
              const parts: any[] = [];
              if (text) parts.push({ type: 'text', text });
              for (const ib of imageBlocks) parts.push(ib);
              out.push({ role: 'user', content: parts });
            } else if (text) {
              out.push({ role: 'user', content: text });
            }
          }
        }
        continue;
      }

      if (msg.role === 'assistant') {
        const blocks = (Array.isArray(msg.content) ? msg.content : []) as ContentBlock[];
        const textBlocks = blocks.filter((b): b is TextBlock => b.type === 'text');
        const toolUseBlocks = blocks.filter((b): b is ToolUseBlock => b.type === 'tool_use');
        const contentText = textBlocks.map((b) => b.text).join('\n').trim();
        const toolCalls =
          toolUseBlocks.length > 0
            ? toolUseBlocks.map((b) => ({
              id: b.id,
              type: 'function' as const,
              function: { name: b.name, arguments: typeof b.input === 'string' ? b.input : JSON.stringify(b.input ?? {}) },
            }))
            : undefined;

        const assistantMsg: { role: 'assistant'; content: string; tool_calls?: typeof toolCalls } = {
          role: 'assistant',
          content: contentText || '',
        };
        if (toolCalls && toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
        out.push(assistantMsg);
      }
    }

    return out;
  }

  /**
   * Call an OpenAI-compatible chat completions endpoint.
   * Uses streaming (SSE) when available, with a non-streaming fallback.
   * Supports tools: sends them when provided and normalizes tool_calls in the response to Anthropic-style content blocks.
   */
  /**
   * OpenAI-compatible chat completions URL. Only appends `/chat/completions` to the
   * configured base — do not inject an extra `/v1` segment (base URL must already
   * include any API version prefix the user expects).
   */
  private buildOpenAIChatCompletionsUrl(): string {
    let base = this.config.baseUrl;
    if (!base && this.provider && this.provider !== 'custom' && PROVIDER_CONFIGS[this.provider as keyof typeof PROVIDER_CONFIGS]) {
      base = PROVIDER_CONFIGS[this.provider as keyof typeof PROVIDER_CONFIGS].baseUrl;
    }
    base = (base || 'https://api.openai.com/v1').replace(/\/+$/, '');
    if (/\/chat\/completions$/i.test(base)) {
      return base;
    }
    return `${base}/chat/completions`;
  }

  private async callOpenAI(
    tools: Tool[],
    signal?: AbortSignal,
  ): Promise<{ message: any; streamed: boolean; persona?: { name: string; color: string } }> {
    if (!this.config.apiKey) {
      // Try to get from specifics if generic is missing, though ConfigManager should have handled this
      // strict check might remain here
      // throw new Error('API key is required for OpenAI-compatible provider');
    }

    const url = this.buildOpenAIChatCompletionsUrl();

    const openAiMessages = this.buildOpenAIMessages();

    const baseBody: any = {
      model: this.getModelForTier(),
      messages: openAiMessages,
      max_tokens: 16000,
    };
    if (tools.length > 0) {
      baseBody.tools = this.mapToolsToOpenAI(tools);
    }

    const isAbortError = (err: unknown): boolean => {
      if (!err || typeof err !== 'object') return false;
      const anyErr = err as any;
      return (
        anyErr.name === 'AbortError' ||
        anyErr.type === 'aborted' ||
        String(anyErr.message || '').toLowerCase().includes('aborted')
      );
    };

    // Track abort state to handle errors during streaming
    let streamAborted = false;
    let abortHandler: (() => void) | undefined;
    // Inactivity timer declared here so it's accessible in the catch cleanup
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

    // ── Try streaming first (SSE) ─────────────────────────
    try {
      const streamResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({ ...baseBody, stream: true }),
        signal,
      });

      if (!streamResponse.ok || !streamResponse.body) {
        let errorMsg = `OpenAI-compatible streaming error: ${streamResponse.status}`;
        try {
          const text = await streamResponse.text();
          try {
            const data = JSON.parse(text);
            if (data.error && data.error.message) {
              errorMsg = `API Error: ${data.error.message}`;
            } else {
              errorMsg = `API Error: ${text}`;
            }
          } catch {
            errorMsg = `API Error: ${text}`;
          }
        } catch {
          // ignore body read error
        }
        const error = new Error(errorMsg);
        // Attach status for retry classification
        (error as any).status = streamResponse.status;
        throw error;
      }

      const body = streamResponse.body;
      if (!body) {
        throw new Error('Streaming body not available');
      }

      // Set up abort handler to track abort state
      abortHandler = () => {
        streamAborted = true;
        // node-fetch returns a Node.js Readable stream which has destroy()
        // TypeScript types don't include destroy(), but it exists at runtime
        (body as any).destroy();
      };
      signal?.addEventListener('abort', abortHandler);

      // When the user cancels (Esc), node-fetch aborts the Readable stream and emits an
      // 'error' event. If no listener is attached, Node treats it as unhandled and crashes.
      // Instead of re-throwing (which doesn't propagate from event handlers), we store the
      // error and check it in the for-await loop, then destroy the stream to break the loop.
      let streamBodyError: unknown = null;
      body.on('error', (err: unknown) => {
        if (isAbortError(err) || signal?.aborted || streamAborted) return;
        streamBodyError = err;
        (body as any).destroy();
      });

      let fullText = '';
      const toolCallsAccum: Array<{ id: string; name: string; arguments: string; index: number }> = [];
      let hasEmittedStart = false;
      let buffer = '';

      // Inactivity timeout: if no SSE chunk arrives for 120s, consider the connection dead.
      // This prevents hanging forever when a provider silently drops the connection.
      const STREAM_INACTIVITY_MS = 120_000;
      let lastChunkAt = Date.now();
      inactivityTimer = setTimeout(() => {
        if (!streamAborted && !signal?.aborted) {
          (body as any).destroy(new Error(`Stream inactivity timeout: no data for ${STREAM_INACTIVITY_MS / 1000}s`));
        }
      }, STREAM_INACTIVITY_MS);

      const resetInactivityTimer = () => {
        lastChunkAt = Date.now();
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          if (!streamAborted && !signal?.aborted) {
            (body as any).destroy(new Error(`Stream inactivity timeout: no data for ${STREAM_INACTIVITY_MS / 1000}s`));
          }
        }, STREAM_INACTIVITY_MS);
      };

      const textDecoder = new TextDecoder();

      for await (const value of body) {
        resetInactivityTimer();
        buffer += typeof value === 'string' ? value : textDecoder.decode(value as Uint8Array, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice('data:'.length).trim();
          if (dataStr === '[DONE]') {
            buffer = '';
            break;
          }

          try {
            const json = JSON.parse(dataStr);
            const delta = json.choices?.[0]?.delta;
            let chunkText = '';

            if (typeof delta?.content === 'string') {
              chunkText = delta.content;
            } else if (Array.isArray(delta?.content)) {
              chunkText = delta.content
                .filter((c: any) => c.type === 'text' && typeof c.text === 'string')
                .map((c: any) => c.text)
                .join('');
            }

            if (chunkText) {
              fullText += chunkText;
              if (!hasEmittedStart) {
                const currentModeConfig = MODE_CONFIG[this.modeState.current];
                const persona = {
                  name: currentModeConfig.personaName,
                  color: currentModeConfig.displayColor,
                };
                this.emit('stream_start', { persona });
                hasEmittedStart = true;
              }
              this.emit('stream_text', { text: chunkText });
            }

            // Accumulate streaming tool_calls (OpenAI sends by index with optional id/name/arguments per chunk)
            const dToolCalls = delta?.tool_calls;
            if (Array.isArray(dToolCalls)) {
              for (const tc of dToolCalls) {
                const idx = tc.index ?? 0;
                while (toolCallsAccum.length <= idx) {
                  toolCallsAccum.push({ id: '', name: '', arguments: '', index: toolCallsAccum.length });
                }
                const acc = toolCallsAccum[idx];
                if (tc.id != null) acc.id = tc.id;
                if (tc.function?.name != null) acc.name = tc.function.name;
                if (tc.function?.arguments != null) acc.arguments += tc.function.arguments;
              }
            }
          } catch {
            // Ignore malformed SSE lines
          }
        }
      }

      if (hasEmittedStart) {
        this.emit('stream_end', {});
      }

      // Clean up inactivity timer
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }

      // If the stream body emitted a non-abort error, surface it now
      // (throwing inside the 'error' handler doesn't propagate to for-await).
      if (streamBodyError) {
        throw streamBodyError;
      }

      const content: ContentBlock[] = [];
      if (fullText) content.push({ type: 'text', text: fullText } as TextBlock);
      for (const tc of toolCallsAccum) {
        if (tc.id || tc.name || tc.arguments) {
          let input: object;
          try {
            input = tc.arguments ? JSON.parse(tc.arguments) : {};
          } catch {
            input = { raw: tc.arguments };
          }
          content.push({
            type: 'tool_use',
            id: tc.id || `call_${content.length}`,
            name: tc.name || 'unknown',
            input,
          } as ToolUseBlock);
        }
      }

      // Clean up abort listener on successful completion
      if (abortHandler) signal?.removeEventListener('abort', abortHandler);

      const message = { content: content.length ? content : [{ type: 'text', text: '' } as TextBlock] };
      return { message, streamed: hasEmittedStart };
    } catch (_streamError) {
      // Clean up inactivity timer on error
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
      // Clean up abort listener on error
      if (abortHandler) signal?.removeEventListener('abort', abortHandler);

      // If the request was cancelled, do not fall back to non-streaming — just bubble up
      // the abort so the UI can render "Cancelled." without crashing.
      if (signal?.aborted || isAbortError(_streamError) || streamAborted) {
        throw _streamError;
      }

      // For retryable errors (network, timeout, 5xx), throw so the outer retry loop
      // in run() can re-attempt with exponential backoff — don't fall back to
      // non-streaming for these, as the issue is transient.
      if (isRetryableError(_streamError)) {
        throw _streamError;
      }

      // ── Fallback to non-streaming for non-retryable streaming errors ──
      // (e.g. the provider simply doesn't support SSE, or returned a non-streamable error)
      let response: any;
      try {
        // Add a 120s timeout for the non-streaming request too
        const nonStreamController = new AbortController();
        const nonStreamTimeout = setTimeout(() => {
          nonStreamController.abort();
        }, 120_000);
        // Also forward the parent signal if the user cancels
        const parentAbortHandler = () => nonStreamController.abort();
        signal?.addEventListener('abort', parentAbortHandler);

        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify(baseBody),
            signal: nonStreamController.signal,
          });
        } finally {
          clearTimeout(nonStreamTimeout);
          signal?.removeEventListener('abort', parentAbortHandler);
        }
      } catch (err: unknown) {
        if (signal?.aborted || isAbortError(err)) throw err;
        throw err;
      }

      if (!response.ok) {
        const text = await response.text();
        const error = new Error(`OpenAI-compatible API error: ${response.status} ${text}`);
        // Attach status for retry classification
        (error as any).status = response.status;
        throw error;
      }

      const data: any = await response.json();
      const msg = data?.choices?.[0]?.message ?? {};
      const rawContent = msg.content ?? '';
      const rawToolCalls = msg.tool_calls ?? [];

      const content: ContentBlock[] = [];
      const text = typeof rawContent === 'string' ? rawContent : (Array.isArray(rawContent) ? rawContent.map((c: any) => c.text ?? '').join('') : '');
      if (text) content.push({ type: 'text', text } as TextBlock);
      for (const tc of rawToolCalls) {
        const fn = tc.function ?? {};
        let input: object;
        try {
          input = typeof fn.arguments === 'string' && fn.arguments ? JSON.parse(fn.arguments) : {};
        } catch {
          input = { raw: fn.arguments };
        }
        content.push({
          type: 'tool_use',
          id: tc.id ?? `call_${content.length}`,
          name: fn.name ?? 'unknown',
          input,
        } as ToolUseBlock);
      }
      if (content.length === 0) content.push({ type: 'text', text: '' } as TextBlock);

      const message = { content };
      return { message, streamed: false };
    }
  }



  private getSystemPrompt(): string {
    // AX-lite strategic tier: plan only, no tools
    if (this.currentTier === 'strategic') {
      return `You are XibeCode in STRATEGIC PLANNING mode. Given the user's task below, output a concise high-level plan only:
- Main steps in order (numbered or bullet list)
- Key files or areas of the codebase if you can infer them
- Dependencies between steps if any

Do not use any tools. Do not write code. Output only the plan text.`;
    }

    const platform = process.platform;
    const platformNote = platform === 'win32'
      ? 'You are running on Windows. Use PowerShell commands and Windows path conventions.'
      : platform === 'darwin'
        ? 'You are running on macOS. Use Unix/bash commands.'
        : 'You are running on Linux. Use bash commands.';

    return `You are XibeCode, an expert autonomous coding assistant with advanced capabilities.

${platformNote}

Working directory: ${process.cwd()}

## Repository root and paths

- The canonical project root is the **Working directory** above. For \`read_file\`, \`write_file\`, \`edit_file\`, \`edit_lines\`, \`verified_edit\`, and \`list_directory\`, pass paths **relative to that root** (e.g. \`src/index.ts\`, \`package.json\`).
- Do **not** assume the repo lives at \`/workspace\`, \`/app\`, \`/project\`, or similar unless that path is literally the printed working directory.
- For \`run_command\`, omit \`cwd\` or set it to \`.\` so commands run in the project root unless you intentionally use a subdirectory.

${this.defaultSkillsPrompt ? `${this.defaultSkillsPrompt}\n\n` : ''}
## Core Principles

1. **NO HALLUCINATIONS**: NEVER guess file paths, function names, or codebase structure. ALWAYS use \`list_files\`, \`search_files\`, or \`grep_code\` before making assumptions.
2. **Read Before Edit**: ALWAYS read files with \`read_file\` before modifying them. Never edit a file blindly.
3. **Use Verified Editing**: ALWAYS prefer \`verified_edit\` as your PRIMARY file editing tool. It requires old_content verification which prevents mistakes. Only fall back to \`edit_file\` or \`edit_lines\` if \`verified_edit\` fails.
4. **Context Awareness**: Use \`get_context\` to understand project structure before making changes.
5. **Incremental Changes**: Make small, tested changes rather than large rewrites.
6. **Error Recovery & Loop Avoidance**: If a tool fails, DO NOT call it again with the same parameters. Analyze the error, verify your assumptions (using read/search tools), and try a COMPLETELY different approach.
7. **Web Research**: Use \`web_search\` and \`fetch_url\` when you need documentation, error solutions, or up-to-date info.
8. **Remember Important Things**: Use \`update_memory\` to save project knowledge for future sessions.${this.autoMemoryMarkdownSection ? `

The following markdown memories were selected for this session (keyword-ranked; verify critical facts):

${this.autoMemoryMarkdownSection}` : ''}
9. **Mode Switching**: When you need to perform actions blocked by your current mode (e.g. review mode blocks writes), use \`[[REQUEST_MODE: agent | reason=need write access to complete user task]]\` to switch. The system will auto-approve mode changes needed to complete the user's request.
10. **Lifecycle Awareness**: The system supports hooks that run before/after tool use and session events. If a hook modifies your input or blocks a tool call, respect its decision and adapt accordingly.
11. **Permission Rules**: The user may have configured allow/deny/ask rules for specific tools. If a tool call is denied by a permission rule, do not retry it — ask the user or find an alternative approach.

${this.activeSkill ? `## Active Skill: ${this.activeSkill.name}

${this.activeSkill.instructions}

---
` : ''}
9. **Think Systematically**: Decompose complex problems, form hypotheses, and validate assumptions.
10. **Consider Impact**: Analyze how changes affect related code and downstream dependencies.

## Advanced Reasoning and Problem-Solving

### Systematic Problem Decomposition
When facing complex tasks:
1. Break down into smaller, independent, testable components
2. Identify the core problem vs. symptoms
3. Map dependencies between subtasks
4. Tackle foundational pieces first
5. Build incrementally and validate at each step

### Hypothesis-Driven Development
For unfamiliar code or bugs:
1. Form a hypothesis about the cause or solution
2. Design a minimal test to validate the hypothesis
3. Execute and observe results
4. Refine hypothesis based on evidence
5. Iterate until you find the root cause

### Root Cause Analysis
Don't just fix symptoms:
- Ask "why" repeatedly to trace issues to their source
- Check error messages, stack traces, and logs for clues
- Review recent changes (git_changed_files) that might be related
- Understand the flow of data and control through the system
- Fix the underlying cause, not just the manifestation

### Pattern Recognition
Identify and apply common patterns:
- **Design Patterns**: Factory, Strategy, Observer, Singleton, etc.
- **Anti-Patterns**: God objects, tight coupling, circular dependencies
- **Architectural Patterns**: MVC, layered architecture, microservices
- **Code Smells**: Long methods, duplicate code, large classes
- Follow existing patterns in the codebase for consistency

### Trade-off Analysis
Before implementing, consider:
- **Performance vs. Readability**: Optimize only when necessary
- **Flexibility vs. Simplicity**: Don't over-engineer for unlikely futures
- **Speed vs. Quality**: Balance quick iterations with robust code
- **Abstraction Level**: Too abstract is hard to understand, too concrete is hard to maintain
- Document significant trade-offs in comments or commit messages

## Advanced Context Awareness

### Project Structure Understanding
Before making changes:
1. Use get_context to map the project structure
2. Identify entry points (main files, index files, etc.)
3. Understand data flow from input to output
4. Map dependencies between modules/packages
5. Note configuration files and their purposes

### Change Impact Analysis
Consider the ripple effects:
- **Direct Impact**: Files you're modifying
- **Immediate Dependencies**: Files that import modified code
- **Transitive Dependencies**: Files that depend on immediate dependencies
- **External Contracts**: APIs, schemas, interfaces exposed to users
- **Data Structures**: Changes to data models affect all consumers
- Run tests to catch unexpected breakage

### Codebase Pattern Following
Maintain consistency:
- **Naming Conventions**: Follow existing variable/function naming
- **File Organization**: Put new files where similar files exist
- **Code Style**: Match indentation, formatting, comment style
- **Error Handling**: Use the same error patterns as existing code
- **Testing Patterns**: Follow existing test structure and conventions

### Historical Context via Git
Use git to understand intent:
- Check get_git_status to see current state
- Review get_git_diff_summary to see recent changes
- Look at commit messages for why code exists
- Identify files that change together frequently
- Respect design decisions documented in history

### Cross-File Dependency Tracking
Map relationships:
- Track imports and exports across files
- Identify shared types/interfaces
- Note circular dependencies (avoid creating new ones)
- Understand module boundaries and interfaces
- Keep coupling loose, cohesion high

## Tool Usage

- **IMPORTANT**: Always provide all required parameters as documented
- For read_file: always include "path" as a string
- For read_multiple_files: always include "paths" as an array of strings
- For write_file: always include "path" and "content"
- For verified_edit: always include "path", "start_line", "end_line", "old_content", and "new_content"
- For edit_file: always include "path", "search", and "replace"
- For run_command: always include "command" as a string

## File Editing Best Practices

- **DEFAULT (use first)**: Use verified_edit — read the file first with read_file to get line numbers, then provide start_line, end_line, old_content (copied from what you read), and new_content. This is the SAFEST and MOST RELIABLE method because it verifies old content matches before editing. If the content doesn't match, it returns the actual content so you can retry.
- **Fallback for small edits**: If verified_edit fails, use edit_file with unique search strings
- **Fallback for large files**: If line numbers shift, use edit_lines with specific line numbers
- **For new files**: Use write_file
- **Always verify**: Read the file after editing to confirm changes

### Verified Edit Workflow (PREFERRED)
1. read_file to see current content and line numbers
2. Identify the lines to change
3. Use verified_edit with old_content copied EXACTLY from what you read
4. If verification fails, re-read the file and retry with correct content

## Codebase Search

- Use \`grep_code\` to search for patterns across the codebase (uses ripgrep, falls back to grep)
- Faster than reading files one by one — find usages, imports, function calls, error strings
- Supports file pattern filtering: \`file_pattern: "*.ts"\` to search only TypeScript files
- Use \`ignore_case: true\` for case-insensitive searches

## Web Search & URL Fetching

- Use \`web_search\` to search the web via DuckDuckGo (free, no API key needed)
- Use \`fetch_url\` to read any URL — docs, APIs, blog posts (HTML is auto-stripped to text)
- Useful for: looking up library docs, resolving error messages, finding solutions
- Always use \`web_search\` when you encounter an unfamiliar error or need current documentation

## Skills & MCP Integration

- **Bundled defaults**: ${this.defaultSkillsPrompt ? 'The **Default bundled skills** section (above) lists skills **chosen for this run** from your task wording and repo `package.json` when available — follow the relevant subsections.' : 'No bundled skill block was loaded for this run; use skills.sh or `.xibecode/skills` for extra guidance.'}
- Use \`search_skills_sh\` to discover extra domain-specific skills (frameworks, libraries, testing, performance, etc.)
- When you find a relevant skill, use \`install_skill_from_skills_sh\` with its \`skill_id\` to download it into the project
- After installing a skill, use \`read_file\` to open the new markdown file under \`.xibecode/skills\` and follow its instructions as additional guidance for the current task
- Use \`get_mcp_status\` to inspect available MCP servers, tools, and resources, and prefer those specialized tools when they match the task (e.g., browsers, databases, external APIs)

## Project Memory

- Use \`update_memory\` to save important project info to .xibecode/memory.md
- Memory persists across sessions — the AI loads it automatically on startup
- Good things to remember: coding conventions, architecture decisions, common commands, gotchas
- Append by default (\`append: true\`), or replace with \`append: false\`

## Running Commands

- Commands have a default timeout of 120 seconds.
- **CRITICAL**: ALWAYS use non-interactive flags to avoid prompts that hang:
  - npm/npx: use --yes or -y (e.g. \`npx create-next-app@latest myapp --yes --typescript --tailwind --app --use-pnpm\`)
  - pip: use --yes or -y
  - apt: use -y
  - General: look for --default, --non-interactive, --batch, --quiet flags
- If a command MUST be interactive, use the "input" parameter to pipe stdin answers.
  Example: \`{"command": "npx some-cli", "input": "yes\\nmy-project\\n"}\`
  Each \\n sends Enter. So "yes\\n\\n" sends "yes" + Enter + Enter.
- For long-running commands (installs, builds), increase timeout: \`{"command": "npm install", "timeout": 300}\`
- If a command times out, it was probably waiting for interactive input. Retry with --yes flags or input parameter.

## Test Integration

- Use \`run_tests\` to execute project tests automatically (detects Vitest, Jest, pytest, Go test, etc.)
- Always run tests after making changes to validate correctness
- If tests fail, use \`get_test_status\` to get detailed failure information
- Package manager priority: pnpm > bun > npm (as preferred by this project)

## Git Integration

- Use \`get_git_status\` to check repository state before making large changes
- Use \`get_git_changed_files\` to see what files have been modified
- Use \`create_git_checkpoint\` before risky refactors (creates a safe restore point)
- Use \`revert_to_git_checkpoint\` to undo changes if something goes wrong (requires confirm: true)
- Use \`get_git_diff_summary\` to see a summary of changes with line counts

## Advanced Coding Patterns and Best Practices

### SOLID Principles
Apply these principles to write maintainable code:
- **Single Responsibility**: Each class/function does one thing well
- **Open/Closed**: Open for extension, closed for modification
- **Liskov Substitution**: Subtypes must be substitutable for base types
- **Interface Segregation**: Many specific interfaces > one general interface
- **Dependency Inversion**: Depend on abstractions, not concrete implementations

### Design Patterns Recognition
Know when to apply patterns:
- **Creational**: Factory (object creation), Singleton (one instance), Builder (complex objects)
- **Structural**: Adapter (interface compatibility), Decorator (add behavior), Facade (simplify interface)
- **Behavioral**: Strategy (swap algorithms), Observer (event notifications), Command (encapsulate requests)
- Don't force patterns - use them when they solve real problems

### Error Handling Patterns
Structure error handling properly:
- **Try-Catch Boundaries**: Wrap risky operations, catch specific errors
- **Error Context**: Include helpful context in error messages
- **Graceful Degradation**: Provide fallback functionality when possible
- **Error Propagation**: Re-throw with context, or handle and log
- **Validation**: Validate inputs early and explicitly

### Performance Optimization
Optimize when measurements justify it:
- **Profile First**: Don't optimize without profiling
- **Data Structures**: Choose right structure (Map vs Object, Set vs Array, etc.)
- **Algorithmic Complexity**: Prefer O(log n) or O(n) over O(n²) when possible
- **Lazy Loading**: Load resources only when needed
- **Caching**: Cache expensive computations, but invalidate appropriately
- **Async Operations**: Use Promise.all() for parallel operations

### Security Best Practices
Write secure code by default:
- **Input Validation**: Validate and sanitize all user inputs
- **SQL Injection**: Use parameterized queries, never string concatenation
- **XSS Prevention**: Escape output, use Content Security Policy
- **Authentication**: Hash passwords (bcrypt, argon2), use secure session management
- **Authorization**: Check permissions before operations
- **Secrets**: Never commit credentials, use environment variables

### Testing Strategies
Build confidence through tests:
- **Unit Tests**: Test individual functions/classes in isolation
- **Integration Tests**: Test component interactions
- **Test Coverage**: Aim for high coverage, but focus on critical paths
- **Mocking**: Mock external dependencies (APIs, databases, file system)
- **Test Organization**: Group related tests, use descriptive names
- **TDD**: For complex logic, write tests first

## Multi-Step Task Planning

### Task Breakdown Framework
For large tasks, plan systematically:

1. **Understand Requirements**
   - Clarify ambiguous requirements
   - Identify success criteria
   - Note constraints and non-functional requirements

2. **Design Phase**
   - Choose appropriate architecture
   - Design data models and schemas
   - Plan API/interface contracts
   - Consider scalability and maintainability

3. **Implementation Order**
   - Start with foundational components (data models, utilities)
   - Build core business logic
   - Add integration layers
   - Implement UI/API endpoints last
   - Create tests alongside code

4. **Validation Milestones**
   - Define checkpoints where you validate progress
   - Run tests at each milestone
   - Create git checkpoints before risky changes
   - Demo/verify functionality incrementally

5. **Rollback Planning**
   - Document how to undo changes if needed
   - Keep checkpoint references
   - Note what to test after rollback

### Dependency Mapping
Understand what depends on what:
- Create mental map of module dependencies
- Identify circular dependencies (avoid them)
- Plan bottom-up: build dependencies before dependents
- Consider build order and initialization sequence

### Progress Reporting
Keep stakeholders informed:
- Report completion of each major step
- Surface blockers or questions early
- Summarize what changed and why
- Note any deviations from original plan

## Enhanced Error Handling

### Error Classification
Categorize errors appropriately:
- **Transient Errors**: Network timeouts, temporary file locks - retry with backoff
- **Permanent Errors**: Invalid syntax, type errors - fix the code
- **User Errors**: Missing config, invalid input - guide user to fix
- **Environment Errors**: Missing dependencies, permissions - provide installation/fix steps

### Retry Strategies
When to retry and how:
- **Network Operations**: Retry with exponential backoff (1s, 2s, 4s, max 3 retries)
- **File Operations**: Retry briefly for locks, fail fast for permissions
- **API Calls**: Respect rate limits, retry on 429/503, fail on 400/401/404
- **Commands**: Don't retry if exit code indicates permanent failure

### Alternative Approaches
Have backup plans:
- If verified_edit fails (content mismatch), re-read the file and retry with correct old_content
- If verified_edit still fails, try edit_file with a unique search string
- If edit_file fails (ambiguous search), try edit_lines with line numbers
- If run_command times out, try with shorter timeout or different approach
- If tests fail, try running subset of tests to isolate issue
- If git checkpoint fails, explain why and suggest manual backup

### Error Recovery Workflows
Systematic approach to recovery:

1. **Analyze**: Read error message completely, identify error type
2. **Diagnose**: Check stack trace, review recent changes, read related files
3. **Hypothesis**: Form theory about what went wrong
4. **Test**: Try minimal fix to validate hypothesis
5. **Verify**: Run tests to confirm fix works
6. **Prevent**: Add tests or validation to prevent recurrence

### Debugging Systematic Approach
When stuck on a bug:
1. **Reproduce**: Create reliable reproduction steps
2. **Isolate**: Narrow down to smallest failing example
3. **Inspect**: Add logging, check variable states, trace execution
4. **Compare**: What's different between working and failing cases?
5. **Fix**: Apply minimal change to resolve
6. **Test**: Verify fix with tests
7. **Refactor**: Clean up any debugging code added

## MCP (Model Context Protocol) Integration

XibeCode can connect to external MCP servers to extend capabilities beyond built-in tools:

### MCP Tools
- External MCP servers may expose additional tools (e.g., database access, web scraping, specialized APIs)
- MCP tools are discovered automatically and integrated with built-in tools
- Use MCP tools when they provide capabilities not available in built-in tools
- Tool names from MCP servers are prefixed with the server name (e.g., \`filesystem::read_file\`, \`github::create_issue\`)

### MCP Resources
- Access external resources like files, databases, API data through MCP servers
- Resources are read-only by default
- Use resources to gather context or data for your tasks

### MCP Prompts
- MCP servers may provide prompt templates for common workflows
- These prompts can guide you through complex multi-step operations
- Leverage MCP prompts when available for standardized tasks

### Checking MCP Status
- Use \`get_mcp_status\` tool to see which MCP servers are configured and connected
- This shows available tools, resources, and prompts from each server
- Check MCP status when you need to know what external capabilities are available

### Configuration
- MCP servers are configured in \`~/.xibecode/mcp-servers.json\` file
- Servers are connected on-demand when the user requests MCP usage (for example by running \`/mcp\` in chat or calling an MCP tool)

## Best Practices

1. **Before major refactors**: Create a git checkpoint with \`create_git_checkpoint\`
2. **After code changes**: Run tests with \`run_tests\` to verify correctness  
3. **For bug fixes**: Check git status and focus on changed files
4. **Test-driven workflow**: Run tests → fix failures → run tests again
5. **Read existing code**: Understand patterns before adding new code
6. **Progressive enhancement**: Start with working code, improve incrementally
7. **Documentation**: Update docs when changing behavior
8. **Clean commits**: Group related changes, write clear commit messages
9. **Leverage MCP tools**: Use external tools when they provide better solutions

## Final Summary

When you complete the task, provide a comprehensive summary including:
- What was accomplished (specific files and changes)
- Any trade-offs or design decisions made
- Potential improvements or follow-up tasks
- Test results and validation performed
- If you used tools, finish with [[TASK_COMPLETE | summary=<brief summary> | evidence=<tool/test proof>]] only when work is actually complete.

${this.sessionMemory ? this.sessionMemory.getSummary() : ''}
${this.mindsetAdaptive ? `\n## Current reasoning mindset: ${this.currentMindset.toUpperCase()}\n${this.currentMindset === 'convergent' ? 'Focus on one solution; narrow options and commit. Use [[SET_MINDSET: divergent]] to explore alternatives, or [[SET_MINDSET: algorithmic]] for step-by-step.' : this.currentMindset === 'divergent' ? 'Explore alternatives; brainstorm. Use [[SET_MINDSET: convergent]] to narrow, or [[SET_MINDSET: algorithmic]] for step-by-step.' : 'Reason step-by-step; formal. Use [[SET_MINDSET: convergent]] to commit, or [[SET_MINDSET: divergent]] to explore.'}\n` : ''}
${this.contextHintFiles.length > 0 ? `\n## Suggested relevant files for this task\nPrioritize these when using get_context or read_file:\n${this.contextHintFiles.slice(0, 50).map(f => `- ${f}`).join('\n')}\n` : ''}
${MODE_CONFIG[this.modeState.current].promptSuffix}`;
  }

  /**
   * Stream agent events as an async generator.
   *
   * Provides a typed, ergonomic alternative to the EventEmitter-based
   * `on('event', ...)` pattern. Use with `for await`:
   *
   * ```ts
   * for await (const event of agent.stream(prompt, tools, executor)) {
   *   if (event.type === 'text_delta') process.stdout.write(event.text);
   *   if (event.type === 'complete') break;
   * }
   * ```
   *
   * Internally delegates to `run()` and translates the internal
   * `AgentEvent` emissions into typed `StreamEvent` objects.
   */
  async *stream(
    prompt: string,
    tools: Tool[],
    toolExecutor: any,
    opts?: StreamOptions,
  ): AsyncGenerator<StreamEvent, void, undefined> {
    const pending: StreamEvent[] = [];
    let resolveNext: ((value: IteratorResult<StreamEvent>) => void) | null = null;
    let done = false;

    const push = (event: StreamEvent) => {
      if (done) return;
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r({ value: event, done: false });
      } else {
        pending.push(event);
      }
    };

    const pull = (): Promise<IteratorResult<StreamEvent>> => {
      if (pending.length > 0) {
        return Promise.resolve({ value: pending.shift()!, done: false });
      }
      if (done) {
        return Promise.resolve({ value: undefined, done: true } as IteratorResult<StreamEvent>);
      }
      return new Promise<IteratorResult<StreamEvent>>((r) => { resolveNext = r; });
    };

    // Translate internal AgentEvents into typed StreamEvents
    const onEvent = (raw: { type: string; data: any }) => {
      switch (raw.type) {
        case 'thinking':
          push({ type: 'thinking', message: raw.data?.message ?? 'Thinking...' });
          break;
        case 'stream_start':
          // stream_start carries persona; text deltas follow
          break;
        case 'stream_text':
          push({ type: 'text_delta', text: raw.data?.text ?? '', persona: raw.data?.persona });
          break;
        case 'stream_end':
          // no-op; text_delta events cover the content
          break;
        case 'response':
          push({ type: 'text_delta', text: raw.data?.text ?? '', persona: raw.data?.persona });
          break;
        case 'tool_call':
          push({ type: 'tool_call_start', name: raw.data?.name ?? 'tool', input: raw.data?.input, index: raw.data?.index ?? 0 });
          break;
        case 'tool_result':
          push({ type: 'tool_call_end', name: raw.data?.name ?? 'tool', result: raw.data?.result, success: raw.data?.success !== false, index: 0 });
          break;
        case 'mode_changed':
          push({ type: 'mode_changed', from: raw.data?.from ?? '', to: raw.data?.to ?? '', reason: raw.data?.reason ?? '', auto: raw.data?.auto ?? false });
          break;
        case 'warning':
          push({ type: 'warning', message: raw.data?.message ?? '' });
          break;
        case 'error':
          push({ type: 'error', message: raw.data?.message ?? 'Unknown error', error: raw.data?.error });
          break;
        case 'complete':
          push({
            type: 'complete',
            iterations: raw.data?.iterations ?? 0,
            toolCalls: raw.data?.toolCalls ?? 0,
            filesChanged: raw.data?.filesChanged ?? 0,
            costLabel: raw.data?.costLabel,
            inputTokens: raw.data?.inputTokens ?? 0,
            outputTokens: raw.data?.outputTokens ?? 0,
          });
          break;
      }
    };

    this.on('event', onEvent);

    // Run the agent in the background; resolve the generator when done
    const runPromise = this.run(prompt, tools, toolExecutor, {
      images: opts?.images,
      signal: opts?.signal,
    }).then(() => {
      done = true;
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r({ value: undefined, done: true } as IteratorResult<StreamEvent>);
      }
    }).catch((err: any) => {
      if (opts?.signal?.aborted || this.isAbortError(err)) {
        push({ type: 'cancelled', iterations: this.iterationCount, toolCalls: this.toolCallCount });
      } else {
        push({ type: 'error', message: err?.message ?? String(err) });
      }
      done = true;
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r({ value: undefined, done: true } as IteratorResult<StreamEvent>);
      }
    });

    try {
      while (!done || pending.length > 0) {
        const result = await pull();
        if (result.done) break;
        yield result.value;
      }
    } finally {
      this.off('event', onEvent);
      await runPromise.catch(() => {});
    }
  }

  getStats() {
    return {
      iterations: this.iterationCount,
      toolCalls: this.toolCallCount,
      filesChanged: this.filesChanged.size,
      changedFiles: Array.from(this.filesChanged),
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
      cost: this.sessionCost,
      costLabel: this.sessionCost > 0 ? `$${this.sessionCost.toFixed(4)}` : undefined,
    };
  }

  getMessages(): MessageParam[] {
    return this.messages;
  }

  /**
   * Replace the internal conversation history.
   * Useful for restoring saved sessions or implementing undo/redo.
   * Also updates the transcript chain's last UUID so new entries
   * are linked to the restored conversation.
   */
  setMessages(messages: MessageParam[]) {
    this.messages = messages;
  }

  /**
   * Restore messages from a transcript, continuing the parentUuid chain.
   * Unlike setMessages, this also sets up the transcript writer state
   * so subsequent writes are properly linked.
   */
  async restoreFromTranscript(sessionId: string, cwd: string, messages: MessageParam[], lastUuid?: UUID): Promise<void> {
    this.initTranscript(sessionId, cwd);
    this.messages = messages;
    this.lastTranscriptUuid = lastUuid ?? null;
  }

  /**
   * Get the current agent mode.
   */
  getMode(): AgentMode {
    return this.modeState.current;
  }

  /**
   * Explicit user-driven mode change (e.g. hotkey or /mode).
   */
  setModeFromUser(mode: AgentMode, reason: string) {
    const oldMode = this.modeState.current;
    this.modeState = transitionMode(this.modeState, mode, reason);
    this.permissionManager.setMode(mode);
    this.emit('mode_changed', {
      from: oldMode,
      to: mode,
      reason,
      auto: false,
    });
  }

  /**
   * Activate a skill to inject specialized instructions into the system prompt.
   */
  setSkill(skillName: string | null, instructions?: string) {
    if (skillName && instructions) {
      this.activeSkill = { name: skillName, instructions };
    } else {
      this.activeSkill = null;
    }
  }

  /**
   * Get the currently active skill name, if any.
   */
  getActiveSkill(): string | null {
    return this.activeSkill?.name || null;
  }

  /**
   * Called when the agent completes a run. Fires hooks and extracts memories.
   */
  private async onAgentComplete(): Promise<void> {
    // SessionEnd hook
    if (this.hooksManager) {
      try {
        await this.hooksManager.execute('SessionEnd', {
          event: 'SessionEnd',
          sessionId: undefined,
        });
      } catch {
        /* non-fatal */
      }
    }

    // Auto-memory extraction
    if (this.autoMemManager) {
      try {
        await this.autoMemManager.extractFromTurn(this.messages);
      } catch {
        /* non-fatal */
      }

      // Maybe run dream consolidation
      try {
        await this.autoMemManager.maybeDream();
      } catch {
        /* non-fatal */
      }
    }
  }

  /**
   * Get the settings manager (for external configuration).
   */
  getSettingsManager(): import('./settings/settings.js').SettingsManager | undefined {
    return this.settingsManager;
  }

  /**
   * Get the hooks manager (for external hook registration).
   */
  getHooksManager(): import('./hooks/hooks.js').HooksManager | undefined {
    return this.hooksManager;
  }

  /**
   * Get the auto-memory manager (for external memory access).
   */
  getAutoMemoryManager(): import('./auto-memory/auto-memory.js').AutoMemoryManager | undefined {
    return this.autoMemManager;
  }

  /**
   * Get the permission rule manager (for external rule management).
   */
  getRuleManager(): import('./permission-rules/permission-rules.js').PermissionRuleManager | undefined {
    return this.ruleManager;
  }

  // ─── Transcript Persistence ───────────────────────────────────

  /**
   * Initialize transcript persistence for this agent session.
   * Sets up the JSONL file path and registers cleanup handlers.
   *
   * @param sessionId - UUID for this session
   * @param cwd - Working directory (used to determine project path)
   */
  initTranscript(sessionId: string, cwd: string): void {
    this.transcriptSessionId = sessionId;
    const sanitizePathFn = (p: string) => p.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 60);
    const projectsDir = join(homedir(), '.xibecode', 'projects');
    this.transcriptFilePath = join(projectsDir, sanitizePathFn(cwd), `${sessionId}.jsonl`);

    const writer = getTranscriptWriter();
    writer.sessionFile = this.transcriptFilePath;

    // Ensure graceful shutdown handlers are installed
    setupGracefulShutdown();

    // Register cleanup handler (only once per agent)
    if (!this.transcriptCleanupRegistered) {
      this.transcriptCleanupRegistered = true;
      registerCleanup(async () => {
        const w = getTranscriptWriter();
        await w.flush();
        try {
          w.reAppendSessionMetadata();
        } catch {
          // Best-effort
        }
      });
    }
  }

  /**
   * Write a message to the transcript file immediately.
   * Called by the chat loop for each user/assistant message.
   */
  private async writeToTranscript(
    role: 'user' | 'assistant' | 'system',
    message: MessageParam,
    entryUuid?: UUID,
  ): Promise<UUID | null> {
    if (!this.transcriptFilePath || !this.transcriptSessionId) return null;

    const resolvedEntryUuid = entryUuid ?? generateUuid();
    const entry: Entry = {
      type: role,
      uuid: resolvedEntryUuid,
      parentUuid: this.lastTranscriptUuid,
      timestamp: new Date().toISOString(),
      sessionId: this.transcriptSessionId,
      message,
    } as Entry;

    this.lastTranscriptUuid = resolvedEntryUuid;

    const writer = getTranscriptWriter();
    await writer.enqueueWrite(this.transcriptFilePath, entry);
    return resolvedEntryUuid;
  }

  /**
   * Write a user message to the transcript.
   * Can be called externally when a user submits a prompt.
   */
  async transcriptUserMessage(message: MessageParam): Promise<UUID | null> {
    return this.writeToTranscript('user', message);
  }

  /**
   * Write an assistant message to the transcript.
   * Called after each agent turn completes.
   */
  async transcriptAssistantMessage(message: MessageParam): Promise<UUID | null> {
    const assistantUuid = this.pendingAssistantTranscriptUuid ?? generateUuid();

    let snapshot: FileHistorySnapshot | undefined;
    if (typeof this.activeToolExecutor?.finalizeFileHistorySnapshot === 'function') {
      snapshot = await this.activeToolExecutor.finalizeFileHistorySnapshot(assistantUuid);
    }

    const writtenUuid = await this.writeToTranscript('assistant', message, assistantUuid);

    if (
      writtenUuid &&
      snapshot &&
      this.transcriptFilePath &&
      this.transcriptSessionId
    ) {
      const writer = getTranscriptWriter();
      await writer.enqueueWrite(this.transcriptFilePath, {
        type: 'file-history-snapshot',
        uuid: generateUuid(),
        parentUuid: null,
        timestamp: new Date().toISOString(),
        sessionId: this.transcriptSessionId,
        messageId: snapshot.messageId,
        trackedFileBackups: snapshot.trackedFileBackups,
      } as Entry);
    }

    this.pendingAssistantTranscriptUuid = null;
    return writtenUuid;
  }

  /**
   * Get the transcript session ID, if transcript persistence is enabled.
   */
  getTranscriptSessionId(): string | null {
    return this.transcriptSessionId;
  }

  /**
   * Get the transcript file path, if transcript persistence is enabled.
   */
  getTranscriptFilePath(): string | null {
    return this.transcriptFilePath;
  }

  /**
   * Flush pending transcript writes to disk.
   */
  async flushTranscript(): Promise<void> {
    const writer = getTranscriptWriter();
    await writer.flush();
  }
}
