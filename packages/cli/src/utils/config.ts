import Conf from 'conf';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import {
  MCPServersFileManager,
  PROVIDER_CONFIGS,
  resolveProviderEnvApiKey,
  listSetupProviders,
  type ProviderType,
  type MCPServerConfig,
  type MCPServersConfig,
  type MCPServerConfigLegacy,
} from 'xibecode-core';

export {
  PROVIDER_CONFIGS,
  resolveProviderEnvApiKey,
  listSetupProviders,
  type ProviderType,
  type MCPServerConfig,
  type MCPServersConfig,
  type MCPServerConfigLegacy,
};

/**
 * Built-in cloud defaults for distributed CLI binaries.
 *
 * Override precedence for users remains:
 *   1) XIBECODE_SANDBOX_* runtime env vars
 *   2) xibecode config profile values
 *   3) these default env values (publisher-controlled)
 */
const DEFAULT_SANDBOX_GATEWAY_URL =
  process.env.XIBECODE_DEFAULT_SANDBOX_GATEWAY_URL?.trim() || 'https://cloud.xibeai.in';
const DEFAULT_SANDBOX_AUTH_TOKEN =
  process.env.XIBECODE_DEFAULT_SANDBOX_AUTH_TOKEN?.trim() || 'Xibecode';

export interface XibeCodeConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxIterations?: number;
  defaultVerbose?: boolean;
  preferredPackageManager?: 'pnpm' | 'bun' | 'npm';
  enableDryRunByDefault?: boolean;
  gitCheckpointStrategy?: 'stash' | 'commit';
  testCommandOverride?: string;
  plugins?: string[];
  mcpServers?: MCPServersConfig;
  /** Allowlist patterns for MCP servers (e.g. \"filesystem\", \"name:*\", \"command:mcp-server-*\") */
  allowedMcpServers?: string[];
  /** Denylist patterns for MCP servers (e.g. \"github\", \"name:unsafe*\") */
  deniedMcpServers?: string[];
  /** If true, only managed MCP servers are allowed. */
  allowManagedMcpOnly?: boolean;
  // Provider / endpoints
  provider?: ProviderType;
  customModels?: { id: string; provider: ProviderType }[];
  customProviderFormat?: 'openai' | 'anthropic';
  /**
   * Wire protocol for model calls: follow provider default (auto), or force
   * Anthropic Messages API vs OpenAI Chat Completions.
   */
  requestFormat?: 'auto' | 'openai' | 'anthropic';
  // UI / UX
  theme?: string;
  sessionDirectory?: string;
  showDetails?: boolean;
  showThinking?: boolean;
  compactThreshold?: number;
  defaultEditor?: string;
  statusBarEnabled?: boolean;
  headerMinimal?: boolean;
  // Cost-saving / economy mode
  costMode?: 'normal' | 'economy';
  economyModel?: string;
  economyMaxTokens?: number;
  economyMaxIterations?: number;
  tokenCapPerSession?: number;
  /** Max files to suggest from context pruning (0 = disable). Default 40. */
  maxContextFiles?: number;
  /** Model for strategic/planning tier (multi-model routing). */
  planningModel?: string;
  /** Model for tactical/operational tier (multi-model routing). */
  executionModel?: string;
  /** When true, augment context pruning with PKG-style code graph (AST). */
  usePkgStyleContext?: boolean;
  /** Command execution target. local = host shell, e2b = remote sandbox gateway */
  sandboxMode?: 'local' | 'e2b';
  /** Team gateway URL that fronts E2B sandbox creation/execution */
  sandboxGatewayUrl?: string;
  /** Optional gateway bearer token (not the E2B API key) */
  sandboxAuthToken?: string;
  /** File execution strategy in sandbox mode. */
  sandboxSessionStrategy?: 'host_only' | 'sandbox_full';
  /** Max compressed workspace size (MB) allowed for sandbox_full local_push sync. */
  sandboxSyncMaxMb?: number;
  /** Comma-separated globs to exclude during sandbox_full local_push sync. */
  sandboxSyncExcludeGlobs?: string;
  /**
   * When true (default), build sandbox tarball from git ls-files (tracked + untracked, honoring .gitignore).
   * When false, archive the current directory with tar --exclude only (legacy).
   */
  sandboxSyncRespectGitignore?: boolean;
  /**
   * Fallback provider endpoints for higher connection reliability.
   * Each entry: { provider, model, apiKey, baseUrl? } or "provider|model|apiKey".
   * Also set via env XIBECODE_FALLBACK_PROVIDERS (comma-separated pipe specs).
   */
  fallbackProviders?: Array<{
    id?: string;
    provider?: string;
    model: string;
    apiKey: string;
    baseUrl?: string;
  } | string>;
  /** Telegram bot token for `xibecode gateway` messaging. */
  telegramBotToken?: string;
  /** Default Telegram home chat for cron delivery. */
  telegramHomeChatId?: string;
  /** Discord bot token for gateway. */
  discordBotToken?: string;
  /** Discord home channel id for cron delivery. */
  discordHomeChatId?: string;
  /** Slack bot token (xoxb-). */
  slackBotToken?: string;
  /** Slack app-level token (xapp-) for Socket Mode. */
  slackAppToken?: string;
  /** Slack home channel id for cron delivery. */
  slackHomeChatId?: string;
  /** Default workdir for gateway / cron agent runs. */
  gatewayWorkdir?: string;
}

