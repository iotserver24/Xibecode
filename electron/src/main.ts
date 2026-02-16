import { app, BrowserWindow, dialog, ipcMain, shell, Menu } from 'electron';
import { spawn, execSync, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as net from 'net';

// ── Types ──────────────────────────────────────────────

interface RecentProject {
  path: string;
  name: string;
  lastOpened: string;
}

interface RunningServer {
  process: ChildProcess;
  port: number;
  folder: string;
  window: BrowserWindow;
}

// ── Paths ──────────────────────────────────────────────

const XIBECODE_DIR = path.join(os.homedir(), '.xibecode');
const RECENT_PROJECTS_FILE = path.join(XIBECODE_DIR, 'recent-projects.json');

// ── State ──────────────────────────────────────────────

const runningServers: Map<number, RunningServer> = new Map();
let welcomeWindow: BrowserWindow | null = null;

// ── CLI Detection ──────────────────────────────────────

function findCliPath(): string | null {
  try {
    const cmd = process.platform === 'win32' ? 'where xibecode' : 'which xibecode';
    return execSync(cmd, { encoding: 'utf-8' }).trim().split('\n')[0];
  } catch {
    return null;
  }
}

function getCliVersion(): string {
  try {
    return execSync('xibecode --version', { encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

// ── Recent Projects ────────────────────────────────────

function ensureDir(): void {
  if (!fs.existsSync(XIBECODE_DIR)) {
    fs.mkdirSync(XIBECODE_DIR, { recursive: true });
  }
}

function loadRecentProjects(): RecentProject[] {
  try {
    if (fs.existsSync(RECENT_PROJECTS_FILE)) {
      const data = fs.readFileSync(RECENT_PROJECTS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch { /* ignore */ }
  return [];
}

function saveRecentProjects(projects: RecentProject[]): void {
  ensureDir();
  fs.writeFileSync(RECENT_PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf-8');
}

function addRecentProject(folderPath: string): void {
  const projects = loadRecentProjects();
  const name = path.basename(folderPath);
  const now = new Date().toISOString();

  // Remove if already exists, then add to front
  const filtered = projects.filter(p => p.path !== folderPath);
  filtered.unshift({ path: folderPath, name, lastOpened: now });

  // Keep last 20
  saveRecentProjects(filtered.slice(0, 20));
}

function removeRecentProject(folderPath: string): void {
  const projects = loadRecentProjects();
  saveRecentProjects(projects.filter(p => p.path !== folderPath));
}

// ── Port Finding ───────────────────────────────────────

function findFreePort(startPort: number = 3847): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(startPort, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      // Port in use, try next
      if (startPort < 4847) {
        resolve(findFreePort(startPort + 1));
      } else {
        reject(new Error('No free port found'));
      }
    });
  });
}

// ── Server Management ──────────────────────────────────

async function openFolder(folderPath: string): Promise<void> {
  const cliPath = findCliPath();
  if (!cliPath) {
    dialog.showErrorBox(
      'XibeCode Not Found',
      'xibecode CLI is not installed.\n\nInstall it with:\n  npm install -g xibecode'
    );
    return;
  }

  // Check folder exists
  if (!fs.existsSync(folderPath)) {
    dialog.showErrorBox('Folder Not Found', `The folder does not exist:\n${folderPath}`);
    return;
  }

  addRecentProject(folderPath);

  const port = 3847; // xibecode chat always uses port 3847

  // Create IDE window
  const ideWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: `XibeCode - ${path.basename(folderPath)}`,
    icon: path.join(__dirname, '../assets/icon.png'),
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  // Show loading message
  ideWindow.loadURL(`data:text/html,
    <html>
    <body style="background:#0a0a0a;color:#555;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui">
      <div style="text-align:center">
        <div style="font-size:24px;margin-bottom:8px;color:#888">XibeCode</div>
        <div>Starting server on port ${port}...</div>
      </div>
    </body>
    </html>
  `);
  ideWindow.show();

  // Spawn xibecode chat (starts both the agent AND WebUI server on port 3847)
  const serverProcess = spawn(cliPath, ['chat'], {
    cwd: folderPath,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  const serverInfo: RunningServer = {
    process: serverProcess,
    port,
    folder: folderPath,
    window: ideWindow,
  };
  runningServers.set(port, serverInfo);

  const serverUrl = `http://localhost:${port}`;
  let serverExited = false;

  serverProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[xibecode] ${data.toString().trim()}`);
  });

  serverProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[xibecode stderr] ${data.toString().trim()}`);
  });

  serverProcess.on('exit', (code) => {
    serverExited = true;
    runningServers.delete(port);
    if (!ideWindow.isDestroyed()) {
      ideWindow.loadURL(`data:text/html,
        <html>
        <body style="background:#0a0a0a;color:#f55;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui">
          <div style="text-align:center">
            <div style="font-size:24px;margin-bottom:8px">Server Exited</div>
            <div>xibecode exited with code ${code}</div>
            <div style="margin-top:16px;color:#888;font-size:13px">Try running "xibecode ui" in terminal to debug</div>
          </div>
        </body>
        </html>
      `);
    }
  });

  // Poll the health endpoint until server is ready
  const maxWait = 20000;
  const startTime = Date.now();

  const checkHealth = async () => {
    if (serverExited || ideWindow.isDestroyed()) return;

    try {
      const http = await import('http');
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`${serverUrl}/api/health`, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`Status ${res.statusCode}`));
          }
          res.resume();
        });
        req.on('error', reject);
        req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')); });
      });

      // Server is ready - load the WebUI
      if (!ideWindow.isDestroyed()) {
        ideWindow.loadURL(serverUrl);
        ideWindow.setTitle(`XibeCode - ${path.basename(folderPath)}`);
      }
    } catch {
      // Not ready yet - retry
      if (Date.now() - startTime < maxWait) {
        setTimeout(checkHealth, 500);
      } else {
        // Timeout - try loading anyway
        if (!ideWindow.isDestroyed()) {
          ideWindow.loadURL(serverUrl);
        }
      }
    }
  };

  // Start checking after a short delay
  setTimeout(checkHealth, 800);

  // Clean up server when window closes
  ideWindow.on('closed', () => {
    const server = runningServers.get(port);
    if (server) {
      try {
        server.process.kill('SIGTERM');
        setTimeout(() => {
          try { server.process.kill('SIGKILL'); } catch { /* ignore */ }
        }, 2000);
      } catch { /* ignore */ }
      runningServers.delete(port);
    }

    // If no more IDE windows, show welcome again
    const allWindows = BrowserWindow.getAllWindows().filter(w => w !== welcomeWindow);
    if (allWindows.length === 0 && !welcomeWindow?.isDestroyed()) {
      welcomeWindow?.show();
    }
  });

  // Hide welcome window
  if (welcomeWindow && !welcomeWindow.isDestroyed()) {
    welcomeWindow.hide();
  }
}

