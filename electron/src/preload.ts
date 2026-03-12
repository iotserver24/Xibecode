import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script - exposes safe IPC methods to the renderer process.
 */
contextBridge.exposeInMainWorld('xibecode', {
  // Folder operations
  openFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('open-folder'),

  openRecent: (folderPath: string): Promise<boolean> =>
    ipcRenderer.invoke('open-recent', folderPath),

  // Recent projects
  getRecentProjects: (): Promise<Array<{ path: string; name: string; lastOpened: string; pinned?: boolean }>> =>
    ipcRenderer.invoke('get-recent-projects'),

  removeRecent: (folderPath: string): Promise<Array<{ path: string; name: string; lastOpened: string; pinned?: boolean }>> =>
    ipcRenderer.invoke('remove-recent', folderPath),

  togglePinProject: (folderPath: string): Promise<boolean> =>
    ipcRenderer.invoke('toggle-pin-project', folderPath),

  searchProjects: (query: string): Promise<Array<{ path: string; name: string; lastOpened: string; pinned?: boolean }>> =>
    ipcRenderer.invoke('search-projects', query),

  // CLI info
  getCliVersion: (): Promise<string> =>
    ipcRenderer.invoke('get-cli-version'),

  getCliInstalled: (): Promise<boolean> =>
    ipcRenderer.invoke('get-cli-installed'),

  // CLI installation
  installCli: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('install-cli'),

  hasNpm: (): Promise<boolean> =>
    ipcRenderer.invoke('has-npm'),

  // Git clone
  cloneRepo: (url: string, dest: string): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('clone-repo', url, dest),

  // New project
  newProject: (name: string, templateId?: string): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('new-project', name, templateId),

  // Templates
  getTemplates: (): Promise<Array<{ id: string; name: string; description: string; icon: string }>> =>
    ipcRenderer.invoke('get-templates'),

  // Workspaces
  getWorkspaces: (): Promise<Array<{ id: string; name: string; projects: string[]; createdAt: string }>> =>
    ipcRenderer.invoke('get-workspaces'),

  createWorkspace: (name: string): Promise<{ id: string; name: string; projects: string[]; createdAt: string }> =>
    ipcRenderer.invoke('create-workspace', name),

  deleteWorkspace: (workspaceId: string): Promise<Array<{ id: string; name: string; projects: string[]; createdAt: string }>> =>
    ipcRenderer.invoke('delete-workspace', workspaceId),

  // External links
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('open-external', url),

  // Theme Support
  getNativeTheme: (): Promise<{ shouldUseDarkColors: boolean; themeSource: string }> =>
    ipcRenderer.invoke('get-native-theme'),

  setThemeSource: (themeSource: 'system' | 'light' | 'dark'): Promise<void> =>
    ipcRenderer.invoke('set-theme-source', themeSource),

  onThemeChanged: (callback: (event: any, data: { shouldUseDarkColors: boolean }) => void) => {
    ipcRenderer.on('native-theme-changed', callback);
    return () => {
      ipcRenderer.removeListener('native-theme-changed', callback);
    };
  },

  // Settings
  getSettings: (): Promise<{
    theme: 'system' | 'light' | 'dark';
    notifications: boolean;
    autoUpdate: boolean;
    minimizeToTray: boolean;
    globalHotkey: string;
    sandboxMode: boolean;
    loggingEnabled: boolean;
    backupEnabled: boolean;
    backupInterval: number;
  }> =>
    ipcRenderer.invoke('get-settings'),

  saveSettings: (settings: any): Promise<boolean> =>
    ipcRenderer.invoke('save-settings', settings),

  // Credentials
  saveCredential: (account: string, password: string): Promise<boolean> =>
    ipcRenderer.invoke('save-credential', account, password),

  getCredential: (account: string): Promise<string | null> =>
    ipcRenderer.invoke('get-credential', account),

  deleteCredential: (account: string): Promise<boolean> =>
    ipcRenderer.invoke('delete-credential', account),

  // Backups
  listBackups: (projectName?: string): Promise<string[]> =>
    ipcRenderer.invoke('list-backups', projectName),

  restoreBackup: (backupName: string, targetPath: string): Promise<boolean> =>
    ipcRenderer.invoke('restore-backup', backupName, targetPath),

  // Activity log
  getActivityLog: (limit?: number): Promise<Array<{ timestamp: string; action: string; details?: any }>> =>
    ipcRenderer.invoke('get-activity-log', limit),

  // Performance metrics
  getPerformanceMetrics: (): Promise<{
    memory: any;
    cpu: any;
    uptime: number;
    servers: Array<{ port: number; folder: string; uptime: number }>;
  }> =>
    ipcRenderer.invoke('get-performance-metrics'),

  // Notifications
  showNotification: (title: string, body: string): Promise<void> =>
    ipcRenderer.invoke('show-notification', title, body),

  // Drag and drop
  handleDroppedFolder: (folderPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('handle-dropped-folder', folderPath),

  // Menu Events
  onMenuNewProject: (callback: () => void) => {
    ipcRenderer.on('menu-new-project', callback);
    return () => {
      ipcRenderer.removeListener('menu-new-project', callback);
    };
  },

  onMenuNewWorkspace: (callback: () => void) => {
    ipcRenderer.on('menu-new-workspace', callback);
    return () => {
      ipcRenderer.removeListener('menu-new-workspace', callback);
    };
  },
});
