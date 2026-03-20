import {
  app, BrowserWindow, dialog, ipcMain, shell, Menu, nativeTheme,
  globalShortcut, Tray, Notification, nativeImage, clipboard,
  systemPreferences, powerMonitor, screen
} from 'electron';
import { spawn, execSync, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as net from 'net';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import * as keytar from 'keytar';

// ── Types ──────────────────────────────────────────────

interface RecentProject {
  path: string;
  name: string;
  lastOpened: string;
  pinned?: boolean;
}

interface RunningServer {
  process: ChildProcess;
  port: number;
  folder: string;
  window: BrowserWindow;
  workspace?: string;
}

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

interface Workspace {
  id: string;
  name: string;
  projects: string[];
  createdAt: string;
}

interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  command: string;
  args: string[];
}

interface AppSettings {
  theme: 'system' | 'light' | 'dark';
  notifications: boolean;
  autoUpdate: boolean;
  minimizeToTray: boolean;
  globalHotkey: string;
  sandboxMode: boolean;
  loggingEnabled: boolean;
  backupEnabled: boolean;
  backupInterval: number;
}

// ── Constants ──────────────────────────────────────────

const SERVICE_NAME = 'XibeCode';
const XIBECODE_DIR = path.join(os.homedir(), '.xibecode');
const RECENT_PROJECTS_FILE = path.join(XIBECODE_DIR, 'recent-projects.json');
const WINDOW_STATE_FILE = path.join(XIBECODE_DIR, 'window-state.json');
const WORKSPACES_FILE = path.join(XIBECODE_DIR, 'workspaces.json');
const SETTINGS_FILE = path.join(XIBECODE_DIR, 'desktop-settings.json');
const ACTIVITY_LOG_FILE = path.join(XIBECODE_DIR, 'activity.log');
const BACKUP_DIR = path.join(XIBECODE_DIR, 'backups');

const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'react-vite',
    name: 'React + Vite',
    description: 'Modern React app with Vite build tool',
    icon: '⚛️',
    command: 'npm',
    args: ['create', 'vite@latest', '{{name}}', '--', '--template', 'react']
  },
  {
    id: 'nextjs',
    name: 'Next.js',
    description: 'Full-stack React framework',
    icon: '▲',
    command: 'npx',
    args: ['create-next-app@latest', '{{name}}']
  },
  {
    id: 'express-api',
    name: 'Express API',
    description: 'Node.js REST API with Express',
    icon: '🟢',
    command: 'npx',
    args: ['express-generator', '{{name}}']
  },
  {
    id: 'fastapi',
    name: 'Python FastAPI',
    description: 'Modern Python web framework',
    icon: '🐍',
    command: 'python3',
    args: ['-m', 'venv', '{{name}}']
  },
  {
    id: 'rust',
    name: 'Rust Project',
    description: 'Cargo-based Rust project',
    icon: '🦀',
    command: 'cargo',
    args: ['new', '{{name}}']
  },
  {
    id: 'go',
    name: 'Go Module',
    description: 'Go project with go.mod',
    icon: '🔵',
    command: 'mkdir',
    args: ['-p', '{{name}}']
  },
  {
    id: 'empty',
    name: 'Empty Project',
    description: 'Start with an empty folder',
    icon: '📁',
    command: 'mkdir',
    args: ['-p', '{{name}}']
  }
];

// ── State ──────────────────────────────────────────────

const runningServers: Map<number, RunningServer> = new Map();
let welcomeWindow: BrowserWindow | null = null;
let quickLauncherWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let currentWorkspace: string | null = null;

// ── Logging ────────────────────────────────────────────

function logActivity(action: string, details?: Record<string, any>) {
  const settings = loadSettings();
  if (!settings.loggingEnabled) return;
  
  const timestamp = new Date().toISOString();
  const entry = { timestamp, action, details };
  const logLine = JSON.stringify(entry) + '\n';
  
  try {
    fs.appendFileSync(ACTIVITY_LOG_FILE, logLine);
  } catch {
    // Ignore logging errors
  }
  
  // Also use electron-log
  log.info(`[${action}]`, details || '');
}

// ── Settings Management ────────────────────────────────

function loadSettings(): AppSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      return { ...getDefaultSettings(), ...JSON.parse(data) };
    }
  } catch {
    log.error('Failed to load settings');
  }
  return getDefaultSettings();
}

