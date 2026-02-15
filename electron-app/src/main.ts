import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
} from 'electron';
import { execSync, spawn, spawnSync, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as net from 'net';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RecentProject {
  path: string;
  name: string;
  lastOpened: string;
  pinned?: boolean;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const XIBECODE_DIR = path.join(os.homedir(), '.xibecode');
const RECENT_FILE = path.join(XIBECODE_DIR, 'recent-projects.json');

// ---------------------------------------------------------------------------
// Recent-project helpers
// ---------------------------------------------------------------------------
function ensureDir(): void {
  if (!fs.existsSync(XIBECODE_DIR)) {
    fs.mkdirSync(XIBECODE_DIR, { recursive: true });
  }
}

function loadRecentProjects(): RecentProject[] {
  ensureDir();
  if (!fs.existsSync(RECENT_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(RECENT_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveRecentProjects(projects: RecentProject[]): void {
  ensureDir();
  fs.writeFileSync(RECENT_FILE, JSON.stringify(projects, null, 2));
}

function addRecentProject(folderPath: string): void {
  const projects = loadRecentProjects();
  const name = path.basename(folderPath);
  const existing = projects.findIndex((p) => p.path === folderPath);
  if (existing !== -1) projects.splice(existing, 1);
  projects.unshift({ path: folderPath, name, lastOpened: new Date().toISOString() });
  saveRecentProjects(projects.slice(0, 20)); // keep last 20
}

function removeRecentProject(folderPath: string): void {
  const projects = loadRecentProjects().filter((p) => p.path !== folderPath);
  saveRecentProjects(projects);
}

// ---------------------------------------------------------------------------
// CLI detection
// ---------------------------------------------------------------------------
function findCli(): string | null {
  try {
    const cmd = process.platform === 'win32' ? 'where xibecode' : 'which xibecode';
    return execSync(cmd, { encoding: 'utf-8' }).trim().split('\n')[0];
  } catch {
    return null;
  }
}

function getCliVersion(): string | null {
  try {
    return execSync('xibecode --version', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Free-port helper
// ---------------------------------------------------------------------------
function getRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr !== 'string') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('Failed to get port')));
      }
    });
    srv.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Server management
// ---------------------------------------------------------------------------
const servers = new Map<BrowserWindow, ChildProcess>();

async function openFolder(folderPath: string): Promise<void> {
  const cliPath = findCli();
  if (!cliPath) {
    dialog.showErrorBox(
      'XibeCode CLI not found',
      'Install the CLI with:  npm i -g xibecode',
    );
    return;
  }

  const port = await getRandomPort();

  const server = spawn(cliPath, ['ui', '--port', String(port), '--host', '127.0.0.1'], {
    cwd: folderPath,
    stdio: 'pipe',
    env: { ...process.env },
  });

  server.stderr?.on('data', (d: Buffer) => console.error('[xibecode]', d.toString()));

  const ideWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: `XibeCode — ${path.basename(folderPath)}`,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  servers.set(ideWindow, server);

  // Wait for the server to become reachable
  const url = `http://127.0.0.1:${port}`;
  let attempts = 0;
  const maxAttempts = 60; // 30 seconds

  const waitForServer = (): Promise<void> =>
    new Promise((resolve, reject) => {
      const check = () => {
        const req = net.createConnection({ port, host: '127.0.0.1' }, () => {
          req.end();
          resolve();
        });
        req.on('error', () => {
          attempts++;
          if (attempts >= maxAttempts) {
            reject(new Error('Server did not start in time'));
          } else {
            setTimeout(check, 500);
          }
        });
      };
      check();
    });

  try {
    await waitForServer();
    ideWindow.loadURL(url);
  } catch {
    dialog.showErrorBox('Server Error', 'XibeCode server failed to start.');
    server.kill();
    ideWindow.close();
    return;
  }

  ideWindow.on('closed', () => {
    const proc = servers.get(ideWindow);
    if (proc) {
      proc.kill();
      servers.delete(ideWindow);
    }
  });

  addRecentProject(folderPath);
}

// ---------------------------------------------------------------------------
// Welcome window
// ---------------------------------------------------------------------------
function createWelcomeWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 960,
    height: 640,
    title: 'XibeCode',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'src', 'welcome.html'));
  return win;
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
function registerIpc(): void {
  ipcMain.handle('open-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Open Folder',
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const folder = result.filePaths[0];
      openFolder(folder);
      return folder;
    }
    return null;
  });

  ipcMain.handle('open-recent', async (_e, folderPath: string) => {
    if (fs.existsSync(folderPath)) {
      openFolder(folderPath);
      return true;
    }
    removeRecentProject(folderPath);
    return false;
  });

  ipcMain.handle('get-recent-projects', () => loadRecentProjects());

  ipcMain.handle('remove-recent', (_e, folderPath: string) => {
    removeRecentProject(folderPath);
    return true;
  });

  ipcMain.handle('get-cli-version', () => getCliVersion());

  ipcMain.handle('clone-repo', async (_e, url: string, dest: string) => {
    try {
      const result = spawnSync('git', ['clone', url, dest], {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      if (result.status !== 0) {
        return { success: false, error: result.stderr || 'git clone failed' };
      }
      openFolder(dest);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('new-project', async (_e, name: string) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Choose parent directory',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const projectDir = path.join(result.filePaths[0], name);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    openFolder(projectDir);
    return projectDir;
  });

  ipcMain.handle('open-external', (_e, url: string) => {
    shell.openExternal(url);
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  registerIpc();
  createWelcomeWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWelcomeWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Kill remaining servers
  for (const proc of servers.values()) proc.kill();
  servers.clear();
  if (process.platform !== 'darwin') app.quit();
});
