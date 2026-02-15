import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('xibecode', {
  openFolder: (): Promise<string | null> => ipcRenderer.invoke('open-folder'),
  openRecent: (path: string): Promise<boolean> => ipcRenderer.invoke('open-recent', path),
  getRecentProjects: (): Promise<
    { path: string; name: string; lastOpened: string; pinned?: boolean }[]
  > => ipcRenderer.invoke('get-recent-projects'),
  cloneRepo: (
    url: string,
    dest: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('clone-repo', url, dest),
  newProject: (name: string): Promise<string | null> =>
    ipcRenderer.invoke('new-project', name),
  getCliVersion: (): Promise<string | null> => ipcRenderer.invoke('get-cli-version'),
  removeRecent: (path: string): Promise<boolean> =>
    ipcRenderer.invoke('remove-recent', path),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('open-external', url),
});