function saveSettings(settings: AppSettings): void {
  try {
    ensureDir();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch {
    log.error('Failed to save settings');
  }
}

function getDefaultSettings(): AppSettings {
  return {
    theme: 'system',
    notifications: true,
    autoUpdate: true,
    minimizeToTray: true,
    globalHotkey: 'CommandOrControl+Shift+X',
    sandboxMode: false,
    loggingEnabled: true,
    backupEnabled: true,
    backupInterval: 30
  };
}

// ── Secure Credentials ─────────────────────────────────

async function saveCredential(account: string, password: string): Promise<boolean> {
  try {
    await keytar.setPassword(SERVICE_NAME, account, password);
    return true;
  } catch (err) {
    log.error('Failed to save credential:', err);
    return false;
  }
}

async function getCredential(account: string): Promise<string | null> {
  try {
    return await keytar.getPassword(SERVICE_NAME, account);
  } catch (err) {
    log.error('Failed to get credential:', err);
    return null;
  }
}

async function deleteCredential(account: string): Promise<boolean> {
  try {
    return await keytar.deletePassword(SERVICE_NAME, account);
  } catch (err) {
    log.error('Failed to delete credential:', err);
    return false;
  }
}

// ── Window State Management ────────────────────────────

function loadWindowState(): WindowState {
  try {
    if (fs.existsSync(WINDOW_STATE_FILE)) {
      const data = fs.readFileSync(WINDOW_STATE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch { /* ignore */ }
  return { width: 900, height: 620 };
}

function saveWindowState(window: BrowserWindow): void {
  try {
    const bounds = window.getBounds();
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: window.isMaximized(),
    };
    ensureDir();
    fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch { /* ignore */ }
}

function applyWindowState(window: BrowserWindow): void {
  const state = loadWindowState();
  
  window.setSize(state.width, state.height);
  
  if (state.x !== undefined && state.y !== undefined) {
    const display = screen.getDisplayNearestPoint({ x: state.x, y: state.y });
    const bounds = display.bounds;
    
    // Ensure window is within display bounds
    if (state.x >= bounds.x && state.x < bounds.x + bounds.width &&
        state.y >= bounds.y && state.y < bounds.y + bounds.height) {
      window.setPosition(state.x, state.y);
    } else {
      window.center();
    }
  } else {
    window.center();
  }
  
  if (state.maximized) {
    window.maximize();
  }
}

// ── CLI Detection & Installation ───────────────────────

function getFullPath(): string {
  const home = os.homedir();
  const extraPaths = [
    path.join(home, '.local', 'share', 'pnpm'),
    path.join(home, '.pnpm-global', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.nvm', 'current', 'bin'),
    path.join(home, '.volta', 'bin'),
    path.join(home, '.bun', 'bin'),
    '/usr/local/bin',
    '/usr/bin',
  ];

  if (process.platform === 'win32') {
    extraPaths.push(
      path.join(home, 'AppData', 'Roaming', 'npm'),
      path.join(home, 'AppData', 'Local', 'pnpm'),
      'C:\\Program Files\\nodejs',
    );
  }

  if (process.platform === 'darwin') {
    extraPaths.push('/opt/homebrew/bin', '/usr/local/bin');
  }

  const existing = process.env.PATH || '';
  const combined = [...extraPaths, ...existing.split(path.delimiter)];
  return [...new Set(combined)].join(path.delimiter);
}

const FULL_PATH = getFullPath();
const ENV_WITH_PATH = { ...process.env, PATH: FULL_PATH };

function findCliPath(): string | null {
  const home = os.homedir();
  const candidates = [
    path.join(home, '.local', 'share', 'pnpm', 'xibecode'),
    path.join(home, '.npm-global', 'bin', 'xibecode'),
    '/usr/local/bin/xibecode',
    '/usr/bin/xibecode',
  ];

  if (process.platform === 'win32') {
    candidates.push(
      path.join(home, 'AppData', 'Roaming', 'npm', 'xibecode.cmd'),
      path.join(home, 'AppData', 'Roaming', 'npm', 'xibecode'),
      path.join(home, 'AppData', 'Local', 'pnpm', 'xibecode.cmd'),
    );
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const cmd = process.platform === 'win32' ? 'where xibecode' : 'which xibecode';
    return execSync(cmd, { encoding: 'utf-8', env: ENV_WITH_PATH }).trim().split('\n')[0];
  } catch {
    return null;
  }
}

function getCliVersion(): string {
  try {
    return execSync('xibecode --version', { encoding: 'utf-8', env: ENV_WITH_PATH }).trim();
  } catch {
    return '';
  }
}

function findNpm(): string | null {
  try {
    const cmd = process.platform === 'win32' ? 'where npm' : 'which npm';
    return execSync(cmd, { encoding: 'utf-8', env: ENV_WITH_PATH }).trim().split('\n')[0];
  } catch {
    return null;
  }
}

function installCli(): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const npmPath = findNpm();
    if (!npmPath) {
      resolve({ success: false, error: 'npm not found. Please install Node.js from https://nodejs.org' });
      return;
    }

    const installProcess = spawn(npmPath, ['install', '-g', 'xibecode'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: ENV_WITH_PATH,
      shell: true,
    });

    let stderr = '';

    installProcess.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    installProcess.on('exit', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: stderr || `npm install exited with code ${code}` });
      }
    });

    installProcess.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    setTimeout(() => {
      try { installProcess.kill(); } catch { /* ignore */ }
      resolve({ success: false, error: 'Installation timed out after 2 minutes' });
    }, 120000);
  });
}

