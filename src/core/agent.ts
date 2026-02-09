import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool, ToolUseBlock, TextBlock, ContentBlock } from '@anthropic-ai/sdk/resources/messages';
import { EventEmitter } from 'events';

export interface AgentConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxIterations?: number;
  verbose?: boolean;
}

export interface AgentEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'response' | 'error' | 'warning' | 'complete' | 'iteration' | 'stream_start' | 'stream_text' | 'stream_end';
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

  constructor(config: AgentConfig) {
    super();
    
    const clientConfig: any = { apiKey: config.apiKey };
    if (config.baseUrl) {
      clientConfig.baseURL = config.baseUrl;
    }
    
    this.client = new Anthropic(clientConfig);
    this.config = {
      ...config,
      maxIterations: config.maxIterations ?? 150,
      verbose: config.verbose ?? false,
      baseUrl: config.baseUrl ?? '',
    };
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

      try {
        const { message: response, streamed } = await this.callModel(tools);

        // Add assistant response
        this.messages.push({
          role: 'assistant',
          content: response.content,
        });

        // Process response
        const content: ContentBlock[] = response.content;
        const textBlocks = content.filter((block): block is TextBlock => block.type === 'text');
        const toolUseBlocks = content.filter((block): block is ToolUseBlock => block.type === 'tool_use');

        // Show text responses (only if not already streamed)
        if (!streamed) {
          for (const block of textBlocks) {
            const cleanText = ThinkTagFilter.strip(block.text);
            if (cleanText) {
              this.emit('response', { text: cleanText });
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
            if (['write_file', 'edit_file', 'edit_lines'].includes(toolUse.name)) {
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
2. **Use Smart Editing**: Prefer edit_file (search/replace) over write_file for existing files
3. **Context Awareness**: Use get_context to understand project structure before making changes
4. **Incremental Changes**: Make small, tested changes rather than large rewrites
5. **Error Recovery**: If something fails, analyze the error and try a different approach

## Tool Usage

- **IMPORTANT**: Always provide all required parameters as documented
- For read_file: always include "path" as a string
- For read_multiple_files: always include "paths" as an array of strings
- For write_file: always include "path" and "content"
- For edit_file: always include "path", "search", and "replace"
- For run_command: always include "command" as a string

## File Editing Best Practices

- **For small edits**: Use edit_file with unique search strings
- **For large files**: Use edit_lines with specific line numbers  
- **For new files**: Use write_file
- **Always verify**: Read the file after editing to confirm changes

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

## Best Practices

1. **Before major refactors**: Create a git checkpoint with \`create_git_checkpoint\`
2. **After code changes**: Run tests with \`run_tests\` to verify correctness  
3. **For bug fixes**: Check git status and focus on changed files
4. **Test-driven workflow**: Run tests → fix failures → run tests again

## Error Handling

- If a tool fails, read the error carefully
- Don't repeat the exact same action - try alternatives
- Use revert_file if you need to undo changes
- Break down complex tasks into smaller steps

When you complete the task, provide a brief summary of what was accomplished.`;
  }

  getStats() {
    return {
      iterations: this.iterationCount,
      toolCalls: this.toolCallCount,
      filesChanged: this.filesChanged.size,
      changedFiles: Array.from(this.filesChanged),
    };
  }

  getMessages(): MessageParam[] {
    return this.messages;
  }
}
