import * as vscode from 'vscode';
import { marked } from 'marked';
import type { AgentService, SessionInfo } from '../services/agent-service';
import type { ConfigService } from '../services/config-service';
import { getWebviewHtml } from '../webview/webview-html';
import { PROVIDER_CONFIGS, type ProviderType } from 'xibecode-core';

export interface SlashCommand {
  name: string;
  description: string;
  usage?: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/help', description: 'Show available commands and usage hints' },
  { name: '/clear', description: 'Clear chat history' },
  { name: '/mode', description: 'Switch agent mode (agent, plan, review)', usage: '/mode <mode>' },
  { name: '/model', description: 'Switch AI model', usage: '/model <id>' },
  { name: '/models', description: 'Browse and pick models from your provider' },
  { name: '/config', description: 'Open settings panel' },
  { name: '/setup', description: 'Guided setup wizard (provider, API key, model)' },
  { name: '/memory', description: 'Show project auto-memories', usage: '/memory [list|dream|path]' },
  { name: '/hooks', description: 'Show registered lifecycle hooks' },
  { name: '/format', description: 'Switch wire format (auto, anthropic, openai)', usage: '/format <format>' },
  { name: '/resume', description: 'Resume a previous session' },
  { name: '/exit', description: 'Clear history and reset session' },
];