// ── Recent Projects ────────────────────────────────────

function ensureDir(): void {
  if (!fs.existsSync(XIBECODE_DIR)) {
    fs.mkdirSync(XIBECODE_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
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

  const existing = projects.find(p => p.path === folderPath);
  const wasPinned = existing?.pinned || false;

  const filtered = projects.filter(p => p.path !== folderPath);
  filtered.unshift({ path: folderPath, name, lastOpened: now, pinned: wasPinned });

  // Sort: pinned first, then by date
  const pinned = filtered.filter(p => p.pinned);
  const unpinned = filtered.filter(p => !p.pinned);
  
  saveRecentProjects([...pinned, ...unpinned.slice(0, 20 - pinned.length)]);
}

function removeRecentProject(folderPath: string): void {
  const projects = loadRecentProjects();
  saveRecentProjects(projects.filter(p => p.path !== folderPath));
}

function togglePinProject(folderPath: string): boolean {
  const projects = loadRecentProjects();
  const project = projects.find(p => p.path === folderPath);
  if (project) {
    project.pinned = !project.pinned;
    // Re-sort
    const pinned = projects.filter(p => p.pinned).sort((a, b) => 
      new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime()
    );
    const unpinned = projects.filter(p => !p.pinned).sort((a, b) => 
      new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime()
    );
    saveRecentProjects([...pinned, ...unpinned]);
    return project.pinned;
  }
  return false;
}

function searchProjects(query: string): RecentProject[] {
  const projects = loadRecentProjects();
  const lowerQuery = query.toLowerCase();
  return projects.filter(p => 
    p.name.toLowerCase().includes(lowerQuery) ||
    p.path.toLowerCase().includes(lowerQuery)
  );
}

// ── Workspaces ─────────────────────────────────────────

function loadWorkspaces(): Workspace[] {
  try {
    if (fs.existsSync(WORKSPACES_FILE)) {
      const data = fs.readFileSync(WORKSPACES_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch { /* ignore */ }
  return [];
}

function saveWorkspaces(workspaces: Workspace[]): void {
  ensureDir();
  fs.writeFileSync(WORKSPACES_FILE, JSON.stringify(workspaces, null, 2), 'utf-8');
}

function createWorkspace(name: string): Workspace {
  const workspace: Workspace = {
    id: Date.now().toString(),
    name,
    projects: [],
    createdAt: new Date().toISOString()
  };
  const workspaces = loadWorkspaces();
  workspaces.push(workspace);
  saveWorkspaces(workspaces);
  return workspace;
}

function addProjectToWorkspace(workspaceId: string, projectPath: string): void {
  const workspaces = loadWorkspaces();
  const workspace = workspaces.find(w => w.id === workspaceId);
  if (workspace && !workspace.projects.includes(projectPath)) {
    workspace.projects.push(projectPath);
    saveWorkspaces(workspaces);
  }
}

function removeProjectFromWorkspace(workspaceId: string, projectPath: string): void {
  const workspaces = loadWorkspaces();
  const workspace = workspaces.find(w => w.id === workspaceId);
  if (workspace) {
    workspace.projects = workspace.projects.filter(p => p !== projectPath);
    saveWorkspaces(workspaces);
  }
}

function deleteWorkspace(workspaceId: string): void {
  const workspaces = loadWorkspaces();
  saveWorkspaces(workspaces.filter(w => w.id !== workspaceId));
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
      if (startPort < 4847) {
        resolve(findFreePort(startPort + 1));
      } else {
        reject(new Error('No free port found'));
      }
    });
  });
}

// ── Backup System ──────────────────────────────────────

async function createBackup(projectPath: string): Promise<string | null> {
  const settings = loadSettings();
  if (!settings.backupEnabled) return null;
  
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const projectName = path.basename(projectPath);
    const backupName = `${projectName}-${timestamp}.tar.gz`;
    const backupPath = path.join(BACKUP_DIR, backupName);
    
    // Create tar.gz backup
    execSync(`tar -czf "${backupPath}" -C "${path.dirname(projectPath)}" "${projectName}"`, {
      timeout: 60000
    });
    
    logActivity('backup_created', { projectPath, backupPath });
    return backupPath;
  } catch (err) {
    log.error('Backup failed:', err);
    return null;
  }
}