type XibeCodeMetaConfig = {
  defaultProfile?: string;
};

export class ConfigManager {
  private store: Conf<XibeCodeConfig>;
  private configPath: string;
  private mcpFileManager: MCPServersFileManager;
  private metaStore: Conf<XibeCodeMetaConfig>;
  private profileName: string;

  constructor(profile?: string) {
    // Prefer XIBECODE_HOME (same root as Xibe Daemon / profiles)
    this.configPath =
      process.env.XIBECODE_HOME?.trim() ||
      path.join(os.homedir(), '.xibecode');
    this.mcpFileManager = new MCPServersFileManager();

    this.metaStore = new Conf<XibeCodeMetaConfig>({
      projectName: 'xibecode',
      cwd: this.configPath,
      configName: 'meta',
      defaults: {},
    });

    const resolvedProfile =
      profile?.trim() ||
      process.env.XIBECODE_PROFILE?.trim() ||
      this.metaStore.get('defaultProfile')?.trim() ||
      'default';
    this.profileName = resolvedProfile;

    this.store = new Conf<XibeCodeConfig>({
      projectName: 'xibecode',
      cwd: this.configPath,
      configName: `profile-${resolvedProfile}`,
      defaults: {
        model: 'claude-sonnet-4-5-20250929',
        maxIterations: 0, // 0 = unlimited agent loops
        defaultVerbose: false,
        preferredPackageManager: 'pnpm',
        enableDryRunByDefault: false,
        gitCheckpointStrategy: 'stash',
        plugins: [],
        mcpServers: {},
        customProviderFormat: 'openai',
        theme: 'default',
        showDetails: false,
        showThinking: true,
        compactThreshold: 50000,
        statusBarEnabled: true,
        headerMinimal: false,
        costMode: 'normal',
        economyMaxTokens: 4096,
        economyMaxIterations: 50,
        maxContextFiles: 40,
        usePkgStyleContext: false,
        sandboxMode: 'local',
        sandboxSessionStrategy: 'host_only',
        sandboxSyncMaxMb: 50,
        sandboxSyncExcludeGlobs: '.git,node_modules,.xibecode,dist,build,.next,.turbo,.env,.env.*',
        sandboxSyncRespectGitignore: true,
      },
    });
  }

  getProfileName(): string {
    return this.profileName;
  }

