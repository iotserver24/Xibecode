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
  type: 'thinking' | 'tool_call' | 'tool_result' | 'response' | 'error' | 'warning' | 'complete' | 'iteration';
  data: any;
}

export class LoopDetector {
  private history: Array<{ tool: string; input: string; timestamp: number }> = [];
  private readonly maxRepeats = 3;
  private readonly timeWindow = 10000; // 10 seconds

  check(toolName: string, toolInput: any): { allowed: boolean; reason?: string } {
    const signature = JSON.stringify({ tool: toolName, input: toolInput });
    const now = Date.now();

    this.history.push({ tool: toolName, input: signature, timestamp: now });
    this.history = this.history.filter(h => now - h.timestamp < this.timeWindow);

    // Check for exact duplicates
    const recentDuplicates = this.history.filter(h => h.input === signature);
    if (recentDuplicates.length >= this.maxRepeats) {
      return {
        allowed: false,
        reason: `Loop detected: ${toolName} called ${this.maxRepeats}+ times with same parameters`,
      };
    }

    // Check for same tool spam
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

export class EnhancedAgent extends EventEmitter {
  private client: Anthropic;
  private messages: MessageParam[] = [];
  private loopDetector = new LoopDetector();
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
      maxIterations: config.maxIterations ?? 50,
      verbose: config.verbose ?? false,
      baseUrl: config.baseUrl ?? '',
    };
  }

  emit(event: AgentEvent['type'], data: any): boolean {
    return super.emit('event', { type: event, data });
  }

  async run(initialPrompt: string, tools: Tool[], toolExecutor: any): Promise<void> {
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

      this.emit('thinking', { message: 'AI is analyzing...' });

      try {
        const response = await this.client.messages.create({
          model: this.config.model,
          max_tokens: 8192,
          messages: this.messages,
          tools,
          system: this.getSystemPrompt(),
        });

        // Add assistant response
        this.messages.push({
          role: 'assistant',
          content: response.content,
        });

        // Process response
        const textBlocks = response.content.filter((block): block is TextBlock => block.type === 'text');
        const toolUseBlocks = response.content.filter((block): block is ToolUseBlock => block.type === 'tool_use');

        // Show text responses
        for (const block of textBlocks) {
          if (block.text.trim()) {
            this.emit('response', { text: block.text });
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

  private getSystemPrompt(): string {
    const platform = process.platform;
    const platformNote = platform === 'win32'
      ? 'You are running on Windows. Use PowerShell commands and Windows path conventions.'
      : platform === 'darwin'
      ? 'You are running on macOS. Use Unix/bash commands.'
      : 'You are running on Linux. Use bash commands.';

    return `You are XibeCode, an expert autonomous coding assistant with advanced capabilities.

${platformNote}

## Core Principles

1. **Read Before Edit**: ALWAYS read files with read_file before modifying them
2. **Use Smart Editing**: Prefer edit_file (search/replace) over write_file for existing files
3. **Context Awareness**: Use get_context to understand project structure before making changes
4. **Incremental Changes**: Make small, tested changes rather than large rewrites
5. **Error Recovery**: If something fails, analyze the error and try a different approach

## File Editing Best Practices

- **For small edits**: Use edit_file with unique search strings
- **For large files**: Use edit_lines with specific line numbers  
- **For new files**: Use write_file
- **Always verify**: Read the file after editing to confirm changes

## Tool Usage Strategy

1. Start with get_context or search_files to understand the project
2. Read relevant files to understand current state
3. Make targeted edits using edit_file or edit_lines
4. Test changes with run_command if applicable
5. Verify success by reading modified files

## Error Handling

- If a tool fails, read the error carefully
- Don't repeat the exact same action - try alternatives
- Use revert_file if you need to undo changes
- Break down complex tasks into smaller steps

## Context Management

For large files:
- Read in chunks using start_line/end_line parameters
- Use edit_lines for precise modifications
- Don't try to rewrite entire large files

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
