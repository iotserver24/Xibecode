import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script - exposes safe IPC methods to the renderer process.
 * The welcome page uses these to communicate with the main process.
 */
contextBridge.exposeInMainWorld('xibecode', {
  // Folder operations
  openFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('open-folder'),

  openRecent: (folderPath: string): Promise<boolean> =>
    ipcRenderer.invoke('open-recent', folderPath),

  // Recent projects
  getRecentProjects: (): Promise<Array<{ path: string; name: string; lastOpened: string }>> =>
    ipcRenderer.invoke('get-recent-projects'),

  removeRecent: (folderPath: string): Promise<Array<{ path: string; name: string; lastOpened: string }>> =>
    ipcRenderer.invoke('remove-recent', folderPath),

  // CLI info
  getCliVersion: (): Promise<string> =>
    ipcRenderer.invoke('get-cli-version'),

  getCliInstalled: (): Promise<boolean> =>
    ipcRenderer.invoke('get-cli-installed'),

  // Git clone
  cloneRepo: (url: string, dest: string): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('clone-repo', url, dest),

  // New project
  newProject: (name: string): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('new-project', name),

  // External links
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('open-external', url),
});
