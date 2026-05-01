import { EventEmitter } from 'events';
import { app } from 'electron';
import * as path from 'path';
import {
  EnhancedAgent,
  CodingToolExecutor,
  NeuralMemory,
  SessionManager,
  type AgentMode,
  type ModeState,
  createModeState,
} from 'xibecode-core';
import type { BrowserWindow } from 'electron';

const FLUSH_INTERVAL_MS = 16;
const HIGH_PRIORITY_EVENTS = new Set(['complete', 'error', 'mode_changed', 'mode_change_requested']);

export interface HostedAgentEvent {
  type: string;
  data: unknown;
  timestamp: number;
}

export class AgentHost extends EventEmitter {
  private agent: EnhancedAgent | null = null;
  private toolExecutor: CodingToolExecutor | null = null;
  private memory: NeuralMemory | null = null;
  private sessionManager: SessionManager | null = null;
  private modeState: ModeState = createModeState('agent');
  private eventBuffer: HostedAgentEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor() {
    super();
  }

  private getUserDataDir(): string {
    return app.getPath('userData');
  }

  private ensureFlushLoop(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => this.flushBuffer(), FLUSH_INTERVAL_MS);
  }

  private stopFlushLoop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private bufferEvent(type: string, data: unknown): void {
    this.eventBuffer.push({
      type,
      data,
      timestamp: Date.now(),
    });

    if (HIGH_PRIORITY_EVENTS.has(type)) {
      this.flushBuffer();
    }
  }

  private flushBuffer(): void {
    if (this.eventBuffer.length === 0) return;
    const batch = this.eventBuffer.splice(0);
    this.emit('agent-events', batch);
  }

  async initialize(config: {
    apiKey: string;
    model: string;
    provider?: string;
    baseUrl?: string;
    workingDir: string;
    mode?: AgentMode;
  }): Promise<void> {
    const userDataDir = this.getUserDataDir();
    const memoryDir = path.join(userDataDir, 'memory');
    const sessionDir = path.join(userDataDir, 'sessions');

    this.memory = new NeuralMemory(memoryDir);
    await this.memory.init();

    this.sessionManager = new SessionManager(sessionDir);

    this.toolExecutor = new CodingToolExecutor(config.workingDir, {
      memory: this.memory,
    });

    this.modeState = createModeState(config.mode ?? 'agent');

    this.agent = new EnhancedAgent(
      {
        apiKey: config.apiKey,
        model: config.model,
        provider: (config.provider as any) ?? undefined,
        baseUrl: config.baseUrl,
        mode: config.mode ?? 'agent',
        maxIterations: 150,
        verbose: false,
      },
      config.provider as any,
    );

    // Core agent emits all events on the 'event' channel as { type, data }
    this.agent.on('event', (event: { type: string; data: any }) => {
      this.bufferEvent(event.type, event.data);
    });
  }

  async sendMessage(
    message: string,
    mainWindow: BrowserWindow,
  ): Promise<void> {
    if (!this.agent || !this.toolExecutor) {
      throw new Error('Agent not initialized. Call initialize() first.');
    }

    if (this.running) {
      throw new Error('Agent is already running. Wait for completion or abort.');
    }

    this.running = true;
    this.ensureFlushLoop();

    try {
      const tools = this.toolExecutor.getTools();
      await this.agent.run(message, tools, this.toolExecutor);
    } finally {
      this.running = false;
      this.flushBuffer();
      this.stopFlushLoop();
    }
  }

  switchMode(targetMode: AgentMode, reason: string): { approved: boolean; requiresConfirmation: boolean; reason?: string } {
    if (this.agent) {
      this.agent.setModeFromUser(targetMode, reason);
    }
    if (this.toolExecutor) {
      this.toolExecutor.setMode(targetMode);
    }
    this.modeState = {
      current: targetMode,
      previous: this.modeState.current,
      history: [...this.modeState.history, { mode: targetMode, timestamp: Date.now(), reason }],
    };
    this.bufferEvent('mode_changed', { mode: targetMode, reason });
    this.flushBuffer();
    return { approved: true, requiresConfirmation: false };
  }

  getModeState(): ModeState {
    return { ...this.modeState };
  }

  isRunning(): boolean {
    return this.running;
  }

  getWorkingDir(): string {
    return this.toolExecutor ? (this.toolExecutor as any).workingDir ?? process.cwd() : process.cwd();
  }

  dispose(): void {
    this.stopFlushLoop();
    if (this.agent) {
      this.agent.removeAllListeners();
    }
    this.agent = null;
    this.toolExecutor = null;
    this.memory = null;
    this.sessionManager = null;
  }
}
