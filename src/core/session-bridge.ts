/**
 * Session Bridge - Synchronizes TUI and WebUI in real-time
 *
 * This module provides a shared event bus that connects the terminal UI
 * and browser WebUI, ensuring both show the same conversation state.
 */

import { EventEmitter } from 'events';

export interface BridgeMessage {
  type: 'user_message' | 'assistant_message' | 'stream_start' | 'stream_text' | 'stream_end' |
        'tool_call' | 'tool_result' | 'thinking' | 'error' | 'session_sync' |
        'plan_questions' | 'plan_ready';
  data: any;
  source: 'tui' | 'webui';
  timestamp: number;
}

export interface SessionState {
  messages: any[];
  sessionId: string;
  model: string;
  mode: string;
  isProcessing: boolean;
}

/**
 * SessionBridge - Singleton that synchronizes TUI and WebUI
 */
class SessionBridgeClass extends EventEmitter {
  private static instance: SessionBridgeClass;
  private state: SessionState = {
    messages: [],
    sessionId: '',
    model: '',
    mode: 'agent',
    isProcessing: false,
  };
  private webSocketClients: Set<any> = new Set();

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  static getInstance(): SessionBridgeClass {
    if (!SessionBridgeClass.instance) {
      SessionBridgeClass.instance = new SessionBridgeClass();
    }
    return SessionBridgeClass.instance;
  }

  /**
   * Register a WebSocket client for real-time updates
   */
  registerWebSocket(ws: any): void {
    this.webSocketClients.add(ws);
    // Send current state to new client
    this.sendToClient(ws, {
      type: 'session_sync',
      data: this.state,
      source: 'tui',
      timestamp: Date.now(),
    });
  }

  /**
   * Unregister a WebSocket client
   */
  unregisterWebSocket(ws: any): void {
    this.webSocketClients.delete(ws);
  }

  /**
   * Broadcast message to all WebSocket clients
   */
  broadcastToWebUI(message: BridgeMessage): void {
    if (this.webSocketClients.size === 0) {
      return; // No clients connected
    }
    const payload = JSON.stringify(message);
    for (const ws of this.webSocketClients) {
      try {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(payload);
        }
      } catch (e) {
        // Remove dead connections
        this.webSocketClients.delete(ws);
      }
    }
  }

  /**
   * Send message to specific client
   */
  private sendToClient(ws: any, message: BridgeMessage): void {
    try {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(message));
      }
    } catch (e) {
      this.webSocketClients.delete(ws);
    }
  }

  /**
   * Called from TUI when user sends a message
   */
  onTUIUserMessage(content: string): void {
    const message: BridgeMessage = {
      type: 'user_message',
      data: { content },
      source: 'tui',
      timestamp: Date.now(),
    };
    this.state.isProcessing = true;
    this.broadcastToWebUI(message);
    this.emit('user_message', content, 'tui');
  }

  /**
   * Called from WebUI when user sends a message
   */
  onWebUIUserMessage(content: string): void {
    const message: BridgeMessage = {
      type: 'user_message',
      data: { content },
      source: 'webui',
      timestamp: Date.now(),
    };
    this.state.isProcessing = true;
    this.broadcastToWebUI(message);
    this.emit('user_message', content, 'webui');
  }

  /**
   * Called when assistant starts streaming
   */
  onStreamStart(persona?: string): void {
    const message: BridgeMessage = {
      type: 'stream_start',
      data: { persona },
      source: 'tui',
      timestamp: Date.now(),
    };
    this.broadcastToWebUI(message);
  }

  /**
   * Called when assistant streams text
   */
  onStreamText(text: string): void {
    const message: BridgeMessage = {
      type: 'stream_text',
      data: { text },
      source: 'tui',
      timestamp: Date.now(),
    };
    this.broadcastToWebUI(message);
  }

  /**
   * Called when assistant finishes streaming
   */
  onStreamEnd(): void {
    const message: BridgeMessage = {
      type: 'stream_end',
      data: {},
      source: 'tui',
      timestamp: Date.now(),
    };
    this.state.isProcessing = false;
    this.broadcastToWebUI(message);
  }

  /**
   * Called when a tool is invoked
   */
  onToolCall(name: string, input: any): void {
    const message: BridgeMessage = {
      type: 'tool_call',
      data: { name, input },
      source: 'tui',
      timestamp: Date.now(),
    };
    this.broadcastToWebUI(message);
  }

  /**
   * Called when a tool returns a result
   */
  onToolResult(name: string, result: any, success: boolean): void {
    const message: BridgeMessage = {
      type: 'tool_result',
      data: { name, result, success },
      source: 'tui',
      timestamp: Date.now(),
    };
    this.broadcastToWebUI(message);
  }

  /**
   * Called when assistant is thinking
   */
  onThinking(text: string): void {
    const message: BridgeMessage = {
      type: 'thinking',
      data: { text },
      source: 'tui',
      timestamp: Date.now(),
    };
    this.broadcastToWebUI(message);
  }

  /**
   * Called on error
   */
  onError(error: string): void {
    const message: BridgeMessage = {
      type: 'error',
      data: { error },
      source: 'tui',
      timestamp: Date.now(),
    };
    this.state.isProcessing = false;
    this.broadcastToWebUI(message);
  }

  /**
   * Called when full response is complete
   */
  onAssistantMessage(content: string, persona?: string): void {
    const message: BridgeMessage = {
      type: 'assistant_message',
      data: { content, persona },
      source: 'tui',
      timestamp: Date.now(),
    };
    this.state.isProcessing = false;
    this.broadcastToWebUI(message);
  }

  /**
   * Called when planner mode emits questions for the user
   */
  onPlanQuestions(questions: any[]): void {
    const message: BridgeMessage = {
      type: 'plan_questions',
      data: { questions },
      source: 'tui',
      timestamp: Date.now(),
    };
    this.broadcastToWebUI(message);
    this.emit('plan_questions', questions);
  }

  /**
   * Called when planner mode has finished writing implementations.md
   */
  onPlanReady(planContent: string, planPath: string): void {
    const message: BridgeMessage = {
      type: 'plan_ready',
      data: { planContent, planPath },
      source: 'tui',
      timestamp: Date.now(),
    };
    this.broadcastToWebUI(message);
    this.emit('plan_ready', planContent, planPath);
  }

  /**
   * Update session state
   */
  updateState(partial: Partial<SessionState>): void {
    this.state = { ...this.state, ...partial };
    this.broadcastToWebUI({
      type: 'session_sync',
      data: this.state,
      source: 'tui',
      timestamp: Date.now(),
    });
  }

  /**
   * Get current state
   */
  getState(): SessionState {
    return { ...this.state };
  }

  /**
   * Check if processing
   */
  isProcessing(): boolean {
    return this.state.isProcessing;
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.webSocketClients.size;
  }
}

// Export singleton
export const SessionBridge = SessionBridgeClass.getInstance();
