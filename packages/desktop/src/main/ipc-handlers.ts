import { ipcMain, type BrowserWindow, WebContentsView } from 'electron';
import { AgentHost, type HostedAgentEvent } from './agent-host.js';
import { PreviewServer } from './preview-server.js';
import { FileService } from './file-service.js';
import { ShellService } from './shell-service.js';
import type { AgentMode } from 'xibecode-core';
import { PROVIDER_CONFIGS, type ProviderType } from 'xibecode-core';
import Conf from 'conf';
import * as path from 'path';
import * as os from 'os';

const fileService = new FileService();
const shellService = new ShellService();

interface XibeCodeConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  provider?: ProviderType;
  requestFormat?: 'auto' | 'openai' | 'anthropic';
  costMode?: 'normal' | 'economy';
  economyModel?: string;
  economyMaxTokens?: number;
  theme?: string;
  showDetails?: boolean;
  showThinking?: boolean;
  compactThreshold?: number;
  maxIterations?: number;
  [key: string]: any;
}

function getConfigStore(profile?: string): Conf<XibeCodeConfig> {
  const configPath = path.join(os.homedir(), '.xibecode');
  const resolvedProfile = profile?.trim() || 'default';
  return new Conf<XibeCodeConfig>({
    projectName: 'xibecode',
    cwd: configPath,
    configName: `profile-${resolvedProfile}`,
    defaults: {
      model: 'claude-sonnet-4-5-20250929',
      maxIterations: 50,
      costMode: 'normal',
      requestFormat: 'auto',
    },
  });
}

function getApiKey(store: Conf<XibeCodeConfig>): string | undefined {
  const provider = store.get('provider');
  if (provider === 'anthropic') return store.get('apiKey') || process.env.ANTHROPIC_API_KEY;
  if (provider === 'openai') return store.get('apiKey') || process.env.OPENAI_API_KEY;
  return store.get('apiKey') ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.ROUTINGRUN_API_KEY ||
    process.env.ZENLLM_API_KEY ||
    process.env.XAI_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.GOOGLE_API_KEY;
}

function getBaseUrl(store: Conf<XibeCodeConfig>): string | undefined {
  const configBaseUrl = store.get('baseUrl');
  if (configBaseUrl) return configBaseUrl;
  const provider = store.get('provider');
  if (provider && provider !== 'custom' && PROVIDER_CONFIGS[provider as keyof typeof PROVIDER_CONFIGS]) {
    return PROVIDER_CONFIGS[provider as keyof typeof PROVIDER_CONFIGS].baseUrl;
  }
  return process.env.ANTHROPIC_BASE_URL || process.env.OPENAI_BASE_URL;
}

function getModel(store: Conf<XibeCodeConfig>): string {
  const economy = store.get('costMode') === 'economy';
  if (economy && store.get('economyModel')) return store.get('economyModel')!;
  return store.get('model') || process.env.XIBECODE_MODEL || 'claude-sonnet-4-5-20250929';
}

function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return '****';
  return key.slice(0, 8) + '...' + key.slice(-4);
}

