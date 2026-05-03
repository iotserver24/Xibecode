import * as vscode from 'vscode';
import {
  readConfig,
  writeConfig,
  getActiveProfile,
  type XibeCodeConfig,
} from './xibecode-config-service';
import { PROVIDER_CONFIGS } from 'xibecode-core';

const PROVIDER_KEYS = Object.keys(PROVIDER_CONFIGS) as string[];

const ENV_KEY_MAP: Record<string, string> = {};
for (const [provider, cfg] of Object.entries(PROVIDER_CONFIGS)) {
  ENV_KEY_MAP[provider] = cfg.envKey;
}

const DEFAULT_MODEL_MAP: Record<string, string> = {};
for (const [provider, cfg] of Object.entries(PROVIDER_CONFIGS)) {
  DEFAULT_MODEL_MAP[provider] = cfg.defaultModel.trim();
}

const BASE_URL_MAP: Record<string, string> = {};
for (const [provider, cfg] of Object.entries(PROVIDER_CONFIGS)) {
  BASE_URL_MAP[provider] = cfg.baseUrl;
}
/**
 * Unified configuration service.
 *
 * Reads from the same ~/.xibecode/profile-<name>.json files that the CLI
 * and the Settings panel use. Falls back to VS Code settings, then
 * environment variables (matching PROVIDER_CONFIGS envKey entries).
 */
export class ConfigService {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private profileConfig(): XibeCodeConfig {
    const profile = getActiveProfile();
    return readConfig(profile);
  }

  private vsConfig() {
    return vscode.workspace.getConfiguration('xibecode');
  }

  // ── Getters ──

  getApiKey(): string {
    const profile = this.profileConfig();
    if (profile.apiKey) return profile.apiKey;

    const vsVal = this.vsConfig().get<string>('apiKey');
    if (vsVal) return vsVal;

    // Walk provider-specific env vars in priority order
    const provider = this.getProvider();
    if (provider && provider !== 'custom' && ENV_KEY_MAP[provider]) {
      const envVal = process.env[ENV_KEY_MAP[provider]];
      if (envVal) return envVal;
    }

    // Fallback: check all known env keys
    for (const envKey of Object.values(ENV_KEY_MAP)) {
      const envVal = process.env[envKey];
      if (envVal) return envVal;
    }

    return '';
  }

  getModel(): string {
    const profile = this.profileConfig();
    if (profile.model) return profile.model;

    const vsVal = this.vsConfig().get<string>('model');
    if (vsVal) return vsVal;

    const provider = this.getProvider();
    return DEFAULT_MODEL_MAP[provider] || 'claude-sonnet-4-6';
  }

  getProvider(): string {
    const profile = this.profileConfig();
    if (profile.provider) return profile.provider;

    const vsVal = this.vsConfig().get<string>('provider');
    if (vsVal) return vsVal;

    return 'anthropic';
  }

  getBaseUrl(): string | undefined {
    const profile = this.profileConfig();
    if (profile.baseUrl) return profile.baseUrl;

    const vsVal = this.vsConfig().get<string>('baseUrl');
    if (vsVal) return vsVal;

    const provider = this.getProvider();
    return BASE_URL_MAP[provider];
  }

  getMaxIterations(): number {
    const profile = this.profileConfig();
    if (profile.maxIterations) return profile.maxIterations;

    return this.vsConfig().get<number>('maxIterations') || 150;
  }

  getCostMode(): 'normal' | 'economy' {
    const profile = this.profileConfig();
    return profile.costMode || 'normal';
  }

  getEconomyModel(): string {
    const profile = this.profileConfig();
    return profile.economyModel || '';
  }

  getEconomyMaxIterations(): number {
    const profile = this.profileConfig();
    return profile.economyMaxIterations || 50;
  }

  getPlanningModel(): string {
    const profile = this.profileConfig();
    return profile.planningModel || '';
  }

  getExecutionModel(): string {
    const profile = this.profileConfig();
    return profile.executionModel || '';
  }

  getPreferredPackageManager(): string {
    const profile = this.profileConfig();
    return profile.preferredPackageManager || 'pnpm';
  }

  getTestCommandOverride(): string {
    const profile = this.profileConfig();
    return profile.testCommandOverride || '';
  }

  getShowThinking(): boolean {
    const profile = this.profileConfig();
    return profile.showThinking !== false;
  }

  getDefaultVerbose(): boolean {
    const profile = this.profileConfig();
    return !!profile.defaultVerbose;
  }

  getActiveProfileName(): string {
    return getActiveProfile();
  }

  getAllProviders(): { id: string; name: string }[] {
    return Object.entries(PROVIDER_CONFIGS).map(([id, cfg]) => ({
      id,
      name: cfg.name,
    }));
  }

  getDefaultModelForProvider(provider: string): string {
    return DEFAULT_MODEL_MAP[provider] || '';
  }

  getBaseUrlForProvider(provider: string): string {
    return BASE_URL_MAP[provider] || '';
  }

  // ── Setters (writes to CLI profile files AND VS Code settings) ──

  async setApiKey(key: string): Promise<void> {
    writeConfig({ apiKey: key });
    await this.vsConfig().update('apiKey', key, vscode.ConfigurationTarget.Global);
    this._onDidChange.fire();
  }

  async setModel(model: string): Promise<void> {
    writeConfig({ model });
    await this.vsConfig().update('model', model, vscode.ConfigurationTarget.Global);
    this._onDidChange.fire();
  }

  async setProvider(provider: string): Promise<void> {
    writeConfig({ provider });
    await this.vsConfig().update('provider', provider, vscode.ConfigurationTarget.Global);
    this._onDidChange.fire();
  }

  async setBaseUrl(url: string): Promise<void> {
    writeConfig({ baseUrl: url || undefined });
    await this.vsConfig().update('baseUrl', url, vscode.ConfigurationTarget.Global);
    this._onDidChange.fire();
  }

  async setMaxIterations(n: number): Promise<void> {
    writeConfig({ maxIterations: n });
    await this.vsConfig().update('maxIterations', n, vscode.ConfigurationTarget.Global);
    this._onDidChange.fire();
  }
}
