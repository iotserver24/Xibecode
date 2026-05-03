import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import type { ConfigService } from './config-service';

// xibecode-core re-exports — resolved at bundle time via esbuild
import {
  EnhancedAgent,
  CodingToolExecutor,
  MCPClientManager,
  NeuralMemory,
  SkillManager,
} from 'xibecode-core';

export interface AgentEvent {
  type: string;
  data?: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: { name: string; input?: unknown; result?: unknown }[];
}

/**
 * Manages the xibecode-core agent lifecycle inside VS Code.
 *
 * This is the bridge between the webview UI and xibecode-core's
 * EnhancedAgent + CodingToolExecutor — mirrors what the CLI's
 * `run.ts` and `chat.ts` commands do, but adapted for the
 * extension host process.
 */
export class AgentService extends EventEmitter {
  private running = false;
  private abortController: AbortController | null = null;
  private history: ChatMessage[] = [];

  constructor(private readonly configService: ConfigService) {
    super();
  }

  isRunning(): boolean {
    return this.running;
  }

  getHistory(): ChatMessage[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }

  /**
   * Run a single user prompt through the agent.
   * Streams events back via the EventEmitter.
   */
  async run(prompt: string): Promise<void> {
    if (this.running) {
      this.emit('event', { type: 'error', data: { message: 'Agent is already running.' } });
      return;
    }

    const apiKey = this.configService.getApiKey();
    if (!apiKey) {
      this.emit('event', {
        type: 'error',
        data: { message: 'No API key configured. Run "XibeCode: Set API Key" first.' },
      });
      return;
    }

    this.running = true;
    this.abortController = new AbortController();
    this.emit('status', 'running');

    // Record user message
    this.history.push({ role: 'user', content: prompt, timestamp: Date.now() });

    let cwd = process.cwd();
    const activeEditor = vscode.window.activeTextEditor;
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      if (activeEditor) {
        const wf = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
        cwd = wf ? wf.uri.fsPath : vscode.workspace.workspaceFolders[0].uri.fsPath;
      } else {
        cwd = vscode.workspace.workspaceFolders[0].uri.fsPath;
      }
    } else if (activeEditor && activeEditor.document.uri.scheme === 'file') {
      const path = require('path');
      cwd = path.dirname(activeEditor.document.uri.fsPath);
    }
    const model = this.configService.getModel();
    const provider = this.configService.getProvider();
    const baseUrl = this.configService.getBaseUrl();
    const maxIterations = this.configService.getMaxIterations();

    try {
      // Initialize core components — mirrors CLI's run.ts setup
      const mcpClientManager = new MCPClientManager();
      const memory = new NeuralMemory(cwd);
      await memory.init().catch(() => {});

      const skillManager = new SkillManager(cwd, apiKey, baseUrl, model, provider as any);
      await skillManager.loadSkills().catch(() => {});

      const toolExecutor = new CodingToolExecutor(cwd, {
        mcpClientManager,
        memory,
        skillManager,
      });

      const agent = new EnhancedAgent(
        {
          apiKey,
          baseUrl,
          model,
          maxIterations,
          verbose: false,
          provider: provider as any,
        },
        provider as any,
      );

      let assistantText = '';
      const toolCalls: ChatMessage['toolCalls'] = [];

      agent.on('event', (event: AgentEvent) => {
        // Forward all events to webview
        this.emit('event', event);

        // Accumulate assistant response
        switch (event.type) {
          case 'stream_text':
            assistantText += (event.data?.text as string) ?? '';
            break;
          case 'response':
            assistantText += (event.data?.text as string) ?? '';
            break;
          case 'tool_call':
            toolCalls.push({
              name: (event.data?.name as string) ?? 'tool',
              input: event.data?.input,
            });
            break;
          case 'tool_result': {
            const last = toolCalls[toolCalls.length - 1];
            if (last) last.result = event.data?.result;
            break;
          }
        }
      });

      await agent.run(prompt, toolExecutor.getTools(), toolExecutor);

      const stats = agent.getStats();

      // Record assistant message
      this.history.push({
        role: 'assistant',
        content: assistantText,
        timestamp: Date.now(),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      });

      this.emit('event', {
        type: 'complete',
        data: {
          iterations: stats.iterations,
          toolCalls: stats.toolCalls,
          filesChanged: stats.filesChanged,
          costLabel: stats.costLabel,
        },
      });
    } catch (err: any) {
      this.emit('event', {
        type: 'error',
        data: { message: err?.message ?? 'Unknown error during agent run.' },
      });
    } finally {
      this.running = false;
      this.abortController = null;
      this.emit('status', 'idle');
    }
  }

  /**
   * Request cancellation of the current agent run.
   */
  abort(): void {
    this.abortController?.abort();
  }

  dispose(): void {
    this.abort();
    this.removeAllListeners();
  }
}
