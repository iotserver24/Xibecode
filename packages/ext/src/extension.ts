import * as vscode from 'vscode';
import { ChatViewProvider } from './providers/chat-view-provider';
import { AgentService } from './services/agent-service';
import { ConfigService } from './services/config-service';
import { StatusBarManager } from './ui/status-bar';
import { SettingsPanelProvider } from './providers/settings-panel-provider';

let agentService: AgentService;
let configService: ConfigService;
let statusBar: StatusBarManager;
let chatProvider: ChatViewProvider;
let settingsPanel: SettingsPanelProvider;

/**
 * Extension activation entry point.
 * Called when the extension is first activated (on startup or first command).
 */
export function activate(context: vscode.ExtensionContext) {
  // ── Services ──
  configService = new ConfigService();
  agentService = new AgentService(configService);
  statusBar = new StatusBarManager();
  chatProvider = new ChatViewProvider(context.extensionUri, agentService, configService);
  settingsPanel = new SettingsPanelProvider(context.extensionUri);

  // ── Webview provider ──
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('xibecode.chatView', chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // ── Commands ──
  context.subscriptions.push(
    vscode.commands.registerCommand('xibecode.openChat', () => {
      vscode.commands.executeCommand('xibecode.chatView.focus');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('xibecode.openSettings', () => {
      settingsPanel.open();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('xibecode.runTask', async () => {
      const prompt = await vscode.window.showInputBox({
        title: 'XibeCode — Run Task',
        prompt: 'Describe the coding task you want the agent to complete',
        placeHolder: 'e.g. Add input validation to the signup form',
      });
      if (!prompt) return;
      chatProvider.sendUserMessage(prompt);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('xibecode.setApiKey', async () => {
      const key = await vscode.window.showInputBox({
        title: 'XibeCode — Set API Key',
        prompt: 'Enter your API key',
        password: true,
      });
      if (key !== undefined) {
        await configService.setApiKey(key);
        vscode.window.showInformationMessage('XibeCode: API key saved.');
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('xibecode.selectModel', async () => {
      const provider = configService.getProvider();
      const defaultModel = configService.getDefaultModelForProvider(provider);

      // Build model list from provider defaults + common alternatives
      const providerModels: Record<string, string[]> = {
        anthropic: [
          'claude-sonnet-4-6',
          'claude-opus-4-20250514',
          'claude-3-5-haiku-20241022',
        ],
        openai: [
          'gpt-5.5',
          'gpt-4o',
          'gpt-4o-mini',
        ],
        deepseek: [
          'deepseek-v4',
          'deepseek-chat',
          'deepseek-reasoner',
        ],
        google: [
          'gemini-3.0-pro-preview',
          'gemini-2.5-flash',
        ],
        openrouter: [
          'anthropic/claude-sonnet-4-6',
          'openai/gpt-5.5',
        ],
        grok: [
          'grok-4-0709',
        ],
        kimi: [
          'kimi-k2.6',
        ],
        alibaba: [
          'qwen3.5-coder-plus',
        ],
        routingrun: [
          'route/glm-5.1',
        ],
        zenllm: [
          'zhipu/glm-5.1',
        ],
        zai: [
          'glm-5.1',
        ],
        groq: [
          'llama-3.3-70b-versatile',
        ],
      };

      const models = providerModels[provider] || [defaultModel];
      // Add a "type manually" option at the end
      const items = [...models, '(type model ID manually…)'];

      const pick = await vscode.window.showQuickPick(items, {
        title: `XibeCode — Select Model (${provider})`,
        placeHolder: `Default: ${defaultModel}`,
      });

      if (!pick) return;

      let model: string;
      if (pick === '(type model ID manually…)') {
        const typed = await vscode.window.showInputBox({
          title: 'XibeCode — Enter Model ID',
          prompt: 'Enter the model identifier',
          placeHolder: defaultModel,
        });
        if (!typed) return;
        model = typed.trim();
      } else {
        model = pick;
      }

      await configService.setModel(model);
      vscode.window.showInformationMessage(`XibeCode: Model set to ${model}.`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('xibecode.clearHistory', () => {
      chatProvider.clearHistory();
      vscode.window.showInformationMessage('XibeCode: Chat history cleared.');
    }),
  );

  // ── Context menu commands ──
  context.subscriptions.push(
    vscode.commands.registerCommand('xibecode.explainSelection', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selection = editor.document.getText(editor.selection);
      if (!selection) return;
      const lang = editor.document.languageId;
      chatProvider.sendUserMessage(
        `Explain the following ${lang} code:\n\n\`\`\`${lang}\n${selection}\n\`\`\``,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('xibecode.refactorSelection', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selection = editor.document.getText(editor.selection);
      if (!selection) return;
      const lang = editor.document.languageId;
      const filePath = editor.document.uri.fsPath;
      chatProvider.sendUserMessage(
        `Refactor the following code from ${filePath}:\n\n\`\`\`${lang}\n${selection}\n\`\`\`\n\nImprove readability, performance, and maintainability while preserving behavior.`,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('xibecode.addTests', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selection = editor.document.getText(editor.selection);
      if (!selection) return;
      const lang = editor.document.languageId;
      const filePath = editor.document.uri.fsPath;
      chatProvider.sendUserMessage(
        `Generate comprehensive tests for the following code from ${filePath}:\n\n\`\`\`${lang}\n${selection}\n\`\`\``,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('xibecode.fixDiagnostics', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
      if (diagnostics.length === 0) {
        vscode.window.showInformationMessage('No diagnostics found in this file.');
        return;
      }
      const summary = diagnostics
        .map((d) => `Line ${d.range.start.line + 1}: [${d.source ?? ''}] ${d.message}`)
        .join('\n');
      const filePath = editor.document.uri.fsPath;
      chatProvider.sendUserMessage(
        `Fix the following diagnostics/errors in ${filePath}:\n\n${summary}`,
      );
    }),
  );

  // ── Status bar ──
  context.subscriptions.push(statusBar);
  statusBar.setIdle();

  agentService.on('status', (status: string) => {
    if (status === 'running') statusBar.setRunning();
    else statusBar.setIdle();
  });

  console.log('XibeCode extension activated.');
}

/**
 * Extension deactivation cleanup.
 */
export function deactivate() {
  agentService?.dispose();
}
