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
  SessionManager,
  AutoMemoryManager,
  type ChatSession,
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

export interface SessionInfo {
  id: string;
  title: string;
  model: string;
  created: number;
  updated: number;
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
  private sessionManager: SessionManager;
  private currentSessionId: string | null = null;
  private memory: NeuralMemory | null = null;
  private autoMemory: AutoMemoryManager | null = null;
  private cwd: string;
  private runStartTime: number = 0;

  constructor(private readonly configService: ConfigService) {
    super();
    this.cwd = process.cwd();
    this.sessionManager = new SessionManager(this.cwd);

    // Set cwd from workspace if available
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      this.cwd = vscode.workspace.workspaceFolders[0].uri.fsPath;
      this.sessionManager = new SessionManager(this.cwd);
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getHistory(): ChatMessage[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
    this.currentSessionId = null;
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * List available sessions for the current workspace.
   */
  async listSessions(): Promise<SessionInfo[]> {
    try {
      const sessions = await this.sessionManager.listSessions(this.cwd);
      return sessions.map((s: any) => ({
        id: s.id,
        title: s.title || 'Untitled',
        model: s.model || '',
        created: typeof s.created === 'string' ? new Date(s.created).getTime() : (s.created || 0),
        updated: typeof s.updated === 'string' ? new Date(s.updated).getTime() : (s.updated || 0),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Resume a previous session.
   */
  async resumeSession(sessionId: string): Promise<boolean> {
    try {
      const session = await this.sessionManager.loadSession(sessionId);
      if (!session) return false;

      this.currentSessionId = sessionId;
      this.history = (session.messages || [])
        .filter((m: any) => m.role === 'user' || m.role === 'assistant')
        .map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: extractText(m.content),
          timestamp: typeof m.created === 'number' ? m.created : Date.now(),
        }))
        .filter((m: any) => m.content.length > 0);

      this.emit('sessionResumed', { sessionId, title: session.title });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get auto-memories for the current project.
   */
  async getMemories(): Promise<string> {
    if (!this.autoMemory) {
      this.autoMemory = new AutoMemoryManager({ cwd: this.cwd });
    }
    try {
      return await this.autoMemory.getContextMemories() || '';
    } catch {
      return '';
    }
  }

  /**
   * Run dream consolidation on memories.
   */
  async dreamMemories(): Promise<string> {
    try {
      const { runDreamConsolidation } = await import('xibecode-core');
      const result = await runDreamConsolidation({ cwd: this.cwd });
      return `Dream done: ${result.created} created, ${result.merged} merged, ${result.pruned} pruned.`;
    } catch {
      return 'Dream consolidation failed.';
    }
  }

  /**
   * Initialize memory systems for the current workspace.
   */
  private async initMemory(): Promise<void> {
    try {
      this.memory = new NeuralMemory(this.cwd);
      await this.memory.init().catch(() => {});
    } catch {}

    try {
      this.autoMemory = new AutoMemoryManager({ cwd: this.cwd });
    } catch {}
  }

  /**
   * Save current session to disk.
   */
  private async saveSession(): Promise<void> {
    if (!this.currentSessionId || this.history.length === 0) return;
    try {
      const messages = this.history.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }));

      await this.sessionManager.saveSession({
        id: this.currentSessionId,
        title: this.history[0]?.content?.slice(0, 60) || 'Untitled',
        model: this.configService.getModel(),
        cwd: this.cwd,
        created: this.history[0]?.timestamp || Date.now(),
        updated: Date.now(),
        messages,
      } as any);
    } catch {}
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
        data: { message: 'No API key configured. Run "XibeCode: Set API Key" or set it in Settings.' },
      });
      return;
    }

    this.running = true;
    this.abortController = new AbortController();
    this.runStartTime = Date.now();
    this.emit('status', 'running');

    // Create a new session if we don't have one
    if (!this.currentSessionId) {
      this.currentSessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    // Record user message
    this.history.push({ role: 'user', content: prompt, timestamp: Date.now() });

    let cwd = this.cwd;
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
    const verbose = this.configService.getDefaultVerbose();

    try {
      // Initialize memory systems
      await this.initMemory();

      // Initialize core components — mirrors CLI's run.ts setup
      const mcpClientManager = new MCPClientManager();

      if (!this.memory) {
        this.memory = new NeuralMemory(cwd);
        await this.memory.init().catch(() => {});
      }

      const skillManager = new SkillManager(cwd, apiKey, baseUrl, model, provider as any);
      await skillManager.loadSkills().catch(() => {});

      const toolExecutor = new CodingToolExecutor(cwd, {
        mcpClientManager,
        memory: this.memory,
        skillManager,
      });

      const agent = new EnhancedAgent(
        {
          apiKey,
          baseUrl,
          model,
          maxIterations,
          verbose,
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
      const duration = Date.now() - this.runStartTime;

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
          duration,
        },
      });

      // Extract memories from this turn
      if (this.autoMemory) {
        try {
          const { extractMemoriesFromTurn, writeExtractedMemories } = await import('xibecode-core');
          const msgs = this.history
            .filter(m => m.role !== 'system')
            .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
          const extracted = extractMemoriesFromTurn(msgs as any);
          if (extracted && extracted.length > 0) {
            await writeExtractedMemories(extracted, { cwd: this.cwd });
          }
        } catch {}
      }

      // Save session
      await this.saveSession();

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

/**
 * Extract readable text from Anthropic API content format.
 * Content can be a plain string or an array of content blocks:
 *   [{ type: "text", text: "..." }, { type: "tool_use", name: "...", input: {...} }, ...]
 */
function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (typeof block === 'string') {
        parts.push(block);
      } else if (block && typeof block === 'object') {
        if (block.type === 'text' && typeof block.text === 'string') {
          parts.push(block.text);
        } else if (block.type === 'tool_use' && block.name) {
          const input = block.input ? `\n${JSON.stringify(block.input, null, 2)}` : '';
          parts.push(`[Tool: ${block.name}]${input}`);
        } else if (block.type === 'tool_result' && block.content) {
          const resultText = extractText(block.content);
          if (resultText) parts.push(resultText);
        }
      }
    }
    return parts.join('\n');
  }
  if (content && typeof content === 'object') return JSON.stringify(content);
  return '';
}
