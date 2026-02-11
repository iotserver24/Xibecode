import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool, ToolUseBlock, TextBlock, ContentBlock } from '@anthropic-ai/sdk/resources/messages';
import fetch from 'node-fetch';
import * as fsSync from 'fs';
import { EventEmitter } from 'events';
import { AgentMode, MODE_CONFIG, ModeState, createModeState, transitionMode, ModeOrchestrator, parseModeRequest, stripModeRequests, ModeTransitionPolicy } from './modes.js';

export interface AgentConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxIterations?: number;
  verbose?: boolean;
  mode?: AgentMode;
}

export interface AgentEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'response' | 'error' | 'warning' | 'complete' | 'iteration' | 'stream_start' | 'stream_text' | 'stream_end' | 'mode_changed' | 'mode_change_requested';
  data: any;
}

export class LoopDetector {
  private history: Array<{ tool: string; input: string; timestamp: number }> = [];
  private readonly maxRepeats = 3;
  private readonly timeWindow = 10000;

  check(toolName: string, toolInput: any): { allowed: boolean; reason?: string } {
    const signature = JSON.stringify({ tool: toolName, input: toolInput });
    const now = Date.now();

    this.history.push({ tool: toolName, input: signature, timestamp: now });
    this.history = this.history.filter(h => now - h.timestamp < this.timeWindow);

    const recentDuplicates = this.history.filter(h => h.input === signature);
    if (recentDuplicates.length >= this.maxRepeats) {
      return {
        allowed: false,
        reason: `Loop detected: ${toolName} called ${this.maxRepeats}+ times with same parameters`,
      };
    }

    const sameTool = this.history.filter(h => h.tool === toolName);
    if (sameTool.length >= this.maxRepeats * 2) {
      return {
        allowed: true,
        reason: `Warning: ${toolName} called ${sameTool.length} times recently`,
      };
    }

    return { allowed: true };
  }

