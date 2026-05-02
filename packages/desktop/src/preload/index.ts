import { contextBridge, ipcRenderer } from 'electron';

export interface HostedAgentEvent {
  type: string;
  data: unknown;
  timestamp: number;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;
  modified?: Date;
}

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
}

export interface ModeSwitchResult {
  approved: boolean;
  requiresConfirmation: boolean;
  reason?: string;
}

export interface ModeState {
  current: string;
  previous?: string;
  history: Array<{ mode: string; timestamp: number; reason?: string }>;
}

export interface SessionMetadata {
  id: string;
  title: string;
  model: string;
  cwd: string;
  parentSessionId?: string;
  created: string;
  updated: string;
}

const api = {
  agent: {
    initialize: (config: {
      apiKey: string;
      model: string;
      provider?: string;
      baseUrl?: string;
      workingDir: string;
      mode?: string;
      requestFormat?: string;
    }): Promise<{ success: boolean }> => ipcRenderer.invoke('agent:initialize', config),

    sendMessage: (message: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('agent:send-message', message),

    switchMode: (mode: string, reason: string): Promise<ModeSwitchResult> =>
      ipcRenderer.invoke('agent:switch-mode', mode, reason),

    getModeState: (): Promise<ModeState> => ipcRenderer.invoke('agent:get-mode-state'),

    isRunning: (): Promise<boolean> => ipcRenderer.invoke('agent:is-running'),

    onEvents: (callback: (batch: HostedAgentEvent[]) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, batch: HostedAgentEvent[]) => {
        callback(batch);
      };
      ipcRenderer.on('agent-events', handler);
      return () => {
        ipcRenderer.removeListener('agent-events', handler);
      };
    },
  },

  fs: {
    readFile: (filePath: string): Promise<{ content: string; error?: string }> =>
      ipcRenderer.invoke('fs:read-file', filePath),

    writeFile: (filePath: string, content: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('fs:write-file', filePath, content),

    listDirectory: (dirPath: string): Promise<{ entries: FileEntry[]; error?: string }> =>
      ipcRenderer.invoke('fs:list-directory', dirPath),

    stat: (filePath: string): Promise<{ exists: boolean; isDirectory?: boolean; isFile?: boolean; size?: number; error?: string }> =>
      ipcRenderer.invoke('fs:stat', filePath),
  },

  shell: {
    run: (command: string, cwd?: string): Promise<ShellResult> =>
      ipcRenderer.invoke('shell:run', command, cwd),
  },

  preview: {
    start: (rootDir: string, port?: number): Promise<{ port: number }> =>
      ipcRenderer.invoke('preview:start', rootDir, port),

    stop: (): Promise<{ success: boolean }> => ipcRenderer.invoke('preview:stop'),

    navigate: (url: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('preview:navigate', url),

    resize: (bounds: { x: number; y: number; width: number; height: number }): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('preview:resize', bounds),

    close: (): Promise<{ success: boolean }> => ipcRenderer.invoke('preview:close'),
  },

  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
    getUserDataPath: (): Promise<string> => ipcRenderer.invoke('app:get-user-data-path'),
    getWorkingDir: (): Promise<string> => ipcRenderer.invoke('app:get-working-dir'),
  },

  config: {
    get: (key: string, profile?: string): Promise<any> => ipcRenderer.invoke('config:get', key, profile),
    set: (key: string, value: any, profile?: string): Promise<{ success: boolean }> => ipcRenderer.invoke('config:set', key, value, profile),
    delete: (key: string, profile?: string): Promise<{ success: boolean }> => ipcRenderer.invoke('config:delete', key, profile),
    getApiKey: (profile?: string): Promise<string> => ipcRenderer.invoke('config:get-api-key', profile),
    getBaseUrl: (profile?: string): Promise<string> => ipcRenderer.invoke('config:get-base-url', profile),
    getModel: (economy?: boolean, profile?: string): Promise<string> => ipcRenderer.invoke('config:get-model', economy, profile),
    getProvider: (profile?: string): Promise<string> => ipcRenderer.invoke('config:get-provider', profile),
    getCostMode: (profile?: string): Promise<string> => ipcRenderer.invoke('config:get-cost-mode', profile),
    getAll: (profile?: string): Promise<Record<string, string>> => ipcRenderer.invoke('config:get-all', profile),
    validate: (profile?: string): Promise<{ valid: boolean; errors: string[] }> => ipcRenderer.invoke('config:validate', profile),
    fetchModels: (baseUrl?: string, apiKey?: string, profile?: string): Promise<string[]> => ipcRenderer.invoke('config:fetch-models', baseUrl, apiKey, profile),
    getProviders: (): Promise<Array<{ id: string; name: string; baseUrl: string; format: string; defaultModel: string }>> => ipcRenderer.invoke('config:get-providers'),
    listProfiles: (profile?: string): Promise<string[]> => ipcRenderer.invoke('config:list-profiles', profile),
  },

  session: {
    list: (): Promise<SessionMetadata[]> => ipcRenderer.invoke('session:list'),
    create: (options: { title?: string; model: string; cwd?: string }): Promise<any> => ipcRenderer.invoke('session:create', options),
    load: (id: string): Promise<any | null> => ipcRenderer.invoke('session:load', id),
    save: (session: any): Promise<void> => ipcRenderer.invoke('session:save', session),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('session:delete', id),
  },
};

contextBridge.exposeInMainWorld('xibecode', api);

export type XibeCodeAPI = typeof api;