function listBackups(projectName?: string): string[] {
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const backups = files.filter(f => f.endsWith('.tar.gz'));
    if (projectName) {
      return backups.filter(f => f.startsWith(projectName + '-'));
    }
    return backups.sort().reverse();
  } catch {
    return [];
  }
}

function restoreBackup(backupName: string, targetPath: string): boolean {
  try {
    const backupPath = path.join(BACKUP_DIR, backupName);
    if (!fs.existsSync(backupPath)) return false;
    
    // Extract backup
    execSync(`tar -xzf "${backupPath}" -C "${targetPath}"`, { timeout: 60000 });
    
    logActivity('backup_restored', { backupName, targetPath });
    return true;
  } catch (err) {
    log.error('Restore failed:', err);
    return false;
  }
}

// ── Notifications ──────────────────────────────────────

function showNotification(title: string, body: string, onClick?: () => void) {
  const settings = loadSettings();
  if (!settings.notifications) return;
  
  const notification = new Notification({
    title,
    body,
    icon: path.join(__dirname, '../assets/icon.png'),
    silent: false
  });
  
  if (onClick) {
    notification.on('click', onClick);
  }
  
  notification.show();
}

// ── Server Management ──────────────────────────────────

async function openFolder(folderPath: string, workspaceId?: string): Promise<void> {
  const cliPath = findCliPath();
  if (!cliPath) {
    dialog.showErrorBox(
      'XibeCode Not Found',
      'xibecode CLI is not installed.\n\nInstall it with:\n  npm install -g xibecode'
    );
    return;
  }

  if (!fs.existsSync(folderPath)) {
    dialog.showErrorBox('Folder Not Found', `The folder does not exist:\n${folderPath}`);
    return;
  }

  // Create backup before opening if enabled
  await createBackup(folderPath);
  
  addRecentProject(folderPath);
  if (workspaceId) {
    addProjectToWorkspace(workspaceId, folderPath);
  }

  const port = 3847;
  
  // Check if already running
  const existingServer = Array.from(runningServers.values()).find(s => s.folder === folderPath);
  if (existingServer) {
    existingServer.window.focus();
    return;
  }

  // Create IDE window with native title bar on macOS
  const isMac = process.platform === 'darwin';
  const ideWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: `XibeCode - ${path.basename(folderPath)}`,
    icon: path.join(__dirname, '../assets/icon.png'),
    backgroundColor: '#0a0a0a',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 15, y: 15 } : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: loadSettings().sandboxMode,
    },
    show: false,
  });

  // Show splash screen
  ideWindow.loadURL(`data:text/html,${encodeURIComponent(getSplashHtml(port))}`);
  ideWindow.show();

  // Spawn xibecode chat
  const serverProcess = spawn(cliPath, ['chat'], {
    cwd: folderPath,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: ENV_WITH_PATH,
  });

  const serverInfo: RunningServer = {
    process: serverProcess,
    port,
    folder: folderPath,
    window: ideWindow,
    workspace: workspaceId || undefined,
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
    
    showNotification(
      'XibeCode Server Stopped',
      `Server for ${path.basename(folderPath)} exited with code ${code}`
    );
    
    if (!ideWindow.isDestroyed()) {
      ideWindow.loadURL(`data:text/html,${encodeURIComponent(getServerErrorHtml(code))}`);
    }
  });

  // Poll health endpoint
  const maxWait = 30000;
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

      if (!ideWindow.isDestroyed()) {
        ideWindow.loadURL(serverUrl);
        ideWindow.setTitle(`XibeCode - ${path.basename(folderPath)}`);
        
        showNotification(
          'Project Opened',
          `${path.basename(folderPath)} is ready`,
          () => ideWindow.focus()
        );
      }
    } catch {
      if (Date.now() - startTime < maxWait) {
        setTimeout(checkHealth, 500);
      } else {
        if (!ideWindow.isDestroyed()) {
          ideWindow.loadURL(serverUrl);
        }
      }
    }
  };

  setTimeout(checkHealth, 800);

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

    const allWindows = BrowserWindow.getAllWindows().filter(w => w !== welcomeWindow);
    if (allWindows.length === 0 && !welcomeWindow?.isDestroyed()) {
      welcomeWindow?.show();
    }
  });

  if (welcomeWindow && !welcomeWindow.isDestroyed()) {
    welcomeWindow.hide();
  }
  
  logActivity('project_opened', { path: folderPath, workspace: workspaceId });
}