  reset() {
    this.history = [];
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

// ─── Agent ────────────────────────────────────────────────────
export class EnhancedAgent extends EventEmitter {
  private client: Anthropic;
  private messages: MessageParam[] = [];
  private loopDetector = new LoopDetector();
  private thinkFilter = new ThinkTagFilter();
  private config: Required<AgentConfig>;
  private iterationCount = 0;
  private toolCallCount = 0;
  private filesChanged: Set<string> = new Set();
  private modeState: ModeState;
  private modeOrchestrator: ModeOrchestrator;
  private provider: 'anthropic' | 'openai';
  private projectMemory: string = '';
  private totalInputTokens: number = 0;
  private totalOutputTokens: number = 0;
  private sessionCost: number = 0;

  // Pricing per 1M tokens (input/output) — Claude models
  private static readonly PRICING: Record<string, { input: number; output: number }> = {
    'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
    'claude-opus-4-5-20251101': { input: 15, output: 75 },
    'claude-haiku-4-5-20251015': { input: 1, output: 5 },
    'claude-opus-4-6-20251101': { input: 5, output: 25 },
  };

  constructor(config: AgentConfig, providerOverride?: 'anthropic' | 'openai') {
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
    };

    // Initialize mode state and orchestrator
    this.modeState = createModeState(this.config.mode);
    this.modeOrchestrator = new ModeOrchestrator({
      autoApprovalPolicy: 'always', // Allow AI to switch modes autonomously
      allowAutoEscalation: true,
    });
    // Prefer explicit provider override from config, otherwise auto-detect
    this.provider = providerOverride ?? this.detectProvider(this.config.model, this.config.baseUrl);

    // Load project memory if it exists
    try {
      const memoryPath = require('path').join(process.cwd(), '.xibecode', 'memory.md');
      if (fsSync.existsSync(memoryPath)) {
        this.projectMemory = fsSync.readFileSync(memoryPath, 'utf-8').trim();
      }
    } catch { /* no memory file */ }
  }

  emit(event: AgentEvent['type'], data: any): boolean {
    return super.emit('event', { type: event, data });
  }

  async run(initialPrompt: string, tools: Tool[], toolExecutor: any): Promise<void> {
    // Reset per-turn state (keeps conversation history in this.messages)
    this.iterationCount = 0;
    this.toolCallCount = 0;
    this.loopDetector.reset();

    this.messages.push({
      role: 'user',
      content: initialPrompt,
    });

    this.emit('thinking', { message: 'Starting agent...' });

    while (this.iterationCount < this.config.maxIterations) {
      this.iterationCount++;

      this.emit('iteration', {
        current: this.iterationCount,
        total: this.config.maxIterations,
      });

      this.emit('thinking', { message: 'AI is thinking...' });

      const maxApiRetries = 5;
      const retryDelayMs = 2000;
      let response: any;
      let streamed = false;

      try {
        // Tools are supported for both Anthropic and OpenAI-format models.
        const effectiveTools = tools;
        for (let attempt = 1; attempt <= maxApiRetries; attempt++) {
          try {
            const result = await this.callModel(effectiveTools);
            response = result.message;
            streamed = result.streamed;
            break;
          } catch (apiError: any) {
            this.emit('error', { message: 'API Error', error: apiError.message });
            if (attempt < maxApiRetries) {
              this.emit('warning', {
                message: `Retrying in ${retryDelayMs / 1000}s (attempt ${attempt}/${maxApiRetries})...`,
              });
              await new Promise((r) => setTimeout(r, retryDelayMs));
            } else {
              throw apiError;
            }
          }
        }

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

        // Auto-compact: if conversation exceeds 80 messages, compact older ones
        if (this.messages.length > 80) {
          const preserved = this.messages.slice(-12);
          const compactNotice: MessageParam = {
            role: 'assistant' as const,
            content: 'Earlier conversation was auto-compacted to save context window space. Recent messages are preserved.',
          };
          this.messages = [compactNotice, ...preserved];
          this.emit('warning', { message: 'Auto-compacted conversation to save context (kept last 12 messages)' });
        }

        // Process response
        const content: ContentBlock[] = response.content;
        const textBlocks = content.filter((block): block is TextBlock => block.type === 'text');
        const toolUseBlocks = content.filter((block): block is ToolUseBlock => block.type === 'tool_use');

        // Check for mode change requests in text blocks
        for (const block of textBlocks) {
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

            if (evaluation.approved) {
              // Auto-approved - switch immediately
              const oldMode = this.modeState.current;
              this.modeState = transitionMode(this.modeState, modeRequest.mode, modeRequest.reason);

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
        }

        // Show text responses (only if not already streamed)
        if (!streamed) {
          for (const block of textBlocks) {
            const cleanText = ThinkTagFilter.strip(block.text);
            // Remove mode request tags for display
            const displayText = stripModeRequests(cleanText);
            if (displayText) {
              this.emit('response', { text: displayText });
            }
          }
        }

        // If no tools, we're done
        if (toolUseBlocks.length === 0) {
          this.emit('complete', {
            iterations: this.iterationCount,
            toolCalls: this.toolCallCount,
            filesChanged: this.filesChanged.size,
          });
          break;
        }

        // Execute tools
        const toolResults = [];

        for (let i = 0; i < toolUseBlocks.length; i++) {
          const toolUse = toolUseBlocks[i];
          this.toolCallCount++;

          // Loop detection
          const loopCheck = this.loopDetector.check(toolUse.name, toolUse.input);

          if (!loopCheck.allowed) {
            this.emit('warning', { message: loopCheck.reason });
            toolResults.push({
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              content: `Error: ${loopCheck.reason}. Try a different approach.`,
              is_error: true,
            });
            continue;
          }

          if (loopCheck.reason) {
            this.emit('warning', { message: loopCheck.reason });
          }

          // Emit tool call
          this.emit('tool_call', {
            name: toolUse.name,
            input: toolUse.input,
            index: i + 1,
          });

          // Execute
          try {
            const result = await toolExecutor.execute(toolUse.name, toolUse.input);

            // Track file changes
            if (['write_file', 'edit_file', 'edit_lines', 'verified_edit'].includes(toolUse.name)) {
              const input = toolUse.input as { path?: string };
              if (typeof input?.path === 'string') this.filesChanged.add(input.path);
            }

            this.emit('tool_result', {
              name: toolUse.name,
              result,
              success: !result.error && result.success !== false,
            });

            toolResults.push({
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              content: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            });
          } catch (error: any) {
            this.emit('error', {
              tool: toolUse.name,
              error: error.message,
            });

            toolResults.push({
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              content: `Error: ${error.message}`,
              is_error: true,
            });
          }
        }

        // Add results to conversation
        this.messages.push({
          role: 'user',
          content: toolResults,
        });

      } catch (error: any) {
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
  private async callModel(tools: Tool[]): Promise<{ message: any; streamed: boolean }> {
    // Route to provider-specific implementation
    if (this.provider === 'openai') {
      return this.callOpenAI(tools);
    }

    const params: any = {
      model: this.config.model,
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

      const stream = this.client.messages.stream(params);

      stream.on('text', (chunk: string) => {
        const filtered = this.thinkFilter.push(chunk);
        if (filtered) {
          if (!hasEmittedStart) {
            this.emit('stream_start', {});
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
        return { message, streamed: false };
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
  private buildOpenAIMessages(): Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content?: string; tool_call_id?: string; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }> {
    const out: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content?: string; tool_call_id?: string; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }> = [];

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
              out.push({
                role: 'tool',
                tool_call_id: (tr as any).tool_use_id,
                content: typeof (tr as any).content === 'string' ? (tr as any).content : JSON.stringify((tr as any).content),
              });
            }
          } else {
            const textBlocks = arr.filter((b: any) => b.type === 'text') as TextBlock[];
            const text = textBlocks.map((b) => b.text).join('\n');
            if (text) out.push({ role: 'user', content: text });
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
  private async callOpenAI(tools: Tool[]): Promise<{ message: any; streamed: boolean }> {
    if (!this.config.apiKey) {
      throw new Error('API key is required for OpenAI-compatible provider');
    }

    let base = (this.config.baseUrl || 'https://api.openai.com').replace(/\/+$/, '');
    let url: string;
    if (base.endsWith('/v1')) {
      url = `${base}/chat/completions`;
    } else {
      url = `${base}/v1/chat/completions`;
    }

    const openAiMessages = this.buildOpenAIMessages();

    const baseBody: any = {
      model: this.config.model,
      messages: openAiMessages,
      max_tokens: 16000,
    };
    if (tools.length > 0) {
      baseBody.tools = this.mapToolsToOpenAI(tools);
    }

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
      });

      if (!streamResponse.ok || !streamResponse.body) {
        throw new Error(`OpenAI-compatible streaming error: ${streamResponse.status}`);
      }

      const reader = (streamResponse.body as any).getReader
        ? (streamResponse.body as any).getReader()
        : null;
      if (!reader) {
        throw new Error('Streaming reader not available');
      }

      let fullText = '';
      const toolCallsAccum: Array<{ id: string; name: string; arguments: string; index: number }> = [];
      let hasEmittedStart = false;
      let buffer = '';

      const textDecoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += typeof value === 'string' ? value : textDecoder.decode(value, { stream: true });
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
                this.emit('stream_start', {});
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

      const message = { content: content.length ? content : [{ type: 'text', text: '' } as TextBlock] };
      return { message, streamed: hasEmittedStart };
    } catch (_streamError) {
      // ── Fallback to non-streaming ───────────────────────
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(baseBody),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI-compatible API error: ${response.status} ${text}`);
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

  /**
   * Very small heuristic to decide which provider to use based on model id.
   * - Models starting with "gpt-" or "o1-" / "o3-" use OpenAI format.
   * - Everything else defaults to Anthropic format.
   */
  private detectProvider(model: string, _baseUrl?: string): 'anthropic' | 'openai' {
    const m = model.toLowerCase();
    if (m.startsWith('gpt-') || m.startsWith('gpt4') || m.startsWith('o1-') || m.startsWith('o3-')) {
      return 'openai';
    }
    return 'anthropic';
  }

  private getSystemPrompt(): string {
    const platform = process.platform;
    const platformNote = platform === 'win32'
      ? 'You are running on Windows. Use PowerShell commands and Windows path conventions.'
      : platform === 'darwin'
        ? 'You are running on macOS. Use Unix/bash commands.'
        : 'You are running on Linux. Use bash commands.';

    return `You are XibeCode, an expert autonomous coding assistant with advanced capabilities.

${platformNote}

Working directory: ${process.cwd()}

## Core Principles

1. **Read Before Edit**: ALWAYS read files with read_file before modifying them
2. **Use Verified Editing**: ALWAYS prefer verified_edit as your PRIMARY file editing tool. It requires old_content verification which prevents mistakes. Only fall back to edit_file or edit_lines if verified_edit fails.
3. **Context Awareness**: Use get_context to understand project structure before making changes
4. **Incremental Changes**: Make small, tested changes rather than large rewrites
5. **Error Recovery**: If something fails, analyze the error and try a different approach
6. **Search First**: Use grep_code to find code patterns, usages, and references before making changes
7. **Web Research**: Use web_search and fetch_url when you need documentation, error solutions, or up-to-date info
8. **Remember Important Things**: Use update_memory to save project knowledge for future sessions${this.projectMemory ? `

## Project Memory

The following knowledge was saved from previous sessions:

${this.projectMemory}` : ''}
6. **Think Systematically**: Decompose complex problems, form hypotheses, and validate assumptions
7. **Consider Impact**: Analyze how changes affect related code and downstream dependencies

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
- Always use web_search when you encounter an unfamiliar error or need current documentation

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
- Test results and validation performed`;
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
   */
  setMessages(messages: MessageParam[]) {
    this.messages = messages;
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
    this.emit('mode_changed', {
      from: oldMode,
      to: mode,
      reason,
      auto: false,
    });
  }
}
