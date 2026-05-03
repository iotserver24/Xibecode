import * as vscode from 'vscode';

/**
 * Wraps VS Code workspace configuration with typed accessors
 * that mirror the xibecode CLI ConfigManager surface.
 */
export class ConfigService {
  private get config() {
    return vscode.workspace.getConfiguration('xibecode');
  }

  // ── Getters ──

  getApiKey(): string {
    return (
      this.config.get<string>('apiKey') ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY ||
      ''
    );
  }

  getModel(): string {
    return this.config.get<string>('model') || 'claude-sonnet-4-20250514';
  }

  getProvider(): string {
    return this.config.get<string>('provider') || 'anthropic';
  }

  getBaseUrl(): string | undefined {
    return this.config.get<string>('baseUrl') || undefined;
  }

  getMaxIterations(): number {
    return this.config.get<number>('maxIterations') || 150;
  }

  getAutoApproveTools(): boolean {
    return this.config.get<boolean>('autoApproveTools') || false;
  }

  // ── Setters (writes to global settings) ──

  async setApiKey(key: string): Promise<void> {
    await this.config.update('apiKey', key, vscode.ConfigurationTarget.Global);
  }

  async setModel(model: string): Promise<void> {
    await this.config.update('model', model, vscode.ConfigurationTarget.Global);
  }

  async setProvider(provider: string): Promise<void> {
    await this.config.update('provider', provider, vscode.ConfigurationTarget.Global);
  }

  async setBaseUrl(url: string): Promise<void> {
    await this.config.update('baseUrl', url, vscode.ConfigurationTarget.Global);
  }
}