// ── HTML Templates ─────────────────────────────────────

function getSplashHtml(port: number): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%);
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .logo {
      font-size: 48px;
      font-weight: bold;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 40px;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    .spinner {
      width: 50px;
      height: 50px;
      border: 3px solid rgba(255,255,255,0.1);
      border-top-color: #667eea;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 30px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .status {
      font-size: 16px;
      color: #888;
      margin-bottom: 10px;
    }
    .port {
      font-size: 14px;
      color: #555;
      font-family: monospace;
    }
    .progress-bar {
      width: 200px;
      height: 4px;
      background: rgba(255,255,255,0.1);
      border-radius: 2px;
      margin-top: 30px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      border-radius: 2px;
      animation: progress 2s ease-in-out infinite;
    }
    @keyframes progress {
      0% { width: 0%; transform: translateX(-100%); }
      50% { width: 100%; transform: translateX(0); }
      100% { width: 100%; transform: translateX(100%); }
    }
  </style>
</head>
<body>
  <div class="logo">XibeCode</div>
  <div class="spinner"></div>
  <div class="status">Starting AI assistant...</div>
  <div class="port">Port ${port}</div>
  <div class="progress-bar">
    <div class="progress-fill"></div>
  </div>
</body>
</html>`;
}

function getServerErrorHtml(code: number | null): string {
  return `
<!DOCTYPE html>
<html>
<body style="background:#0a0a0a;color:#f55;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui">
  <div style="text-align:center">
    <div style="font-size:24px;margin-bottom:8px">⚠️ Server Exited</div>
    <div>xibecode exited with code ${code}</div>
    <div style="margin-top:16px;color:#888;font-size:13px">Try running "xibecode ui" in terminal to debug</div>
  </div>
</body>
</html>`;
}

// ── Welcome Window ─────────────────────────────────────

function createWelcomeWindow(): void {
  const state = loadWindowState();
  
  welcomeWindow = new BrowserWindow({
    width: state.width || 1000,
    height: state.height || 700,
    minWidth: 800,
    minHeight: 500,
    title: 'XibeCode',
    icon: path.join(__dirname, '../assets/icon.png'),
    backgroundColor: '#0a0a0a',
    resizable: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 15, y: 15 } : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  applyWindowState(welcomeWindow);

  welcomeWindow.loadFile(path.join(__dirname, '../src/welcome.html'));

  welcomeWindow.once('ready-to-show', () => {
    welcomeWindow?.show();
  });

  welcomeWindow.on('close', (event) => {
    const settings = loadSettings();
    if (!isQuitting && settings.minimizeToTray && tray) {
      event.preventDefault();
      welcomeWindow?.hide();
    } else if (welcomeWindow) {
      saveWindowState(welcomeWindow);
    }
  });

  welcomeWindow.on('closed', () => {
    welcomeWindow = null;
  });
}

// ── Quick Launcher ─────────────────────────────────────

function createQuickLauncher(): void {
  if (quickLauncherWindow && !quickLauncherWindow.isDestroyed()) {
    quickLauncherWindow.focus();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  quickLauncherWindow = new BrowserWindow({
    width: 600,
    height: 400,
    x: Math.round((width - 600) / 2),
    y: Math.round((height - 400) / 3),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  quickLauncherWindow.loadFile(path.join(__dirname, '../src/launcher.html'));

  quickLauncherWindow.once('ready-to-show', () => {
    quickLauncherWindow?.show();
    quickLauncherWindow?.focus();
  });

  quickLauncherWindow.on('blur', () => {
    quickLauncherWindow?.close();
  });

  quickLauncherWindow.on('closed', () => {
    quickLauncherWindow = null;
  });
}

// ── Settings Window ────────────────────────────────────

function createSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 700,
    height: 600,
    title: 'XibeCode Settings',
    icon: path.join(__dirname, '../assets/icon.png'),
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  settingsWindow.loadFile(path.join(__dirname, '../src/settings.html'));

  settingsWindow.once('ready-to-show', () => {
    settingsWindow?.show();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// ── System Tray ────────────────────────────────────────

function createTray(): void {
  if (tray) return;

  // Create a simple 16x16 icon from the existing icon
  const iconPath = path.join(__dirname, '../assets/icon.png');
  let trayIcon: Electron.NativeImage;
  
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    // Fallback to a blank image if icon fails
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('XibeCode');
  
  updateTrayMenu();
  
  tray.on('click', () => {
    if (welcomeWindow && !welcomeWindow.isDestroyed()) {
      welcomeWindow.show();
      welcomeWindow.focus();
    } else {
      createWelcomeWindow();
    }
  });
}

function updateTrayMenu(): void {
  if (!tray) return;

  const recentProjects = loadRecentProjects().slice(0, 10);
  const workspaces = loadWorkspaces();
  
  const recentMenuItems: Electron.MenuItemConstructorOptions[] = recentProjects.map(p => ({
    label: p.name,
    click: () => openFolder(p.path, p.pinned ? undefined : currentWorkspace || undefined),
  }));

  const workspaceMenuItems: Electron.MenuItemConstructorOptions[] = workspaces.map(w => ({
    label: w.name,
    submenu: [
      ...w.projects.map(p => ({
        label: path.basename(p),
        click: () => openFolder(p, w.id),
      })),
      { type: 'separator' },
      {
        label: 'Open Workspace Projects...',
        click: () => {
          currentWorkspace = w.id;
          w.projects.forEach(p => openFolder(p, w.id));
        }
      }
    ]
  }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open XibeCode',
      click: () => {
        if (welcomeWindow && !welcomeWindow.isDestroyed()) {
          welcomeWindow.show();
        } else {
          createWelcomeWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quick Launcher',
      accelerator: loadSettings().globalHotkey,
      click: createQuickLauncher
    },
    { type: 'separator' },
    {
      label: 'Recent Projects',
      submenu: recentMenuItems.length > 0 ? recentMenuItems : [{ label: 'No recent projects', enabled: false }]
    },
    {
      label: 'Workspaces',
      submenu: workspaceMenuItems.length > 0 ? workspaceMenuItems : [{ label: 'No workspaces', enabled: false }]
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: createSettingsWindow
    },
    {
      label: 'Check for Updates',
      click: () => {
        autoUpdater.checkForUpdatesAndNotify();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

// ── Application Menu ───────────────────────────────────

function createApplicationMenu(): void {
  const isMac = process.platform === 'darwin';
  const settings = loadSettings();
  
  const template: Electron.MenuItemConstructorOptions[] = [
    // App Menu (macOS only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        {
          label: 'Settings...',
          accelerator: 'Cmd+,',
          click: createSettingsWindow
        },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    
    // File Menu
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog({
              properties: ['openDirectory'],
              title: 'Open Folder',
            });
            if (!result.canceled && result.filePaths.length > 0) {
              await openFolder(result.filePaths[0]);
            }
          },
        },
        {
          label: 'New Project...',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => {
            if (welcomeWindow && !welcomeWindow.isDestroyed()) {
              welcomeWindow.webContents.send('menu-new-project');
            }
          },
        },
        { type: 'separator' as const },
        {
          label: 'New Workspace...',
          click: async () => {
            const { response, checkboxChecked } = await dialog.showMessageBox({
              type: 'question',
              buttons: ['Create', 'Cancel'],
              defaultId: 0,
              title: 'New Workspace',
              message: 'Create a new workspace?',
              detail: 'Workspaces help you organize multiple related projects.',
            });
            if (response === 0) {
              // Send to renderer to show workspace name dialog
              welcomeWindow?.webContents.send('menu-new-workspace');
            }
          }
        },
        { type: 'separator' as const },
        ...(isMac ? [] : [{ role: 'quit' as const }]),
      ],
    },
    
    // Edit Menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' as const },
          { role: 'delete' as const },
          { role: 'selectAll' as const },
          { type: 'separator' as const },
          {
            label: 'Speech',
            submenu: [
              { role: 'startSpeaking' as const },
              { role: 'stopSpeaking' as const },
            ],
          },
        ] : [
          { role: 'delete' as const },
          { type: 'separator' as const },
          { role: 'selectAll' as const },
        ]),
      ],
    },
    
    // View Menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: (_, focusedWindow) => {
            if (focusedWindow && 'webContents' in focusedWindow) {
              (focusedWindow as BrowserWindow).webContents.toggleDevTools();
            }
          },
        },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
        { type: 'separator' as const },
        {
          label: 'Quick Launcher',
          accelerator: settings.globalHotkey,
          click: createQuickLauncher
        }
      ],
    },
    
    // Window Menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'close' as const },
        { type: 'separator' as const },
        {
          label: 'Picture-in-Picture',
          click: () => {
            const focused = BrowserWindow.getFocusedWindow();
            if (focused) {
              focused.setAlwaysOnTop(!focused.isAlwaysOnTop());
            }
          },
          type: 'checkbox',
          checked: false
        },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
          { type: 'separator' as const },
          { role: 'window' as const },
        ] : []),
      ],
    },
    
    // Help Menu
    {
      role: 'help' as const,
      submenu: [
        {
          label: 'Documentation',
          click: () => {
            shell.openExternal('https://xibeai.in/docs');
          },
        },
        {
          label: 'GitHub Repository',
          click: () => {
            shell.openExternal('https://github.com/iotserver24/xibecode');
          },
        },
        { type: 'separator' as const },
        {
          label: 'Check for Updates',
          click: () => {
            autoUpdater.checkForUpdatesAndNotify();
          }
        },
        { type: 'separator' as const },
        {
          label: 'Support XibeCode',
          click: () => {
            shell.openExternal('https://xibeai.in/donate');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ── IPC Handlers ───────────────────────────────────────

function setupIPC(): void {
  // Folder operations
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

  ipcMain.handle('toggle-pin-project', (_event, folderPath: string) => {
    return togglePinProject(folderPath);
  });

  ipcMain.handle('search-projects', (_event, query: string) => {
    return searchProjects(query);
  });

  // CLI info
  ipcMain.handle('get-cli-version', () => {
    return getCliVersion();
  });

  ipcMain.handle('get-cli-installed', () => {
    return findCliPath() !== null;
  });

  ipcMain.handle('install-cli', async () => {
    return await installCli();
  });

  ipcMain.handle('has-npm', () => {
    return findNpm() !== null;
  });

  // Git clone
  ipcMain.handle('clone-repo', async (_event, url: string, destFolder: string) => {
    try {
      const dest = destFolder || path.join(os.homedir(), 'Projects', path.basename(url, '.git'));
      execSync(`git clone ${url} "${dest}"`, { encoding: 'utf-8', timeout: 60000 });
      await openFolder(dest);
      logActivity('repo_cloned', { url, dest });
      return { success: true, path: dest };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // New project
  ipcMain.handle('new-project', async (_event, name: string, templateId?: string) => {
    const dest = path.join(os.homedir(), 'Projects', name);
    try {
      fs.mkdirSync(dest, { recursive: true });
      
      // Use template if specified
      if (templateId && templateId !== 'empty') {
        const template = PROJECT_TEMPLATES.find(t => t.id === templateId);
        if (template) {
          const args = template.args.map(arg => arg.replace('{{name}}', name));
          try {
            execSync(`${template.command} ${args.join(' ')}`, {
              cwd: path.dirname(dest),
              timeout: 120000
            });
          } catch (templateErr) {
            log.error('Template creation failed:', templateErr);
          }
        }
      }
      
      await openFolder(dest);
      logActivity('project_created', { name, template: templateId, path: dest });
      return { success: true, path: dest };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Templates
  ipcMain.handle('get-templates', () => {
    return PROJECT_TEMPLATES;
  });

  // Workspaces
  ipcMain.handle('get-workspaces', () => {
    return loadWorkspaces();
  });

  ipcMain.handle('create-workspace', (_event, name: string) => {
    return createWorkspace(name);
  });

  ipcMain.handle('delete-workspace', (_event, workspaceId: string) => {
    deleteWorkspace(workspaceId);
    return loadWorkspaces();
  });

  // External links
  ipcMain.handle('open-external', (_event, url: string) => {
    shell.openExternal(url);
  });

  // Theme
  ipcMain.handle('get-native-theme', () => {
    return {
      shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
      themeSource: nativeTheme.themeSource,
    };
  });

  ipcMain.handle('set-theme-source', (_event, themeSource: 'system' | 'light' | 'dark') => {
    nativeTheme.themeSource = themeSource;
  });

  // Settings
  ipcMain.handle('get-settings', () => {
    return loadSettings();
  });

  ipcMain.handle('save-settings', (_event, settings: AppSettings) => {
    saveSettings(settings);
    // Update global hotkey
    registerGlobalHotkey();
    // Update tray
    updateTrayMenu();
    return true;
  });

  // Credentials
  ipcMain.handle('save-credential', async (_event, account: string, password: string) => {
    return await saveCredential(account, password);
  });

  ipcMain.handle('get-credential', async (_event, account: string) => {
    return await getCredential(account);
  });

  ipcMain.handle('delete-credential', async (_event, account: string) => {
    return await deleteCredential(account);
  });

  // Backups
  ipcMain.handle('list-backups', (_event, projectName?: string) => {
    return listBackups(projectName);
  });

  ipcMain.handle('restore-backup', (_event, backupName: string, targetPath: string) => {
    return restoreBackup(backupName, targetPath);
  });

  // Activity log
  ipcMain.handle('get-activity-log', (_event, limit: number = 100) => {
    try {
      if (!fs.existsSync(ACTIVITY_LOG_FILE)) return [];
      const lines = fs.readFileSync(ACTIVITY_LOG_FILE, 'utf-8').trim().split('\n');
      return lines.slice(-limit).map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(Boolean);
    } catch {
      return [];
    }
  });

  // Performance metrics
  ipcMain.handle('get-performance-metrics', () => {
    return {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
      servers: Array.from(runningServers.entries()).map(([port, server]) => ({
        port,
        folder: path.basename(server.folder),
        uptime: Date.now() // Simplified
      }))
    };
  });

  // Show notification
  ipcMain.handle('show-notification', (_event, title: string, body: string) => {
    showNotification(title, body);
  });

  // Drag and drop
  ipcMain.handle('handle-dropped-folder', async (_event, folderPath: string) => {
    if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
      await openFolder(folderPath);
      return { success: true };
    }
    return { success: false, error: 'Invalid folder' };
  });
}

// ── Global Hotkey ──────────────────────────────────────

function registerGlobalHotkey(): void {
  globalShortcut.unregisterAll();
  
  const settings = loadSettings();
  if (settings.globalHotkey) {
    const registered = globalShortcut.register(settings.globalHotkey, () => {
      createQuickLauncher();
    });
    
    if (!registered) {
      log.warn('Failed to register global hotkey:', settings.globalHotkey);
    }
  }
}

// ── Auto Updater ───────────────────────────────────────

function setupAutoUpdater(): void {
  const settings = loadSettings();
  if (!settings.autoUpdate) return;

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info);
    showNotification(
      'Update Available',
      `XibeCode ${info.version} is available and will be downloaded.`
    );
  });

  autoUpdater.on('update-not-available', () => {
    log.info('Update not available');
  });

  autoUpdater.on('error', (err) => {
    log.error('Update error:', err);
  });

  autoUpdater.on('update-downloaded', (info) => {
    showNotification(
      'Update Ready',
      `XibeCode ${info.version} will be installed on quit.`,
      () => {
        autoUpdater.quitAndInstall();
      }
    );
  });

  // Check for updates on startup
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 5000);
}

// ── Protocol Handler ───────────────────────────────────

function handleProtocol(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'xibecode:') return;
    
    const action = parsed.hostname;
    const params = new URLSearchParams(parsed.search);
    
    switch (action) {
      case 'open':
        const projectPath = params.get('path');
        if (projectPath && fs.existsSync(projectPath)) {
          openFolder(projectPath);
        }
        break;
      case 'clone':
        const repoUrl = params.get('url');
        if (repoUrl) {
          const dest = params.get('dest') || '';
          ipcMain.emit('clone-repo' as any, {}, repoUrl, dest);
        }
        break;
    }
  } catch (err) {
    log.error('Protocol handler error:', err);
  }
}

// ── App Lifecycle ──────────────────────────────────────

app.whenReady().then(() => {
  setupIPC();
  createApplicationMenu();
  createWelcomeWindow();
  createTray();
  registerGlobalHotkey();
  setupAutoUpdater();

  // Handle protocol on macOS
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleProtocol(url);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWelcomeWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Keep running in background if minimizeToTray is enabled
  const settings = loadSettings();
  if (process.platform !== 'darwin' && !settings.minimizeToTray) {
    // Kill all running servers
    for (const [, server] of runningServers) {
      try { server.process.kill('SIGTERM'); } catch { /* ignore */ }
    }
    runningServers.clear();
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  for (const [, server] of runningServers) {
    try { server.process.kill('SIGKILL'); } catch { /* ignore */ }
  }
});

// Handle protocol on Windows/Linux
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('xibecode', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('xibecode');
}

// Handle second instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead
    if (welcomeWindow) {
      if (welcomeWindow.isMinimized()) welcomeWindow.restore();
      welcomeWindow.focus();
    }
    
    // Handle protocol from second instance
    const url = commandLine.find(arg => arg.startsWith('xibecode://'));
    if (url) {
      handleProtocol(url);
    }
  });
}

// Handle file open (macOS)
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    openFolder(filePath);
  }
});

// Handle theme changes
nativeTheme.on('updated', () => {
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send('native-theme-changed', {
      shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
    });
  });
});

// Handle power events
powerMonitor.on('suspend', () => {
  log.info('System suspended');
});

powerMonitor.on('resume', () => {
  log.info('System resumed');
  // Optionally restart servers
});
