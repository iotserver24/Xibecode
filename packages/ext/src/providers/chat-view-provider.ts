import * as vscode from 'vscode';
import { marked } from 'marked';
import type { AgentService } from '../services/agent-service';
import type { ConfigService } from '../services/config-service';
import { getWebviewHtml } from '../webview/webview-html';

/**
 * Provides the sidebar webview panel for the XibeCode chat UI.
 *
 * Communication protocol (postMessage):
 *   Webview → Extension:
 *     { command: 'sendMessage', text: string }
 *     { command: 'abort' }
 *     { command: 'clearHistory' }
 *     { command: 'getHistory' }
 *     { command: 'ready' }
 *
 *   Extension → Webview:
 *     { type: 'agentEvent', event: AgentEvent }
 *     { type: 'history', messages: ChatMessage[] }
 *     { type: 'config', model: string, provider: string }
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly agentService: AgentService,
    private readonly configService: ConfigService,
  ) {
    // Forward agent events to the webview
    let currentStreamText = '';

    this.agentService.on('event', async (event) => {
      // Add parsed HTML for text responses
      if (event.type === 'stream_start') {
        currentStreamText = '';
      } else if (event.type === 'stream_text') {
        currentStreamText += (event.data?.text as string || '');
        try {
          event.data = { ...event.data, html: await marked.parse(currentStreamText) };
        } catch (e) {
          event.data = { ...event.data, html: currentStreamText };
        }
      } else if (event.type === 'response') {
        const text = event.data?.text as string || currentStreamText;
        try {
          event.data = { ...event.data, html: await marked.parse(text) };
        } catch (e) {
          event.data = { ...event.data, html: text }; // fallback
        }
        currentStreamText = '';
      }
      this.postMessage({ type: 'agentEvent', event });
    });

    this.agentService.on('status', (status: string) => {
      this.postMessage({ type: 'status', status });
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.command) {
        case 'sendMessage': {
          const text = msg.text.trim();
          if (text === '/clear') {
            this.clearHistory();
          } else if (text === '/settings') {
            vscode.commands.executeCommand('xibecode.openSettings');
          } else if (text === '/help') {
            this.agentService['history'].push({ role: 'user', content: text, timestamp: Date.now() });
            this.agentService['history'].push({ 
              role: 'assistant', 
              content: '### Available Commands\n\n- `/clear` : Clear chat history\n- `/settings` : Open settings panel\n- `/help` : Show this help message', 
              timestamp: Date.now() 
            });
            this.postMessage({ type: 'history', messages: await this.getParsedHistory() });
          } else {
            this.agentService.run(text);
          }
          break;
        }
        case 'abort':
          this.agentService.abort();
          break;
        case 'clearHistory':
          this.agentService.clearHistory();
          this.postMessage({ type: 'history', messages: [] });
          break;
        case 'getHistory':
          this.postMessage({ type: 'history', messages: this.agentService.getHistory() });
          break;
        case 'ready': {
          const model = this.configService.getModel();
          const provider = this.configService.getProvider();
          // Build a clean readable label (strip dates like -20250514)
          const cleanModel = model.replace(/-\d{8}$/, '');
          this.postMessage({
            type: 'config',
            model,
            provider,
            modelLabel: `${cleanModel} · ${provider}`,
          });
          this.postMessage({ type: 'history', messages: await this.getParsedHistory() });
          break;
        }
      }
    });
  }

  /**
   * Send a user message programmatically (from commands like "Explain Selection").
   */
  sendUserMessage(text: string): void {
    // Focus the view first
    vscode.commands.executeCommand('xibecode.chatView.focus');
    // Tell webview to display the user message
    this.postMessage({ type: 'userMessage', text });
    // Run the agent
    this.agentService.run(text);
  }

  clearHistory(): void {
    this.agentService.clearHistory();
    this.postMessage({ type: 'history', messages: [] });
  }

  private async getParsedHistory() {
    const history = this.agentService.getHistory();
    return Promise.all(history.map(async (m) => {
      let html = m.content;
      try {
        const parsed = marked.parse(m.content);
        html = parsed instanceof Promise ? await parsed : parsed;
      } catch (e) {
        html = m.content;
      }
      return { ...m, html };
    }));
  }

  private postMessage(message: unknown): void {
    this.view?.webview.postMessage(message);
  }
}