export function registerIpcHandlers(
  agentHost: AgentHost,
  previewServer: PreviewServer,
  mainWindow: BrowserWindow,
  getPreviewView: () => WebContentsView | null,
  setPreviewView: (v: WebContentsView | null) => void,
): void {
  // Forward agent events to renderer
  agentHost.on('agent-events', (batch: HostedAgentEvent[]) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-events', batch);
    }
  });

  // ── Agent ──────────────────────────────────────────────────
  ipcMain.handle('agent:initialize', async (_event, config) => {
    await agentHost.initialize(config);
    return { success: true };
  });

  ipcMain.handle('agent:send-message', async (_event, message: string) => {
    try {
      await agentHost.sendMessage(message, mainWindow);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('agent:switch-mode', async (_event, mode: AgentMode, reason: string) => {
    return agentHost.switchMode(mode, reason);
  });

  ipcMain.handle('agent:get-mode-state', async () => {
    return agentHost.getModeState();
  });

  ipcMain.handle('agent:is-running', async () => {
    return agentHost.isRunning();
  });

  // ── File System ────────────────────────────────────────────
  ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
    return fileService.readFile(filePath);
  });

  ipcMain.handle('fs:write-file', async (_event, filePath: string, content: string) => {
    return fileService.writeFile(filePath, content);
  });

  ipcMain.handle('fs:list-directory', async (_event, dirPath: string) => {
    return fileService.listDirectory(dirPath);
  });

  ipcMain.handle('fs:stat', async (_event, filePath: string) => {
    return fileService.stat(filePath);
  });

  // ── Shell ──────────────────────────────────────────────────
  ipcMain.handle('shell:run', async (_event, command: string, cwd?: string) => {
    return shellService.run(command, cwd);
  });

  // ── Web Preview ────────────────────────────────────────────
  ipcMain.handle('preview:start', async (_event, rootDir: string, port?: number) => {
    const actualPort = await previewServer.start(rootDir, port);
    return { port: actualPort };
  });

  ipcMain.handle('preview:stop', async () => {
    previewServer.stop();
    return { success: true };
  });

  ipcMain.handle('preview:navigate', async (_event, url: string) => {
    let pv = getPreviewView();
    if (!pv) {
      pv = new WebContentsView();
      mainWindow.contentView.addChildView(pv);
      setPreviewView(pv);
    }
    pv.webContents.loadURL(url);
    return { success: true };
  });

  ipcMain.handle('preview:resize', async (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    const pv = getPreviewView();
    if (pv) {
      pv.setBounds(bounds);
    }
    return { success: true };
  });

  ipcMain.handle('preview:close', async () => {
    const pv = getPreviewView();
    if (pv) {
      mainWindow.contentView.removeChildView(pv);
      pv.webContents.close();
      setPreviewView(null);
    }
    return { success: true };
  });

  // ── App ────────────────────────────────────────────────────
  ipcMain.handle('app:get-version', async () => {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const pkg = require('../../package.json');
    return pkg.version;
  });

  ipcMain.handle('app:get-user-data-path', async () => {
    const { app } = await import('electron');
    return app.getPath('userData');
  });

  ipcMain.handle('app:get-working-dir', async () => {
    return process.cwd();
  });

  // ── Config ────────────────────────────────────────────────
  ipcMain.handle('config:get', async (_event, key: string, profile?: string) => {
    const store = getConfigStore(profile);
    return store.get(key);
  });

  ipcMain.handle('config:set', async (_event, key: string, value: any, profile?: string) => {
    const store = getConfigStore(profile);
    store.set(key, value);
    return { success: true };
  });

  ipcMain.handle('config:delete', async (_event, key: string, profile?: string) => {
    const store = getConfigStore(profile);
    store.delete(key);
    return { success: true };
  });

  ipcMain.handle('config:get-api-key', async (_event, profile?: string) => {
    const store = getConfigStore(profile);
    return getApiKey(store) || '';
  });

  ipcMain.handle('config:get-base-url', async (_event, profile?: string) => {
    const store = getConfigStore(profile);
    return getBaseUrl(store) || '';
  });

  ipcMain.handle('config:get-model', async (_event, economy?: boolean, profile?: string) => {
    const store = getConfigStore(profile);
    return getModel(store);
  });

  ipcMain.handle('config:get-provider', async (_event, profile?: string) => {
    const store = getConfigStore(profile);
    return store.get('provider') || '';
  });

  ipcMain.handle('config:get-cost-mode', async (_event, profile?: string) => {
    const store = getConfigStore(profile);
    return store.get('costMode') || 'normal';
  });

  ipcMain.handle('config:get-all', async (_event, profile?: string) => {
    const store = getConfigStore(profile);
    const all = store.store;
    const apiKey = getApiKey(store);
    const baseUrl = getBaseUrl(store);
    const model = getModel(store);
    return {
      'Profile': profile || 'default',
      'API Key': apiKey ? maskApiKey(apiKey) : 'Not set',
      'Provider': all.provider || 'auto-detect',
      'Base URL': baseUrl || 'Default',
      'Model': model,
      'Max Iterations': String(all.maxIterations ?? 50),
      'Wire Format': all.requestFormat || 'auto',
      'Cost Mode': all.costMode || 'normal',
      'Economy Model': all.economyModel || 'Not set',
      'Show Details': String(all.showDetails ?? false),
      'Show Thinking': String(all.showThinking ?? true),
      'Config Path': store.path,
    };
  });

  ipcMain.handle('config:validate', async (_event, profile?: string) => {
    const store = getConfigStore(profile);
    const errors: string[] = [];
    const apiKey = getApiKey(store);
    if (!apiKey) errors.push('API key is not set. Run /setup or open Settings.');
    const baseUrl = store.get('baseUrl');
    if (baseUrl && !baseUrl.startsWith('http')) errors.push('Base URL must start with http:// or https://');
    return { valid: errors.length === 0, errors };
  });

  ipcMain.handle('config:fetch-models', async (_event, baseUrl?: string, apiKey?: string, profile?: string) => {
    const store = getConfigStore(profile);
    const url = (baseUrl || getBaseUrl(store) || '').replace(/\/+$/, '');
    const key = apiKey || getApiKey(store) || '';
    if (!url || !key) throw new Error('Missing baseUrl or apiKey');
    const response = await fetch(`${url}/models`, {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error(`GET /models failed (${response.status})`);
    const payload = (await response.json()) as { data?: Array<{ id?: string }> };
    return (payload.data ?? []).map((e) => e.id ?? '').filter(Boolean).sort();
  });

  ipcMain.handle('config:get-providers', async () => {
    return Object.entries(PROVIDER_CONFIGS).map(([id, cfg]) => ({
      id,
      name: cfg.name,
      baseUrl: cfg.baseUrl,
      format: cfg.format,
      defaultModel: cfg.defaultModel,
    }));
  });

  ipcMain.handle('config:list-profiles', async (_event) => {
    const configPath = path.join(os.homedir(), '.xibecode');
    try {
      const { readdir } = await import('fs/promises');
      const entries = await readdir(configPath);
      const names = entries
        .filter((f) => f.startsWith('profile-') && f.endsWith('.json'))
        .map((f) => f.replace(/^profile-/, '').replace(/\.json$/, ''))
        .filter(Boolean)
        .sort();
      return names.length ? names : ['default'];
    } catch {
      return ['default'];
    }
  });
}
