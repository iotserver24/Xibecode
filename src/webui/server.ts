/**
 * XibeCode WebUI Server
 *
 * A lightweight HTTP server that provides:
 * - REST API for interacting with XibeCode
 * - WebSocket for real-time agent communication
 * - Static file serving for the WebUI frontend
 *
 * @module webui/server
 * @since 0.4.0
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ConfigManager } from '../utils/config.js';
import { EnhancedAgent } from '../core/agent.js';
import { CodingToolExecutor } from '../core/tools.js';
import { GitUtils } from '../utils/git.js';
import { TestRunnerDetector } from '../utils/testRunner.js';
import { TestGenerator, writeTestFile } from '../tools/test-generator.js';
import { SessionBridge } from '../core/session-bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface WebUIServerConfig {
  port: number;
  host: string;
  staticDir?: string;
  workingDir?: string;
}

export interface AgentSession {
  id: string;
  agent: EnhancedAgent | null;
  toolExecutor: CodingToolExecutor;
  messages: any[];
  status: 'idle' | 'running' | 'error';
  createdAt: Date;
  lastActivity: Date;
}

/**
 * Available AI models configuration
 */
export const AVAILABLE_MODELS = [
  // Anthropic Models
  { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', provider: 'anthropic', tier: 'standard' },
  { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', provider: 'anthropic', tier: 'premium' },
  { id: 'claude-haiku-4-5-20251015', name: 'Claude Haiku 4.5', provider: 'anthropic', tier: 'fast' },
  // OpenAI Models
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', tier: 'premium' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', tier: 'fast' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', tier: 'standard' },
  { id: 'o1-preview', name: 'O1 Preview', provider: 'openai', tier: 'reasoning' },
  { id: 'o1-mini', name: 'O1 Mini', provider: 'openai', tier: 'reasoning' },
];

/**
 * WebUI Server for XibeCode
 */
export class WebUIServer {
  private server: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;
  private config: WebUIServerConfig;
  private configManager: ConfigManager;
  private sessions: Map<string, AgentSession> = new Map();
  private wsClients: Map<string, WebSocket> = new Map();
  private workingDir: string;

  constructor(config: Partial<WebUIServerConfig> = {}) {
    this.config = {
      port: config.port || 3847,
      host: config.host || 'localhost',
      staticDir: config.staticDir || path.join(__dirname, '../../webui-dist'),
      workingDir: config.workingDir || process.cwd(),
    };
    this.workingDir = this.config.workingDir!;
    this.configManager = new ConfigManager();
  }

  /**
   * Start the WebUI server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));

      // WebSocket server for real-time communication
      this.wss = new WebSocketServer({ server: this.server });
      this.wss.on('connection', (ws, req) => this.handleWebSocket(ws, req));

      this.server.listen(this.config.port, this.config.host, () => {
        console.log(`XibeCode WebUI running at http://${this.config.host}:${this.config.port}`);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Stop the WebUI server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close all WebSocket connections
      this.wsClients.forEach((ws) => ws.close());
      this.wsClients.clear();

      if (this.wss) {
        this.wss.close();
      }

      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle HTTP requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // API routes
    if (pathname.startsWith('/api/')) {
      await this.handleAPI(req, res, pathname);
      return;
    }

    // Static file serving
    await this.serveStatic(req, res, pathname);
  }

  /**
   * Handle API requests
   */
  private async handleAPI(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    const sendJSON = (data: any, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    const parseBody = async (): Promise<any> => {
      return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch {
            resolve({});
          }
        });
        req.on('error', reject);
      });
    };

    try {
      // Health check
      if (pathname === '/api/health') {
        sendJSON({ status: 'ok', version: '0.4.0' });
        return;
      }

      // Configuration
      if (pathname === '/api/config') {
        if (req.method === 'GET') {
          const config = this.configManager.getDisplayConfig();
          const currentModel = this.configManager.getModel();
          const apiKeySet = !!this.configManager.getApiKey();
          sendJSON({
            ...config,
            apiKeySet,
            currentModel,
            availableModels: AVAILABLE_MODELS,
          });
          return;
        }
        if (req.method === 'PUT') {
          const body = await parseBody();
          if (body.apiKey) this.configManager.set('apiKey', body.apiKey);
          if (body.model) this.configManager.set('model', body.model);
          if (body.provider) this.configManager.set('provider', body.provider);
          if (body.baseUrl) this.configManager.set('baseUrl', body.baseUrl);
          if (body.maxIterations) this.configManager.set('maxIterations', body.maxIterations);
          if (body.theme) this.configManager.set('theme', body.theme);
          sendJSON({ success: true });
          return;
        }
      }

      // Models
      if (pathname === '/api/models') {
        sendJSON({
          models: AVAILABLE_MODELS,
          current: this.configManager.getModel(),
        });
        return;
      }

      // Project info
      if (pathname === '/api/project') {
        const projectInfo = await this.getProjectInfo();
        sendJSON(projectInfo);
        return;
      }

      // Git status
      if (pathname === '/api/git/status') {
        const gitUtils = new GitUtils(this.workingDir);
        try {
          const status = await gitUtils.getStatus();
          sendJSON({ success: true, ...status });
        } catch (error: any) {
          sendJSON({ success: false, error: error.message }, 500);
        }
        return;
      }

      // Git diff
      if (pathname === '/api/git/diff') {
        const gitUtils = new GitUtils(this.workingDir);
        try {
          const diff = await gitUtils.getUnifiedDiff();
          const summary = await gitUtils.getDiffSummary();
          sendJSON({ success: true, diff, summary });
        } catch (error: any) {
          sendJSON({ success: false, error: error.message }, 500);
        }
        return;
      }

      // File operations
      if (pathname === '/api/files/list') {
        const body = await parseBody();
        const dirPath = body.path || '.';
        const fullPath = path.resolve(this.workingDir, dirPath);
        try {
          const entries = await fs.readdir(fullPath, { withFileTypes: true });
          const files = entries.map((entry) => ({
            name: entry.name,
            isDirectory: entry.isDirectory(),
            path: path.join(dirPath, entry.name),
          }));
          sendJSON({ success: true, files });
        } catch (error: any) {
          sendJSON({ success: false, error: error.message }, 500);
        }
        return;
      }

      if (pathname === '/api/files/read') {
        const body = await parseBody();
        if (!body.path) {
          sendJSON({ success: false, error: 'Missing path parameter' }, 400);
          return;
        }
        const fullPath = path.resolve(this.workingDir, body.path);
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          sendJSON({ success: true, content, path: body.path });
        } catch (error: any) {
          sendJSON({ success: false, error: error.message }, 500);
        }
        return;
      }

      // Session management
      if (pathname === '/api/session/create') {
        const sessionId = this.createSession();
        sendJSON({ success: true, sessionId });
        return;
      }

      if (pathname.startsWith('/api/session/') && pathname.endsWith('/message')) {
        const sessionId = pathname.split('/')[3];
        const body = await parseBody();

        if (!body.message) {
          sendJSON({ success: false, error: 'Missing message' }, 400);
          return;
        }

        const session = this.sessions.get(sessionId);
        if (!session) {
          sendJSON({ success: false, error: 'Session not found' }, 404);
          return;
        }

        // Start agent run - responses will be sent via WebSocket
        this.runAgentMessage(sessionId, body.message);
        sendJSON({ success: true, status: 'processing' });
        return;
      }

      // Test generation - use TestGenerator directly to avoid permission checks
      if (pathname === '/api/tests/generate') {
        const body = await parseBody();
        if (!body.filePath) {
          sendJSON({ success: false, error: 'Missing filePath parameter' }, 400);
          return;
        }

        try {
          const generator = new TestGenerator(this.workingDir);
          // First analyze the file
          const analysis = await generator.analyzeFile(body.filePath);
          // Then generate tests from the analysis
          const result = await generator.generateTests(analysis, {
            framework: body.framework,
            outputDir: body.outputDir,
            includeEdgeCases: body.includeEdgeCases !== false,
            includeMocks: body.includeMocks !== false,
            maxTestsPerFunction: body.maxTestsPerFunction || 5,
          });

          // Write file if requested
          if (body.writeFile && result.content) {
            await writeTestFile(result);
            sendJSON({ ...result, outputPath: result.testFilePath, success: true });
          } else {
            sendJSON({ ...result, success: true });
          }
        } catch (error: any) {
          sendJSON({ success: false, error: error.message }, 500);
        }
        return;
      }

      if (pathname === '/api/tests/analyze') {
        const body = await parseBody();
        if (!body.filePath) {
          sendJSON({ success: false, error: 'Missing filePath parameter' }, 400);
          return;
        }

        try {
          const generator = new TestGenerator(this.workingDir);
          const analysis = await generator.analyzeFile(body.filePath);
          sendJSON({ success: true, analysis });
        } catch (error: any) {
          sendJSON({ success: false, error: error.message }, 500);
        }
        return;
      }

      // Run tests
      if (pathname === '/api/tests/run') {
        const body = await parseBody();
        const toolExecutor = new CodingToolExecutor(this.workingDir);
        const result = await toolExecutor.execute('run_tests', {
          command: body.command,
          cwd: body.cwd,
        });
        sendJSON(result);
        return;
      }

      // 404 for unknown API routes
      sendJSON({ error: 'Not found' }, 404);
    } catch (error: any) {
      sendJSON({ error: error.message }, 500);
    }
  }

  /**
   * Serve static files
   */
  private async serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    const staticDir = this.config.staticDir!;

    // Default to index.html for SPA
    let filePath = pathname === '/' ? '/index.html' : pathname;
    let fullPath = path.join(staticDir, filePath);

    // Check if file exists, otherwise serve index.html (SPA fallback)
    if (!fsSync.existsSync(fullPath)) {
      fullPath = path.join(staticDir, 'index.html');
    }

    try {
      const content = await fs.readFile(fullPath);
      const ext = path.extname(fullPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
      };

      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(content);
    } catch {
      // Serve inline fallback HTML if no frontend build exists
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(this.getFallbackHTML());
    }
  }

  /**
   * Handle WebSocket connections
   */
  private handleWebSocket(ws: WebSocket, req: IncomingMessage): void {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('session');
    const mode = url.searchParams.get('mode'); // 'bridge' for TUI sync, null for standalone

    // Register with SessionBridge for TUI-WebUI sync
    if (mode === 'bridge') {
      SessionBridge.registerWebSocket(ws);

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }

          // Forward user messages to TUI via SessionBridge
          if (message.type === 'message' && message.content) {
            SessionBridge.onWebUIUserMessage(message.content);
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      });

      ws.on('close', () => {
        SessionBridge.unregisterWebSocket(ws);
      });

      return;
    }

    // Legacy standalone mode for backward compatibility
    if (sessionId) {
      this.wsClients.set(sessionId, ws);
    }

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        if (message.type === 'message' && message.sessionId && message.content) {
          this.runAgentMessage(message.sessionId, message.content);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      if (sessionId) {
        this.wsClients.delete(sessionId);
      }
    });
  }

  /**
   * Create a new agent session
   */
  private createSession(): string {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const toolExecutor = new CodingToolExecutor(this.workingDir);

    this.sessions.set(sessionId, {
      id: sessionId,
      agent: null,
      toolExecutor,
      messages: [],
      status: 'idle',
      createdAt: new Date(),
      lastActivity: new Date(),
    });

    return sessionId;
  }

  /**
   * Run agent with a message
   */
  private async runAgentMessage(sessionId: string, message: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const ws = this.wsClients.get(sessionId);
    const send = (data: any) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    };

    try {
      session.status = 'running';
      session.lastActivity = new Date();

      const apiKey = this.configManager.getApiKey();
      if (!apiKey) {
        send({ type: 'error', error: 'API key not configured' });
        session.status = 'error';
        return;
      }

      // Create agent if not exists
      if (!session.agent) {
        session.agent = new EnhancedAgent({
          apiKey,
          baseUrl: this.configManager.getBaseUrl(),
          model: this.configManager.getModel(),
          maxIterations: this.configManager.get('maxIterations') || 50,
        });
      }

      const agent = session.agent;

      // Subscribe to agent events
      agent.on('event', (event: any) => {
        switch (event.type) {
          case 'thinking':
            send({ type: 'thinking', message: event.data.message });
            break;
          case 'stream_start':
            send({ type: 'stream_start', persona: event.data.persona });
            break;
          case 'stream_text':
            send({ type: 'stream_text', text: event.data.text });
            break;
          case 'stream_end':
            send({ type: 'stream_end' });
            break;
          case 'tool_call':
            send({
              type: 'tool_call',
              name: event.data.name,
              input: event.data.input,
            });
            break;
          case 'tool_result':
            send({
              type: 'tool_result',
              name: event.data.name,
              success: event.data.success,
            });
            break;
          case 'response':
            send({ type: 'response', text: event.data.text });
            break;
          case 'complete':
            send({ type: 'complete', stats: event.data });
            session.status = 'idle';
            break;
          case 'error':
            send({ type: 'error', error: event.data.message || event.data.error });
            break;
        }
      });

      // Run agent
      const tools = session.toolExecutor.getTools();
      await agent.run(message, tools, session.toolExecutor);

      session.messages.push({ role: 'user', content: message });
      session.status = 'idle';
    } catch (error: any) {
      send({ type: 'error', error: error.message });
      session.status = 'error';
    }
  }

  /**
   * Get project information
   */
  private async getProjectInfo(): Promise<any> {
    const gitUtils = new GitUtils(this.workingDir);
    const testRunner = new TestRunnerDetector(this.workingDir);

    let gitInfo: any = null;
    try {
      gitInfo = await gitUtils.getStatus();
    } catch {
      // Not a git repo
    }

    let testInfo: any = null;
    try {
      testInfo = await testRunner.detectTestRunner();
    } catch {
      // No test runner
    }

    // Read package.json if exists
    let packageJson: any = null;
    try {
      const pkgPath = path.join(this.workingDir, 'package.json');
      packageJson = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
    } catch {
      // No package.json
    }

    return {
      workingDir: this.workingDir,
      name: packageJson?.name || path.basename(this.workingDir),
      version: packageJson?.version,
      description: packageJson?.description,
      isGitRepo: !!gitInfo,
      gitBranch: gitInfo?.branch,
      gitStatus: gitInfo?.clean ? 'clean' : 'dirty',
      testRunner: testInfo?.runner,
      testCommand: testInfo?.command,
      packageManager: testInfo?.packageManager,
      dependencies: packageJson?.dependencies ? Object.keys(packageJson.dependencies).length : 0,
      devDependencies: packageJson?.devDependencies ? Object.keys(packageJson.devDependencies).length : 0,
    };
  }

  /**
   * Fallback HTML when no frontend build exists
   */
  private getFallbackHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>XibeCode WebUI</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: rgba(0,0,0,0.3);
      padding: 1rem 2rem;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    header h1 { font-size: 1.5rem; color: #00d4ff; }
    main {
      flex: 1;
      display: flex;
      max-width: 1400px;
      margin: 0 auto;
      width: 100%;
      padding: 1rem;
      gap: 1rem;
    }
    .sidebar {
      width: 280px;
      background: rgba(0,0,0,0.2);
      border-radius: 8px;
      padding: 1rem;
    }
    .content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .panel {
      background: rgba(0,0,0,0.2);
      border-radius: 8px;
      padding: 1rem;
    }
    .panel h2 {
      font-size: 1rem;
      color: #00d4ff;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .chat-container {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      background: rgba(0,0,0,0.3);
      border-radius: 8px;
      margin-bottom: 1rem;
      min-height: 300px;
    }
    .message {
      margin-bottom: 1rem;
      padding: 0.75rem;
      border-radius: 8px;
    }
    .message.user { background: rgba(0,212,255,0.2); margin-left: 20%; }
    .message.assistant { background: rgba(255,255,255,0.05); margin-right: 20%; }
    .message.system { background: rgba(255,193,7,0.2); text-align: center; font-size: 0.9rem; }
    .input-area {
      display: flex;
      gap: 0.5rem;
    }
    input, select, button {
      padding: 0.75rem 1rem;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      background: rgba(0,0,0,0.3);
      color: #fff;
      font-size: 1rem;
    }
    input { flex: 1; }
    input:focus, select:focus { outline: none; border-color: #00d4ff; }
    button {
      background: linear-gradient(135deg, #00d4ff, #0099ff);
      border: none;
      cursor: pointer;
      font-weight: 600;
    }
    button:hover { opacity: 0.9; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .config-item {
      margin-bottom: 1rem;
    }
    .config-item label {
      display: block;
      font-size: 0.85rem;
      color: #aaa;
      margin-bottom: 0.25rem;
    }
    .config-item input, .config-item select {
      width: 100%;
    }
    .stat {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .stat-label { color: #888; }
    .stat-value { color: #00d4ff; font-weight: 600; }
    .status-indicator {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 0.5rem;
    }
    .status-connected { background: #4caf50; }
    .status-disconnected { background: #f44336; }
    .code-block {
      background: #1e1e1e;
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.85rem;
      white-space: pre-wrap;
    }
    .diff-add { color: #4caf50; }
    .diff-remove { color: #f44336; }
    .tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .tab {
      padding: 0.5rem 1rem;
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 4px;
      cursor: pointer;
    }
    .tab.active {
      background: rgba(0,212,255,0.2);
      border-color: #00d4ff;
    }
    #loading {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.9);
      padding: 2rem;
      border-radius: 8px;
      display: none;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(0,212,255,0.3);
      border-top-color: #00d4ff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <header>
    <h1>XibeCode WebUI</h1>
  </header>

  <main>
    <aside class="sidebar">
      <div class="panel">
        <h2>Project</h2>
        <div id="project-info">Loading...</div>
      </div>

      <div class="panel" style="margin-top: 1rem;">
        <h2>Configuration</h2>
        <div class="config-item">
          <label>Model</label>
          <select id="model-select">
            <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5</option>
            <option value="claude-opus-4-5-20251101">Claude Opus 4.5</option>
            <option value="claude-haiku-4-5-20251015">Claude Haiku 4.5</option>
            <option value="gpt-4o">GPT-4o</option>
            <option value="gpt-4o-mini">GPT-4o Mini</option>
          </select>
        </div>
        <div class="config-item">
          <label>API Key</label>
          <input type="password" id="api-key" placeholder="Enter API key">
        </div>
        <button onclick="saveConfig()" style="width: 100%;">Save Config</button>
      </div>

      <div class="panel" style="margin-top: 1rem;">
        <h2>Status</h2>
        <div class="stat">
          <span class="stat-label">WebSocket</span>
          <span class="stat-value"><span id="ws-status" class="status-indicator status-disconnected"></span><span id="ws-text">Disconnected</span></span>
        </div>
        <div class="stat">
          <span class="stat-label">Session</span>
          <span class="stat-value" id="session-id">None</span>
        </div>
      </div>
    </aside>

    <div class="content">
      <div class="tabs">
        <div class="tab active" onclick="showTab('chat')">Chat</div>
        <div class="tab" onclick="showTab('diff')">Visual Diff</div>
        <div class="tab" onclick="showTab('tests')">Test Generator</div>
      </div>

      <div id="tab-chat" class="panel chat-container">
        <div class="messages" id="messages">
          <div class="message system">Welcome to XibeCode WebUI. Start chatting with the AI agent below.</div>
        </div>
        <div class="input-area">
          <input type="text" id="user-input" placeholder="Type your message..." onkeydown="if(event.key==='Enter')sendMessage()">
          <button onclick="sendMessage()" id="send-btn">Send</button>
        </div>
      </div>

      <div id="tab-diff" class="panel" style="display: none;">
        <h2>Visual Diff</h2>
        <button onclick="loadDiff()">Refresh Diff</button>
        <div id="diff-content" class="code-block" style="margin-top: 1rem;">
          Click "Refresh Diff" to load git changes.
        </div>
      </div>

      <div id="tab-tests" class="panel" style="display: none;">
        <h2>AI Test Generator</h2>
        <div class="config-item">
          <label>File Path</label>
          <input type="text" id="test-file-path" placeholder="src/utils/helpers.ts">
        </div>
        <div class="config-item">
          <label>Framework</label>
          <select id="test-framework">
            <option value="">Auto-detect</option>
            <option value="vitest">Vitest</option>
            <option value="jest">Jest</option>
            <option value="mocha">Mocha</option>
            <option value="pytest">pytest</option>
            <option value="go">Go test</option>
          </select>
        </div>
        <button onclick="generateTests()">Generate Tests</button>
        <button onclick="analyzeCode()" style="margin-left: 0.5rem;">Analyze Code</button>
        <div id="test-output" class="code-block" style="margin-top: 1rem; max-height: 400px; overflow-y: auto;">
          Enter a file path and click "Generate Tests" to create test cases.
        </div>
      </div>
    </div>
  </main>

  <div id="loading">
    <div class="spinner"></div>
    <div>Processing...</div>
  </div>

  <script>
    let ws = null;
    let sessionId = null;
    let currentTab = 'chat';

    // Initialize
    document.addEventListener('DOMContentLoaded', async () => {
      await loadConfig();
      await loadProjectInfo();
      await createSession();
    });

    function showTab(tab) {
      currentTab = tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('[id^="tab-"]').forEach(t => t.style.display = 'none');
      document.querySelector(\`.tab:nth-child(\${tab === 'chat' ? 1 : tab === 'diff' ? 2 : 3})\`).classList.add('active');
      document.getElementById('tab-' + tab).style.display = tab === 'chat' ? 'flex' : 'block';
    }

    async function loadConfig() {
      try {
        const res = await fetch('/api/config');
        const config = await res.json();
        document.getElementById('model-select').value = config.currentModel || 'claude-sonnet-4-5-20250929';
        if (config.apiKeySet) {
          document.getElementById('api-key').placeholder = '••••••••';
        }
      } catch (e) {
        console.error('Failed to load config:', e);
      }
    }

    async function saveConfig() {
      const model = document.getElementById('model-select').value;
      const apiKey = document.getElementById('api-key').value;

      try {
        await fetch('/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, apiKey: apiKey || undefined }),
        });
        addMessage('system', 'Configuration saved!');
      } catch (e) {
        addMessage('system', 'Failed to save configuration');
      }
    }

    async function loadProjectInfo() {
      try {
        const res = await fetch('/api/project');
        const info = await res.json();
        document.getElementById('project-info').innerHTML = \`
          <div class="stat"><span class="stat-label">Name</span><span class="stat-value">\${info.name}</span></div>
          <div class="stat"><span class="stat-label">Git Branch</span><span class="stat-value">\${info.gitBranch || 'N/A'}</span></div>
          <div class="stat"><span class="stat-label">Status</span><span class="stat-value">\${info.gitStatus || 'N/A'}</span></div>
          <div class="stat"><span class="stat-label">Test Runner</span><span class="stat-value">\${info.testRunner || 'None'}</span></div>
          <div class="stat"><span class="stat-label">Dependencies</span><span class="stat-value">\${info.dependencies}</span></div>
        \`;
      } catch (e) {
        document.getElementById('project-info').textContent = 'Failed to load';
      }
    }

    async function createSession() {
      // In bridge mode, we don't create a separate session - we sync with TUI
      sessionId = 'bridge';
      document.getElementById('session-id').textContent = 'TUI Sync';
      connectWebSocket();
    }

    function connectWebSocket() {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      // Connect in bridge mode to sync with TUI
      ws = new WebSocket(\`\${protocol}//\${location.host}?mode=bridge\`);

      ws.onopen = () => {
        document.getElementById('ws-status').className = 'status-indicator status-connected';
        document.getElementById('ws-text').textContent = 'Synced with TUI';
      };

      ws.onclose = () => {
        document.getElementById('ws-status').className = 'status-indicator status-disconnected';
        document.getElementById('ws-text').textContent = 'Disconnected';
        setTimeout(connectWebSocket, 3000);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWSMessage(data);
      };
    }

    function handleWSMessage(data) {
      switch (data.type) {
        // Bridge events from TUI
        case 'user_message':
          if (data.source === 'tui') {
            addMessage('user', data.data.content + ' (from TUI)');
          }
          document.getElementById('send-btn').disabled = true;
          break;
        case 'assistant_message':
          addMessage('assistant', data.data.content);
          document.getElementById('send-btn').disabled = false;
          break;
        case 'session_sync':
          // Sync session state
          if (data.data.sessionId) {
            document.getElementById('session-id').textContent = 'TUI: ' + data.data.sessionId.slice(0, 8) + '...';
          }
          break;
        case 'thinking':
          updateThinking(data.data?.text || data.message);
          break;
        case 'stream_start':
          startStreamMessage();
          break;
        case 'stream_text':
          appendStreamText(data.data?.text || data.text);
          break;
        case 'stream_end':
          endStreamMessage();
          document.getElementById('send-btn').disabled = false;
          break;
        case 'response':
          addMessage('assistant', data.text);
          break;
        case 'tool_call':
          addMessage('system', \`🔧 \${data.data?.name || data.name}\`);
          break;
        case 'tool_result':
          const success = data.data?.success ? '✓' : '✗';
          addMessage('system', \`\${success} \${data.data?.name || data.name} completed\`);
          break;
        case 'complete':
          document.getElementById('send-btn').disabled = false;
          break;
        case 'error':
          addMessage('system', \`Error: \${data.data?.error || data.error}\`);
          document.getElementById('send-btn').disabled = false;
          break;
      }
    }

    let streamingMessageEl = null;

    function startStreamMessage() {
      const messages = document.getElementById('messages');
      streamingMessageEl = document.createElement('div');
      streamingMessageEl.className = 'message assistant';
      messages.appendChild(streamingMessageEl);
      messages.scrollTop = messages.scrollHeight;
    }

    function appendStreamText(text) {
      if (streamingMessageEl) {
        streamingMessageEl.textContent += text;
        document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
      }
    }

    function endStreamMessage() {
      streamingMessageEl = null;
    }

    function updateThinking(message) {
      // Could add a thinking indicator
    }

    function addMessage(role, content) {
      const messages = document.getElementById('messages');
      const msg = document.createElement('div');
      msg.className = 'message ' + role;
      msg.textContent = content;
      messages.appendChild(msg);
      messages.scrollTop = messages.scrollHeight;
    }

    function sendMessage() {
      const input = document.getElementById('user-input');
      const message = input.value.trim();
      if (!message) return;

      addMessage('user', message);
      input.value = '';
      document.getElementById('send-btn').disabled = true;

      if (ws && ws.readyState === WebSocket.OPEN) {
        // Send via bridge to TUI
        ws.send(JSON.stringify({ type: 'message', content: message }));
      }
    }

    async function loadDiff() {
      const diffContent = document.getElementById('diff-content');
      diffContent.textContent = 'Loading...';

      try {
        const res = await fetch('/api/git/diff');
        const data = await res.json();

        if (!data.success) {
          diffContent.textContent = 'Error: ' + data.error;
          return;
        }

        if (!data.diff) {
          diffContent.textContent = 'No changes detected.';
          return;
        }

        // Colorize diff
        const lines = data.diff.split('\\n');
        diffContent.innerHTML = lines.map(line => {
          if (line.startsWith('+') && !line.startsWith('+++')) {
            return '<span class="diff-add">' + escapeHtml(line) + '</span>';
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            return '<span class="diff-remove">' + escapeHtml(line) + '</span>';
          }
          return escapeHtml(line);
        }).join('\\n');
      } catch (e) {
        diffContent.textContent = 'Failed to load diff: ' + e.message;
      }
    }

    async function generateTests() {
      const filePath = document.getElementById('test-file-path').value;
      const framework = document.getElementById('test-framework').value;
      const output = document.getElementById('test-output');

      if (!filePath) {
        output.textContent = 'Please enter a file path.';
        return;
      }

      output.textContent = 'Generating tests...';
      document.getElementById('loading').style.display = 'block';

      try {
        const res = await fetch('/api/tests/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath, framework: framework || undefined }),
        });
        const data = await res.json();

        if (data.error) {
          output.textContent = 'Error: ' + data.message;
        } else {
          output.innerHTML = \`<strong>Generated \${data.testCasesGenerated} test cases</strong>\\n\\n\` + escapeHtml(data.content);
        }
      } catch (e) {
        output.textContent = 'Failed: ' + e.message;
      } finally {
        document.getElementById('loading').style.display = 'none';
      }
    }

    async function analyzeCode() {
      const filePath = document.getElementById('test-file-path').value;
      const output = document.getElementById('test-output');

      if (!filePath) {
        output.textContent = 'Please enter a file path.';
        return;
      }

      output.textContent = 'Analyzing code...';

      try {
        const res = await fetch('/api/tests/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath }),
        });
        const data = await res.json();

        if (data.error) {
          output.textContent = 'Error: ' + data.message;
        } else {
          output.textContent = JSON.stringify(data, null, 2);
        }
      } catch (e) {
        output.textContent = 'Failed: ' + e.message;
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  </script>
</body>
</html>`;
  }
}

/**
 * Start WebUI server from CLI
 */
export async function startWebUI(options: Partial<WebUIServerConfig> = {}): Promise<WebUIServer> {
  const server = new WebUIServer(options);
  await server.start();
  return server;
}