// ── Welcome Window ─────────────────────────────────────

function createWelcomeWindow(): void {
  welcomeWindow = new BrowserWindow({
    width: 900,
    height: 620,
    minWidth: 700,
    minHeight: 500,
    title: 'XibeCode',
    icon: path.join(__dirname, '../assets/icon.png'),
    backgroundColor: '#0a0a0a',
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  welcomeWindow.loadFile(path.join(__dirname, '../src/welcome.html'));

  // Remove default menu on production
  if (!process.argv.includes('--dev')) {
    Menu.setApplicationMenu(null);
  }

  welcomeWindow.on('closed', () => {
    welcomeWindow = null;
  });
}

// ── IPC Handlers ───────────────────────────────────────

function setupIPC(): void {
  ipcMain.handle('open-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Open Folder',
    });
    if (!result.canceled && result.filePaths.length > 0) {
      await openFolder(result.filePaths[0]);
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('open-recent', async (_event, folderPath: string) => {
    await openFolder(folderPath);
    return true;
  });

  ipcMain.handle('get-recent-projects', () => {
    return loadRecentProjects();
  });

  ipcMain.handle('remove-recent', (_event, folderPath: string) => {
    removeRecentProject(folderPath);
    return loadRecentProjects();
  });

  ipcMain.handle('get-cli-version', () => {
    return getCliVersion();
  });

  ipcMain.handle('get-cli-installed', () => {
    return findCliPath() !== null;
  });

  ipcMain.handle('clone-repo', async (_event, url: string, destFolder: string) => {
    try {
      const dest = destFolder || path.join(os.homedir(), 'Projects', path.basename(url, '.git'));
      execSync(`git clone ${url} "${dest}"`, { encoding: 'utf-8', timeout: 60000 });
      await openFolder(dest);
      return { success: true, path: dest };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('new-project', async (_event, name: string) => {
    const dest = path.join(os.homedir(), 'Projects', name);
    try {
      fs.mkdirSync(dest, { recursive: true });
      await openFolder(dest);
      return { success: true, path: dest };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('open-external', (_event, url: string) => {
    shell.openExternal(url);
  });
}

// ── App Lifecycle ──────────────────────────────────────

app.whenReady().then(() => {
  setupIPC();
  createWelcomeWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWelcomeWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Kill all running servers
  for (const [, server] of runningServers) {
    try { server.process.kill('SIGTERM'); } catch { /* ignore */ }
  }
  runningServers.clear();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  for (const [, server] of runningServers) {
    try { server.process.kill('SIGKILL'); } catch { /* ignore */ }
  }
});