  async listProfiles(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.configPath);
      const names = entries
        .filter((f) => f.startsWith('profile-') && f.endsWith('.json'))
        .map((f) => f.replace(/^profile-/, '').replace(/\.json$/, ''))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      return names.length ? names : ['default'];
    } catch {
      return ['default'];
    }
  }

  getDefaultProfile(): string {
    return this.metaStore.get('defaultProfile')?.trim() || 'default';
  }

  setDefaultProfile(profile: string): void {
    const normalized = profile.trim();
    if (!normalized) throw new Error('Profile name cannot be empty');
    this.metaStore.set('defaultProfile', normalized);
  }

  /**
   * Get configuration value
   */
  get<K extends keyof XibeCodeConfig>(key: K): XibeCodeConfig[K] {
    return this.store.get(key);
  }

  /**
   * Set configuration value
   */
  set<K extends keyof XibeCodeConfig>(key: K, value: XibeCodeConfig[K]): void {
    this.store.set(key, value);
  }

  /**
   * Get all configuration
   */
  getAll(): XibeCodeConfig {
    return this.store.store;
  }

  /**
   * Delete a configuration key
   */
  delete<K extends keyof XibeCodeConfig>(key: K): void {
    this.store.delete(key);
  }

  /**
   * Clear all configuration
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get config file path
   */
  getConfigPath(): string {
    return this.store.path;
  }

  /**
   * Get API key from config or environment.
   * Supports both Anthropic and OpenAI style environment variables so
   * you can switch providers just by changing the model id.
   */
  getApiKey(): string | undefined {
    const stored = this.get('apiKey');
    if (stored?.trim()) return stored.trim();

    const provider = this.get('provider');
    if (provider && provider !== 'custom') {
      const fromProvider = resolveProviderEnvApiKey(provider);
      if (fromProvider) return fromProvider;
    }

    // Fallback: scan every known provider env key
    for (const cfg of Object.values(PROVIDER_CONFIGS)) {
      const primary = process.env[cfg.envKey]?.trim();
      if (primary) return primary;
      const extra = 'envKeys' in cfg ? cfg.envKeys : undefined;
      if (extra) {
        for (const k of extra) {
          const v = process.env[k]?.trim();
          if (v) return v;
        }
      }
    }
    return undefined;
  }

  /**
   * Get base URL from config or environment.
   */
  getBaseUrl(): string | undefined {
    // 1. Check for explicit config override (works for all providers)
    const configBaseUrl = this.get('baseUrl');
    if (configBaseUrl) return configBaseUrl;

    const provider = this.get('provider');

    // 2. Provider-specific BASE_URL env vars (common patterns)
    if (provider === 'anthropic') {
      return process.env.ANTHROPIC_BASE_URL || PROVIDER_CONFIGS.anthropic.baseUrl;
    }
    if (provider === 'openai') {
      return process.env.OPENAI_BASE_URL || PROVIDER_CONFIGS.openai.baseUrl;
    }
    if (provider === 'openrouter' && process.env.OPENROUTER_BASE_URL) {
      return process.env.OPENROUTER_BASE_URL;
    }
    if ((provider === 'grok' || provider === 'xai') && process.env.XAI_BASE_URL) {
      return process.env.XAI_BASE_URL;
    }
    if (provider === 'google' && process.env.GEMINI_BASE_URL) {
      return process.env.GEMINI_BASE_URL;
    }
    if (provider === 'azure-foundry' && process.env.AZURE_FOUNDRY_BASE_URL) {
      return process.env.AZURE_FOUNDRY_BASE_URL;
    }
    if (provider === 'lmstudio' && process.env.LM_BASE_URL) {
      return process.env.LM_BASE_URL;
    }

    // 3. Known provider defaults
    if (provider && provider !== 'custom' && PROVIDER_CONFIGS[provider as keyof typeof PROVIDER_CONFIGS]) {
      const base = PROVIDER_CONFIGS[provider as keyof typeof PROVIDER_CONFIGS].baseUrl;
      return base || undefined;
    }

    // 4. Fallback/Default
    return process.env.ANTHROPIC_BASE_URL || process.env.OPENAI_BASE_URL;
  }

  /**
   * Get model from config or environment.
   * In economy mode, returns economyModel if set, otherwise default.
   */
  getModel(economy?: boolean): string {
    const useEconomy = economy ?? (this.getCostMode() === 'economy');
    if (useEconomy && this.get('economyModel')) {
      return this.get('economyModel')!;
    }
    return this.get('model') || process.env.XIBECODE_MODEL || 'claude-sonnet-4-5-20250929';
  }

  getCostMode(): 'normal' | 'economy' {
    return this.get('costMode') || 'normal';
  }

  getEconomyModel(): string | undefined {
    return this.get('economyModel');
  }

  getEconomyMaxTokens(): number {
    return this.get('economyMaxTokens') ?? 4096;
  }

  getEconomyMaxIterations(): number {
    return this.get('economyMaxIterations') ?? 50;
  }

  getTokenCapPerSession(): number | undefined {
    return this.get('tokenCapPerSession');
  }

  /** Max files to suggest from context pruning; 0 means disabled. */
  getMaxContextFiles(): number {
    const v = this.get('maxContextFiles');
    return v !== undefined && v !== null ? Number(v) : 40;
  }

  getPlanningModel(): string | undefined {
    return this.get('planningModel');
  }

  getExecutionModel(): string | undefined {
    return this.get('executionModel');
  }

  getUsePkgStyleContext(): boolean {
    return this.get('usePkgStyleContext') ?? false;
  }

  getSandboxMode(): 'local' | 'e2b' {
    const envMode = process.env.XIBECODE_SANDBOX_MODE?.trim().toLowerCase();
    if (envMode === 'e2b') return 'e2b';
    if (envMode === 'local') return 'local';
    return this.get('sandboxMode') || 'local';
  }

  getSandboxGatewayUrl(): string | undefined {
    const env = process.env.XIBECODE_SANDBOX_GATEWAY_URL?.trim();
    if (env) return env;
    const configured = this.get('sandboxGatewayUrl')?.trim();
    if (configured) return configured;
    return DEFAULT_SANDBOX_GATEWAY_URL || undefined;
  }

  getSandboxAuthToken(): string | undefined {
    const env = process.env.XIBECODE_SANDBOX_AUTH_TOKEN?.trim();
    if (env) return env;
    const configured = this.get('sandboxAuthToken')?.trim();
    if (configured) return configured;
    return DEFAULT_SANDBOX_AUTH_TOKEN || undefined;
  }

  getSandboxSessionStrategy(): 'host_only' | 'sandbox_full' {
    const strategy = (process.env.XIBECODE_SANDBOX_STRATEGY || this.get('sandboxSessionStrategy') || 'host_only').toLowerCase();
    return strategy === 'sandbox_full' ? 'sandbox_full' : 'host_only';
  }

  getSandboxSyncMaxMb(): number {
    const value = Number(process.env.XIBECODE_SANDBOX_SYNC_MAX_MB || this.get('sandboxSyncMaxMb') || 50);
    return Number.isFinite(value) && value > 0 ? value : 50;
  }

  getSandboxSyncExcludeGlobs(): string[] {
    const raw = process.env.XIBECODE_SANDBOX_SYNC_EXCLUDE || this.get('sandboxSyncExcludeGlobs') || '';
    return String(raw)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  /**
   * Whether sandbox_full sync should use git ls-files + .gitignore rules (default true).
   * Set XIBECODE_SANDBOX_SYNC_RESPECT_GITIGNORE=0 to disable.
   */
  getSandboxSyncRespectGitignore(): boolean {
    const env = process.env.XIBECODE_SANDBOX_SYNC_RESPECT_GITIGNORE?.trim().toLowerCase();
    if (env === '0' || env === 'false' || env === 'no' || env === 'off') return false;
    if (env === '1' || env === 'true' || env === 'yes' || env === 'on') return true;
    const v = this.get('sandboxSyncRespectGitignore');
    return v !== false;
  }

  /**
   * Get preferred theme name
   */
  getTheme(): string {
    return this.get('theme') || 'default';
  }

  /**
   * Get sessions directory override (if any)
   */
  getSessionDirectory(): string | undefined {
    return this.get('sessionDirectory');
  }

  getShowDetails(): boolean {
    const value = this.get('showDetails');
    return value !== undefined ? value : (this.get('defaultVerbose') ?? false);
  }

  getShowThinking(): boolean {
    const value = this.get('showThinking');
    return value !== undefined ? value : true;
  }

  getCompactThreshold(): number {
    return this.get('compactThreshold') || 50000;
  }

  getDefaultEditor(): string {
    return this.get('defaultEditor') || process.env.EDITOR || 'vim';
  }

  isStatusBarEnabled(): boolean {
    const value = this.get('statusBarEnabled');
    return value !== undefined ? value : true;
  }

  isHeaderMinimal(): boolean {
    return this.get('headerMinimal') || false;
  }

  /**
   * Validate configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const apiKey = this.getApiKey();
    if (!apiKey) {
      errors.push('API key is not set. Use: xibecode config --set-key YOUR_KEY');
    }

    const baseUrl = this.get('baseUrl');
    if (baseUrl && !baseUrl.startsWith('http')) {
      errors.push('Base URL must start with http:// or https://');
    }

    if (this.getSandboxMode() === 'e2b' && !this.getSandboxGatewayUrl()) {
      errors.push('Sandbox mode is e2b but sandbox gateway URL is not set. Use: xibecode config --set-sandbox-gateway-url <url>');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Set multiple values at once
   */
  setMultiple(config: Partial<XibeCodeConfig>): void {
    Object.entries(config).forEach(([key, value]) => {
      if (value !== undefined) {
        this.set(key as keyof XibeCodeConfig, value);
      }
    });
  }

  /**
   * Export configuration (excluding sensitive data)
   */
  export(includeSensitive: boolean = false): string {
    const config = this.getAll();

    if (!includeSensitive) {
      const safe = { ...config };
      if (safe.apiKey) {
        safe.apiKey = this.maskApiKey(safe.apiKey);
      }
      return JSON.stringify(safe, null, 2);
    }

    return JSON.stringify(config, null, 2);
  }

  /**
   * Import configuration
   */
  import(configJson: string): void {
    const config = JSON.parse(configJson);
    this.setMultiple(config);
  }

  /**
   * Mask API key for display
   */
  private maskApiKey(key: string): string {
    if (key.length <= 8) return '****';
    return key.slice(0, 8) + '...' + key.slice(-4);
  }

  /**
   * Get display config (with masked sensitive values)
   */
  getDisplayConfig(): Record<string, string> {
    const config = this.getAll();
    return {
      'Profile': this.getProfileName(),
      'API Key': config.apiKey ? this.maskApiKey(config.apiKey) : 'Not set',
      'Provider': config.provider || 'auto-detect',
      'Base URL': config.baseUrl || 'Default',
      'Model': config.model || 'claude-sonnet-4-5-20250929',
      'Max Iterations': config.maxIterations?.toString() || '50',
      'Theme': config.theme || 'default',
      'Show Details': (config.showDetails ?? config.defaultVerbose ?? false).toString(),
      'Show Thinking': (config.showThinking ?? true).toString(),
      'Cost Mode': config.costMode || 'normal',
      'Economy Model': config.economyModel || 'Not set',
      'Sandbox Mode': this.getSandboxMode(),
      'Sandbox Gateway URL': this.getSandboxGatewayUrl() || 'Not set',
      'Sandbox Auth Token': this.getSandboxAuthToken() ? 'set' : 'Not set',
      'Sandbox Session Strategy': this.getSandboxSessionStrategy(),
      'Sandbox Sync Max MB': this.getSandboxSyncMaxMb().toString(),
      'Sandbox Sync Excludes': this.getSandboxSyncExcludeGlobs().join(', ') || 'Not set',
      'Sandbox Sync Respect Gitignore': this.getSandboxSyncRespectGitignore() ? 'true' : 'false',
      'Default Profile': this.getDefaultProfile(),
      'Config Path': this.getConfigPath(),
    };
  }

  /**
   * Get all MCP server configurations
   * Loads from mcp-servers.json file first, falls back to config store
   * Returns as object-based format
   */
  async getMCPServers(): Promise<MCPServersConfig> {
    // Prefer unified multi-scope resolution (project .mcp.json + global + managed override).
    try {
      const { resolveMcpServers } = await import('xibecode-core');
      const resolved = await resolveMcpServers({
        cwd: process.cwd(),
        allowed: this.get('allowedMcpServers') || undefined,
        denied: this.get('deniedMcpServers') || undefined,
        allowManagedOnly: this.get('allowManagedMcpOnly') || undefined,
      });
      return resolved.servers;
    } catch (error) {
      // If multi-scope resolution fails, fall back to the old behavior.
      console.warn(
        `Warning: Failed to resolve MCP servers (multi-scope). Falling back to profile/global: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    try {
      // Try to load from file first
      const fileServers = await this.mcpFileManager.loadMCPServers();
      if (Object.keys(fileServers).length > 0 || (await this.mcpFileManager.fileExists())) {
        return fileServers;
      }
    } catch (error) {
      // If file has errors, fall back to config store
      console.warn(
        `Warning: Failed to load MCP servers from file, using config store: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // Fall back to config store
    return this.get('mcpServers') || {};
  }

  /**
   * Get MCP servers synchronously (for backward compatibility)
   * Uses config store only
   * Returns as object-based format
   */
  getMCPServersSync(): MCPServersConfig {
    return this.get('mcpServers') || {};
  }

  /**
   * Get MCP servers file manager
   */
  getMCPServersFileManager(): MCPServersFileManager {
    return this.mcpFileManager;
  }

  /**
   * Add an MCP server configuration
   */
  addMCPServer(serverName: string, serverConfig: MCPServerConfig): void {
    const servers = this.getMCPServersSync();

    // Check if server with same name already exists
    if (servers[serverName]) {
      throw new Error(`MCP server with name "${serverName}" already exists`);
    }

    servers[serverName] = serverConfig;
    this.set('mcpServers', servers);
  }

  /**
   * Remove an MCP server configuration
   */
  removeMCPServer(serverName: string): boolean {
    const servers = this.getMCPServersSync();

    if (!servers[serverName]) {
      return false; // Server not found
    }

    delete servers[serverName];
    this.set('mcpServers', servers);
    return true;
  }

  /**
   * Get a specific MCP server configuration
   */
  getMCPServer(serverName: string): MCPServerConfig | undefined {
    const servers = this.getMCPServersSync();
    return servers[serverName];
  }

  /**
   * Update an MCP server configuration
   */
  updateMCPServer(serverName: string, updates: Partial<MCPServerConfig>): boolean {
    const servers = this.getMCPServersSync();

    if (!servers[serverName]) {
      return false; // Server not found
    }

    servers[serverName] = { ...servers[serverName], ...updates };
    this.set('mcpServers', servers);
    return true;
  }
}