/**
 * Provides the sidebar webview panel for the XibeCode chat UI.
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
          event.data = { ...event.data, html: text };
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
          await this.handleSlashCommandOrRun(text);
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
        case 'getSlashCommands': {
          this.postMessage({ type: 'slashCommands', commands: SLASH_COMMANDS });
          break;
        }
        case 'ready': {
          const model = this.configService.getModel();
          const provider = this.configService.getProvider();
          const cleanModel = model.replace(/-\d{8}$/, '');
          const baseUrl = this.configService.getBaseUrl();
          this.postMessage({
            type: 'config',
            model,
            provider,
            modelLabel: `${cleanModel} · ${provider}`,
            baseUrl: baseUrl || '',
          });
          this.postMessage({ type: 'slashCommands', commands: SLASH_COMMANDS });
          this.postMessage({ type: 'history', messages: await this.getParsedHistory() });

          this.configService.onDidChange(() => {
            const m = this.configService.getModel();
            const p = this.configService.getProvider();
            const cm = m.replace(/-\d{8}$/, '');
            const bu = this.configService.getBaseUrl();
            this.postMessage({
              type: 'config',
              model: m,
              provider: p,
              modelLabel: `${cm} · ${p}`,
              baseUrl: bu || '',
            });
          });
          break;
        }
      }
    });
  }

  /**
   * Handle slash commands or run as prompt.
   */
  private async handleSlashCommandOrRun(text: string): Promise<void> {
    if (!text.startsWith('/')) {
      this.agentService.run(text);
      return;
    }

    const parts = text.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case '/clear':
        this.agentService.clearHistory();
        this.postMessage({ type: 'history', messages: [] });
        this.addSystemMessage('Chat history cleared.');
        break;

      case '/help':
        this.showHelp();
        break;

      case '/config':
      case '/settings':
        vscode.commands.executeCommand('xibecode.openSettings');
        this.addSystemMessage('Opening settings panel...');
        break;

      case '/mode': {
        const modes = ['agent', 'plan', 'review'];
        const pick = args[0] || await vscode.window.showQuickPick(modes, {
          title: 'XibeCode — Switch Mode',
          placeHolder: 'Select agent mode',
        });
        if (pick) {
          this.addSystemMessage(`Mode switched to: ${pick}`);
        }
        break;
      }

      case '/model': {
        if (args[0]) {
          await this.configService.setModel(args[0]);
          this.addSystemMessage(`Model set to: ${args[0]}`);
        } else {
          await this.runModelPicker();
        }
        break;
      }

      case '/models': {
        await this.runModelPicker();
        break;
      }

      case '/setup':
        await this.runSetupWizard();
        break;

      case '/memory': {
        const subcmd = args[0] || 'list';
        if (subcmd === 'dream') {
          this.addSystemMessage('Running dream consolidation...');
          const result = await this.agentService.dreamMemories();
          this.addSystemMessage(result);
        } else if (subcmd === 'path') {
          const memContent = await this.agentService.getMemories();
          this.addSystemMessage(memContent
            ? `Memory context loaded (${memContent.length} chars)`
            : 'No memories found for this project.');
        } else {
          // list
          const memContent = await this.agentService.getMemories();
          if (memContent) {
            this.addSystemMessage(`### Project Memories\n\n${memContent.slice(0, 2000)}${memContent.length > 2000 ? '\n\n...(truncated)' : ''}`);
          } else {
            this.addSystemMessage('No memories found for this project. Memories are auto-extracted after each agent run.');
          }
        }
        break;
      }

      case '/hooks':
        this.addSystemMessage('Hooks management is available via `xibecode hooks` CLI command. Extension hooks UI coming soon.');
        break;

      case '/format': {
        const formats = ['auto', 'anthropic', 'openai'];
        const pick = args[0] || await vscode.window.showQuickPick(formats, {
          title: 'XibeCode — Wire Format',
          placeHolder: 'Select format',
        });
        if (pick) {
          this.addSystemMessage(`Wire format set to: ${pick}`);
        }
        break;
      }

      case '/resume': {
        const sessions = await this.agentService.listSessions();
        if (sessions.length === 0) {
          this.addSystemMessage('No previous sessions found for this workspace.');
          break;
        }
        const items = sessions.map((s: SessionInfo) => ({
          label: s.title,
          description: `${s.model} · ${timeAgo(s.updated)}`,
          detail: s.id,
        }));
        const pick = await vscode.window.showQuickPick(items, {
          title: 'XibeCode — Resume Session',
          placeHolder: 'Select a session to resume',
        });
        if (pick) {
          const ok = await this.agentService.resumeSession(pick.detail);
          if (ok) {
            // Add the "Resumed" system message to history BEFORE sending to webview
            this.agentService['history'].push({
              role: 'system',
              content: `Resumed session: ${pick.label}`,
              timestamp: Date.now(),
            });
            this.postMessage({ type: 'history', messages: await this.getParsedHistory() });
          } else {
            this.addSystemMessage('Failed to resume session.');
          }
        }
        break;
      }

      case '/exit':
        this.agentService.clearHistory();
        this.postMessage({ type: 'history', messages: [] });
        this.addSystemMessage('Session cleared. Start a new conversation.');
        break;

      default: {
        // Try to find a matching command
        const match = SLASH_COMMANDS.find(c => c.name.startsWith(cmd));
        if (match) {
          this.addSystemMessage(`Did you mean ${match.name}? Type /help for all commands.`);
        } else {
          this.addSystemMessage(`Unknown command: ${cmd}. Type /help for available commands.`);
        }
        break;
      }
    }
  }

  /**
   * Guided setup wizard: provider → base URL → API key → model selection.
   * Mirrors the CLI's `/setup` flow using VS Code QuickPick/InputBox.
   */
  private async runSetupWizard(): Promise<void> {
    this.addSystemMessage('Starting setup wizard...');

    // Step 1: Pick provider
    const providerItems: Array<{ label: string; description?: string; detail?: string; provider: ProviderType | 'custom' }> = [
      { label: '$(globe) Routing.run (recommended)', description: 'Cheapest opensource model provider', provider: 'routingrun' },
      { label: '$(globe) zenllm.org (recommended)', description: '200+ models, great pricing', provider: 'zenllm' },
      { label: '$(globe) OpenAI', description: 'GPT models', provider: 'openai' },
      { label: '$(globe) Anthropic', description: 'Claude models', provider: 'anthropic' },
      { label: '$(globe) OpenRouter', description: 'Multi-provider gateway', provider: 'openrouter' },
      { label: '$(globe) DeepSeek', description: 'DeepSeek models', provider: 'deepseek' },
      { label: '$(globe) Google (Gemini)', description: 'Gemini models', provider: 'google' },
      { label: '$(globe) Groq', description: 'Fast inference', provider: 'groq' },
      { label: '$(globe) xAI (Grok)', description: 'Grok models', provider: 'grok' },
      { label: '$(globe) Moonshot (Kimi)', description: 'Kimi models', provider: 'kimi' },
      { label: '$(globe) Alibaba (Qwen)', description: 'Qwen models', provider: 'alibaba' },
      { label: '$(globe) Zhipu AI (z.ai)', description: 'GLM models', provider: 'zai' },
      { label: '$(edit) Custom endpoint...', description: 'Paste your own OpenAI-compatible URL', provider: 'custom' },
    ];

    const providerPick = await vscode.window.showQuickPick(providerItems, {
      title: 'XibeCode Setup — Step 1/3: Choose Provider',
      placeHolder: 'Select your AI provider',
    });

    if (!providerPick) {
      this.addSystemMessage('Setup cancelled.');
      return;
    }

    const selectedProvider = providerPick.provider;
    let baseUrl: string | undefined;

    if (selectedProvider === 'custom') {
      // Step 1b: Custom base URL
      const urlInput = await vscode.window.showInputBox({
        title: 'XibeCode Setup — Custom Base URL',
        prompt: 'Enter the OpenAI-compatible endpoint URL',
        placeHolder: 'https://api.example.com/v1',
        validateInput: (v) => v && !v.startsWith('http') ? 'URL must start with http(s)://' : undefined,
      });
      if (!urlInput) {
        this.addSystemMessage('Setup cancelled.');
        return;
      }
      baseUrl = urlInput.replace(/\/+$/, '');
      await this.configService.setProvider('openai');
    } else {
      const cfg = PROVIDER_CONFIGS[selectedProvider];
      baseUrl = cfg.baseUrl;
      await this.configService.setProvider(selectedProvider);
      this.addSystemMessage(`Provider set to: ${cfg.name}`);
    }

    if (baseUrl) {
      await this.configService.setBaseUrl(baseUrl);
    }

    // Step 2: API Key
    const apiKeyInput = await vscode.window.showInputBox({
      title: 'XibeCode Setup — Step 2/3: Enter API Key',
      prompt: `Enter your API key for the selected provider`,
      password: true,
      ignoreFocusOut: true,
      validateInput: (v) => v && v.trim().length < 10 ? 'API key seems too short — paste the full key' : undefined,
    });

    if (!apiKeyInput) {
      this.addSystemMessage('Setup cancelled — API key is required.');
      return;
    }

    await this.configService.setApiKey(apiKeyInput.trim());
    this.addSystemMessage('API key saved.');

    // Step 3: Pick model — try fetching from /models endpoint first
    this.addSystemMessage('Fetching available models...');
    const models = await this.fetchModelsFromProvider(baseUrl || '', apiKeyInput.trim(), selectedProvider === 'custom' ? undefined : selectedProvider);

    if (models.length > 0) {
      const modelItems = models.map(m => ({ label: m, description: '' }));
      modelItems.push({ label: '(type model ID manually...)', description: 'Enter a custom model ID' });

      const modelPick = await vscode.window.showQuickPick(modelItems, {
        title: `XibeCode Setup — Step 3/3: Select Model (${models.length} available)`,
        placeHolder: 'Choose the default model for the agent',
      });

      if (modelPick) {
        let model: string;
        if (modelPick.label === '(type model ID manually...)') {
          const typed = await vscode.window.showInputBox({
            title: 'XibeCode — Enter Model ID',
            prompt: 'Enter the model identifier',
            placeHolder: this.configService.getDefaultModelForProvider(selectedProvider === 'custom' ? 'openai' : selectedProvider),
          });
          if (!typed) {
            this.addSystemMessage('Setup cancelled at model selection. You can set the model later with /model.');
            return;
          }
          model = typed.trim();
        } else {
          model = modelPick.label;
        }

        await this.configService.setModel(model);
        this.addSystemMessage(`Setup complete! Model: ${model}`);
      } else {
        this.addSystemMessage('Setup complete (model not changed). Use /model or /models to set it later.');
      }
    } else {
      // Fallback: show provider default + manual entry
      const defaultModel = selectedProvider !== 'custom' && selectedProvider in PROVIDER_CONFIGS
        ? PROVIDER_CONFIGS[selectedProvider as keyof typeof PROVIDER_CONFIGS].defaultModel
        : '';
      const typed = await vscode.window.showInputBox({
        title: 'XibeCode Setup — Step 3/3: Enter Model ID',
        prompt: 'Could not fetch models from the endpoint. Enter the model ID manually.',
        placeHolder: defaultModel || 'model-id',
        value: defaultModel,
      });

      if (typed) {
        await this.configService.setModel(typed.trim());
        this.addSystemMessage(`Setup complete! Model: ${typed.trim()}`);
      } else {
        this.addSystemMessage('Setup complete (model not set). Use /model to set it later.');
      }
    }
  }

  /**
   * Fetch available models from the provider's /models endpoint.
   */
  private async fetchModelsFromProvider(baseUrl: string, apiKey: string, provider?: string): Promise<string[]> {
    let url = baseUrl;
    if (!url && provider && provider !== 'custom') {
      const pCfg = PROVIDER_CONFIGS[provider as keyof typeof PROVIDER_CONFIGS];
      if (pCfg) url = pCfg.baseUrl;
    }
    if (!url) return [];

    try {
      const fullUrl = url.replace(/\/+$/, '') + '/models';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const res = await fetch(fullUrl, { headers });
      if (!res.ok) return [];

      const json = await res.json() as { data?: { id?: string }[] };
      return (json.data ?? []).map(m => m.id ?? '').filter(Boolean).sort();
    } catch {
      return [];
    }
  }

  /**
   * Open a model picker that fetches models from the current provider.
   */
  private async runModelPicker(): Promise<void> {
    const apiKey = this.configService.getApiKey();
    if (!apiKey) {
      this.addSystemMessage('No API key configured. Run /setup first.');
      return;
    }

    const provider = this.configService.getProvider();
    const baseUrl = this.configService.getBaseUrl();
    const defaultModel = this.configService.getDefaultModelForProvider(provider);

    this.addSystemMessage('Fetching models from provider...');
    const models = await this.fetchModelsFromProvider(baseUrl || '', apiKey, provider === 'custom' ? undefined : provider);

    if (models.length === 0) {
      // Fallback: built-in list per provider
      const providerModels: Record<string, string[]> = {
        anthropic: ['claude-sonnet-4-6', 'claude-opus-4-20250514', 'claude-3-5-haiku-20241022'],
        openai: ['gpt-5.5', 'gpt-4o', 'gpt-4o-mini'],
        deepseek: ['deepseek-v4', 'deepseek-chat', 'deepseek-reasoner'],
        google: ['gemini-3.0-pro-preview', 'gemini-2.5-flash'],
        openrouter: ['anthropic/claude-sonnet-4-6', 'openai/gpt-5.5'],
        grok: ['grok-4-0709'],
        kimi: ['kimi-k2.6'],
        alibaba: ['qwen3.5-coder-plus'],
        routingrun: ['route/glm-5.1'],
        zenllm: ['zhipu/glm-5.1'],
        zai: ['glm-5.1'],
        groq: ['llama-3.3-70b-versatile'],
      };
      const builtIn = providerModels[provider] || [defaultModel];
      const pick = await vscode.window.showQuickPick([...builtIn, '(type model ID manually...)'], {
        title: `XibeCode — Select Model (${provider})`,
        placeHolder: `Default: ${defaultModel}`,
      });
      if (!pick) return;
      if (pick === '(type model ID manually...)') {
        const typed = await vscode.window.showInputBox({
          title: 'XibeCode — Enter Model ID',
          prompt: 'Enter the model identifier',
          placeHolder: defaultModel,
        });
        if (!typed) return;
        await this.configService.setModel(typed.trim());
        this.addSystemMessage(`Model set to: ${typed.trim()}`);
      } else {
        await this.configService.setModel(pick);
        this.addSystemMessage(`Model set to: ${pick}`);
      }
      return;
    }

    // Models fetched successfully
    const modelItems = models.map(m => ({ label: m, description: m === defaultModel ? '(default)' : '' }));
    modelItems.push({ label: '(type model ID manually...)', description: '' });

    const modelPick = await vscode.window.showQuickPick(modelItems, {
      title: `XibeCode — Select Model (${models.length} available)`,
      placeHolder: `Current: ${this.configService.getModel()}`,
    });

    if (!modelPick) return;

    if (modelPick.label === '(type model ID manually...)') {
      const typed = await vscode.window.showInputBox({
        title: 'XibeCode — Enter Model ID',
        prompt: 'Enter the model identifier',
        placeHolder: defaultModel,
      });
      if (!typed) return;
      await this.configService.setModel(typed.trim());
      this.addSystemMessage(`Model set to: ${typed.trim()}`);
    } else {
      await this.configService.setModel(modelPick.label);
      this.addSystemMessage(`Model set to: ${modelPick.label}`);
    }
  }

  private showHelp(): void {
    const lines = ['### Available Commands\n'];
    for (const cmd of SLASH_COMMANDS) {
      const usage = cmd.usage ? ` \`${cmd.usage}\`` : '';
      lines.push(`- **${cmd.name}**${usage} — ${cmd.description}`);
    }
    lines.push('\n---');
    lines.push('- **Enter** to send · **Shift+Enter** for newline');
    lines.push('- Type **/** to see command autocomplete');
    this.addSystemMessage(lines.join('\n'));
  }

  private addSystemMessage(content: string): void {
    this.agentService['history'].push({ role: 'system', content, timestamp: Date.now() });
    this.postMessage({ type: 'systemMessage', content });
  }

  /**
   * Send a user message programmatically (from commands like "Explain Selection").
   */
  sendUserMessage(text: string): void {
    vscode.commands.executeCommand('xibecode.chatView.focus');
    this.postMessage({ type: 'userMessage', text });
    this.agentService.run(text);
  }

  clearHistory(): void {
    this.agentService.clearHistory();
    this.postMessage({ type: 'history', messages: [] });
  }

  private async getParsedHistory() {
    const history = this.agentService.getHistory();
    return Promise.all(history.map(async (m) => {
      let html: string;
      try {
        const result = await marked.parse(m.content);
        html = typeof result === 'string' ? result : await result;
      } catch {
        html = m.content;
      }
      return { ...m, html };
    }));
  }

  private postMessage(message: unknown): void {
    this.view?.webview.postMessage(message);
  }
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
