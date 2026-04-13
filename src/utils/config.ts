import Conf from 'conf';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { MCPServersFileManager } from './mcp-servers-file.js';

export interface MCPServerConfig {
  command: string; // Command to execute
  args?: string[]; // Command arguments
  env?: Record<string, string>; // Environment variables
  /**
   * Optional OAuth configuration for MCP servers that require auth.
   * This is primarily used for remote MCP servers; stdio servers often use env vars instead.
   */
  oauth?: {
    /** Explicit authorization endpoint (preferred if you know it). */
    authorizationUrl?: string;
    /** Explicit token endpoint (preferred if you know it). */
    tokenUrl?: string;
    /** Optional RFC 9728 protected resource metadata URL. */
    protectedResourceMetadataUrl?: string;
    /** Optional RFC 8414 authorization server metadata URL. */
    authServerMetadataUrl?: string;
    clientId?: string;
    scopes?: string[];
  };
}

export const PROVIDER_CONFIGS = {
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-5-20250929',
    format: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    name: 'Anthropic'
  },
  zai: {
    baseUrl: 'https://api.z.ai/v1',
    defaultModel: 'glm-4.7',
    format: 'anthropic',
    envKey: 'ZAI_API_KEY',
    name: 'Zhipu AI (z.ai)'
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    format: 'openai',
    envKey: 'OPENAI_API_KEY',
    name: 'OpenAI'
  },
  alibaba: {
    baseUrl: 'https://coding-intl.dashscope.aliyuncs.com',
    defaultModel: 'qwen3.5-coder-plus',
    format: 'anthropic',
    envKey: 'ALIBABA_API_KEY',
    name: 'Alibaba (Qwen)'
  },
  kimi: {
    baseUrl: 'https://api.moonshot.ai/anthropic',
    defaultModel: 'kimi-k2.5',
    format: 'anthropic',
    envKey: 'MOONSHOT_API_KEY',
    name: 'Moonshot (Kimi)'
  },
  grok: {
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4',
    format: 'openai',
    envKey: 'XAI_API_KEY',
    name: 'xAI (Grok)'
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    format: 'openai',
    envKey: 'DEEPSEEK_API_KEY',
    name: 'DeepSeek'
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    format: 'openai',
    envKey: 'GROQ_API_KEY',
    name: 'Groq'
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    format: 'openai',
    envKey: 'OPENROUTER_API_KEY',
    name: 'OpenRouter'
  },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
    format: 'openai',
    envKey: 'GOOGLE_API_KEY',
    name: 'Google (Gemini)'
  },
} as const;

export type ProviderType = keyof typeof PROVIDER_CONFIGS | 'custom';

// Object-based MCP servers configuration
export interface MCPServersConfig {
  [serverName: string]: MCPServerConfig;
}

// Legacy array-based format (for backward compatibility)
export interface MCPServerConfigLegacy {
  name: string;
  transport: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

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
    this.configPath = path.join(os.homedir(), '.xibecode');
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
        maxIterations: 50,
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
    const provider = this.get('provider');

    if (provider === 'anthropic') {
      return (
        this.get('apiKey') || // generic key
        process.env.ANTHROPIC_API_KEY
      );
    }

    if (provider === 'openai') {
      return (
        this.get('apiKey') || // generic key
        process.env.OPENAI_API_KEY
      );
    }

    // Fallback when provider is not set: try both styles
    return this.get('apiKey') ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.DEEPSEEK_API_KEY ||
      process.env.ZAI_API_KEY ||
      process.env.ALIBABA_API_KEY ||
      process.env.MOONSHOT_API_KEY ||
      process.env.XAI_API_KEY ||
      process.env.GROQ_API_KEY ||
      process.env.OPENROUTER_API_KEY;
  }

  /**
   * Get base URL from config or environment.
   */
  getBaseUrl(): string | undefined {
    // 1. Check for explicit config override (works for all providers)
    const configBaseUrl = this.get('baseUrl');
    if (configBaseUrl) return configBaseUrl;

    // 2. Check for provider-specific environment variables for backward compatibility
    // checking them *before* assertions significantly simplifies things
    const provider = this.get('provider');

    if (provider === 'anthropic') {
      return process.env.ANTHROPIC_BASE_URL || PROVIDER_CONFIGS.anthropic.baseUrl;
    }

    if (provider === 'openai') {
      return process.env.OPENAI_BASE_URL || PROVIDER_CONFIGS.openai.baseUrl;
    }

    // 3. For other known providers, return their default
    if (provider && provider !== 'custom' && PROVIDER_CONFIGS[provider as keyof typeof PROVIDER_CONFIGS]) {
      return PROVIDER_CONFIGS[provider as keyof typeof PROVIDER_CONFIGS].baseUrl;
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
      const { resolveMcpServers } = await import('../core/mcp/resolve-mcp-servers.js');
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
