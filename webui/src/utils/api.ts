const API_BASE = '';

// Generic fetch wrapper
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// File operations
export const files = {
  read: (path: string) =>
    fetchApi<{ success: boolean; content?: string; error?: string }>('/api/files/read', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),

  write: (path: string, content: string) =>
    fetchApi<{ success: boolean; error?: string }>('/api/files/write', {
      method: 'POST',
      body: JSON.stringify({ path, content }),
    }),

  mkdir: (path: string) =>
    fetchApi<{ success: boolean; error?: string }>('/api/files/mkdir', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),

  delete: (path: string) =>
    fetchApi<{ success: boolean; error?: string }>('/api/files/delete', {
      method: 'DELETE',
      body: JSON.stringify({ path }),
    }),

  rename: (oldPath: string, newPath: string) =>
    fetchApi<{ success: boolean; error?: string }>('/api/files/rename', {
      method: 'POST',
      body: JSON.stringify({ oldPath, newPath }),
    }),

  tree: (path: string = '.', depth: number = 10) =>
    fetchApi<{ success: boolean; tree?: any[]; error?: string }>('/api/files/tree', {
      method: 'POST',
      body: JSON.stringify({ path, depth }),
    }),
};

// Git operations
export const git = {
  status: () =>
    fetchApi<{
      branch: string;
      files: Array<{
        path: string;
        status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed';
        staged: boolean;
      }>;
      ahead: number;
      behind: number;
    }>('/api/git/status'),

  diff: () =>
    fetchApi<{ success: boolean; diff?: string; error?: string }>('/api/git/diff'),

  fileDiff: (path: string, staged: boolean = false) =>
    fetchApi<string>('/api/git/file-diff', {
      method: 'POST',
      body: JSON.stringify({ path, staged }),
    }),

  stage: (files: string[]) =>
    fetchApi<{ success: boolean; error?: string }>('/api/git/stage', {
      method: 'POST',
      body: JSON.stringify({ files }),
    }),

  unstage: (files: string[]) =>
    fetchApi<{ success: boolean; error?: string }>('/api/git/unstage', {
      method: 'POST',
      body: JSON.stringify({ files }),
    }),

  discard: (files: string[]) =>
    fetchApi<{ success: boolean; error?: string }>('/api/git/discard', {
      method: 'POST',
      body: JSON.stringify({ files }),
    }),

  commit: (message: string) =>
    fetchApi<{ success: boolean; commitHash?: string; error?: string }>('/api/git/commit', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
};

// Settings operations
export const settings = {
  get: () =>
    fetchApi<{
      theme: string;
      fontSize: number;
      tabSize: number;
      wordWrap: boolean;
      provider: string;
      model: string;
      apiKey: string;
      baseUrl: string;
      maxTokens: number;
      temperature: number;
    }>('/api/settings'),

  update: (settings: Record<string, any>) =>
    fetchApi<{ success: boolean; error?: string }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
};

// MCP operations
export const mcp = {
  getServers: () =>
    fetchApi<
      Array<{
        name: string;
        command: string;
        args: string[];
        env?: Record<string, string>;
        connected: boolean;
      }>
    >('/api/mcp/servers'),

  addServer: (server: { name: string; command: string; args: string[]; env?: Record<string, string> }) =>
    fetchApi<{ success: boolean; error?: string }>('/api/mcp/servers', {
      method: 'POST',
      body: JSON.stringify(server),
    }),

  removeServer: (name: string) =>
    fetchApi<{ success: boolean; error?: string }>(`/api/mcp/servers/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),

  restartServer: (name: string) =>
    fetchApi<{ success: boolean; error?: string }>(`/api/mcp/servers/${encodeURIComponent(name)}/restart`, {
      method: 'POST',
    }),
};

// Skills operations
export const skills = {
  list: () =>
    fetchApi<
      Array<{
        name: string;
        description: string;
        installed: boolean;
        version?: string;
      }>
    >('/api/skills'),

  install: (name: string) =>
    fetchApi<{ success: boolean; error?: string }>('/api/skills/install', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  uninstall: (name: string) =>
    fetchApi<{ success: boolean; error?: string }>('/api/skills/uninstall', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  search: (query: string) =>
    fetchApi<
      Array<{
        name: string;
        description: string;
        author: string;
        downloads: number;
      }>
    >(`/api/skills/search?q=${encodeURIComponent(query)}`),
};

// Environment variables
export interface EnvVariable {
  key: string;
  value: string;
  comment?: string;
  isComment: boolean;
  raw: string;
}

export interface EnvData {
  success: boolean;
  exists: boolean;
  path: string;
  fullPath: string;
  variables: EnvVariable[];
  raw: string;
  error?: string;
}

export const env = {
  get: () =>
    fetchApi<EnvData>('/api/env'),

  update: (data: { path?: string; variables?: EnvVariable[]; raw?: string }) =>
    fetchApi<{ success: boolean; path?: string; fullPath?: string; error?: string }>('/api/env', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// Project info
export const project = {
  info: () =>
    fetchApi<{
      name: string;
      branch: string;
      version?: string;
    }>('/api/project'),
};

// WebSocket connection
export function createWebSocket(mode: 'bridge' | 'terminal' = 'bridge'): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return new WebSocket(`${protocol}//${host}?mode=${mode}`);
}

// Export as namespaced API object
export const api = {
  files,
  git,
  settings,
  mcp,
  skills,
  project,
  env,
  createWebSocket,
};

// Also export individual functions for direct import
export { files as fileApi };
export { git as gitApi };
export { settings as settingsApi };
export { mcp as mcpApi };
export { skills as skillsApi };
export { project as projectApi };
export { env as envApi };
