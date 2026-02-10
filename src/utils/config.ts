import Conf from 'conf';
import * as path from 'path';
import * as os from 'os';
import { MCPServersFileManager } from './mcp-servers-file.js';

export interface MCPServerConfig {
  command: string; // Command to execute
  args?: string[]; // Command arguments
  env?: Record<string, string>; // Environment variables
}

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
  // Provider / endpoints
  provider?: 'anthropic' | 'openai';
  anthropicBaseUrl?: string;
  openaiBaseUrl?: string;
   customModels?: { id: string; provider: 'anthropic' | 'openai' }[];
  // UI / UX
  theme?: string;
  sessionDirectory?: string;
  showDetails?: boolean;
  showThinking?: boolean;
  compactThreshold?: number;
  defaultEditor?: string;
  statusBarEnabled?: boolean;
  headerMinimal?: boolean;
}

export class ConfigManager {
  private store: Conf<XibeCodeConfig>;
  private configPath: string;
  private mcpFileManager: MCPServersFileManager;

  constructor() {
    this.configPath = path.join(os.homedir(), '.xibecode');
    this.mcpFileManager = new MCPServersFileManager();
    
    this.store = new Conf<XibeCodeConfig>({
      projectName: 'xibecode',
      cwd: this.configPath,
      defaults: {
        model: 'claude-sonnet-4-5-20250929',
        maxIterations: 50,
        defaultVerbose: false,
        preferredPackageManager: 'pnpm',
        enableDryRunByDefault: false,
        gitCheckpointStrategy: 'stash',
        plugins: [],
        mcpServers: {},
        theme: 'default',
        showDetails: false,
        showThinking: true,
        compactThreshold: 50000,
        statusBarEnabled: true,
        headerMinimal: false,
      },
    });
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
    return this.get('apiKey') || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  }

  /**
   * Get base URL from config or environment.
   * Supports both Anthropic and OpenAI style environment variables.
   */
  getBaseUrl(): string | undefined {
    const provider = this.get('provider');

    if (provider === 'anthropic') {
      return (
        this.get('anthropicBaseUrl') ||
        this.get('baseUrl') ||
        process.env.ANTHROPIC_BASE_URL
      );
    }

    if (provider === 'openai') {
      return (
        this.get('openaiBaseUrl') ||
        this.get('baseUrl') ||
        process.env.OPENAI_BASE_URL
      );
    }

    // Fallback when provider is not set: try generic + envs
    return this.get('baseUrl') || process.env.ANTHROPIC_BASE_URL || process.env.OPENAI_BASE_URL;
  }

  /**
   * Get model from config or environment
   */
  getModel(): string {
    return this.get('model') || process.env.XIBECODE_MODEL || 'claude-sonnet-4-5-20250929';
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

    const baseUrl = this.getBaseUrl();
    if (baseUrl && !baseUrl.startsWith('http')) {
      errors.push('Base URL must start with http:// or https://');
    }

    const anthropicBaseUrl = this.get('anthropicBaseUrl');
    if (anthropicBaseUrl && !anthropicBaseUrl.startsWith('http')) {
      errors.push('Anthropic base URL must start with http:// or https://');
    }

    const openaiBaseUrl = this.get('openaiBaseUrl');
    if (openaiBaseUrl && !openaiBaseUrl.startsWith('http')) {
      errors.push('OpenAI base URL must start with http:// or https://');
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
      'API Key': config.apiKey ? this.maskApiKey(config.apiKey) : 'Not set',
      'Provider': config.provider || 'auto-detect',
      'Base URL': config.baseUrl || 'Generic / legacy',
      'Anthropic Base URL': config.anthropicBaseUrl || 'Default (api.anthropic.com)',
      'OpenAI Base URL': config.openaiBaseUrl || 'Default (api.openai.com)',
      'Model': config.model || 'claude-sonnet-4-5-20250929',
      'Max Iterations': config.maxIterations?.toString() || '50',
      'Theme': config.theme || 'default',
      'Show Details': (config.showDetails ?? config.defaultVerbose ?? false).toString(),
      'Show Thinking': (config.showThinking ?? true).toString(),
      'Config Path': this.getConfigPath(),
    };
  }

  /**
   * Get all MCP server configurations
   * Loads from mcp-servers.json file first, falls back to config store
   * Returns as object-based format
   */
  async getMCPServers(): Promise<MCPServersConfig> {
    try {
      // Try to load from file first
      const fileServers = await this.mcpFileManager.loadMCPServers();
      if (Object.keys(fileServers).length > 0 || await this.mcpFileManager.fileExists()) {
        return fileServers;
      }
    } catch (error) {
      // If file has errors, fall back to config store
      console.warn(`Warning: Failed to load MCP servers from file, using config store: ${error instanceof Error ? error.message : String(error)}`);
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
