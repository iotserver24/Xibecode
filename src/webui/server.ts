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
import { spawn, ChildProcess } from 'child_process';
import { ConfigManager, PROVIDER_CONFIGS } from '../utils/config.js';
import { EnhancedAgent } from '../core/agent.js';
import { CodingToolExecutor } from '../core/tools.js';
import { GitUtils } from '../utils/git.js';
import { TestRunnerDetector } from '../utils/testRunner.js';
import { TestGenerator, writeTestFile } from '../tools/test-generator.js';
import { SessionBridge } from '../core/session-bridge.js';
import { HistoryManager, type SavedConversation, type HistoryMessage } from '../core/history-manager.js';

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
  // OpenAI Models
  // GPT-5 Series
  { id: 'gpt-5.2', name: 'GPT-5.2', provider: 'openai', tier: 'premium' },
  { id: 'gpt-5.2-pro', name: 'GPT-5.2 Pro', provider: 'openai', tier: 'premium' },
  { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', provider: 'openai', tier: 'premium' },
  { id: 'gpt-5.1', name: 'GPT-5.1', provider: 'openai', tier: 'standard' },
  { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', provider: 'openai', tier: 'standard' },
  { id: 'gpt-5.1-chat', name: 'GPT-5.1 Chat', provider: 'openai', tier: 'standard' },
  { id: 'gpt-5', name: 'GPT-5', provider: 'openai', tier: 'standard' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'openai', tier: 'fast' },
  { id: 'gpt-5-nano', name: 'GPT-5 Nano', provider: 'openai', tier: 'fast' },
  { id: 'gpt-5-chat', name: 'GPT-5 Chat', provider: 'openai', tier: 'fast' },
  // GPT-4 & Reasoning
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', tier: 'standard' },
  { id: 'o3-deep-research', name: 'O3 Deep Research', provider: 'openai', tier: 'reasoning' },
  { id: 'o3-pro', name: 'O3 Pro', provider: 'openai', tier: 'reasoning' },
  { id: 'o3', name: 'O3', provider: 'openai', tier: 'reasoning' },
  { id: 'o4-mini', name: 'O4 Mini', provider: 'openai', tier: 'reasoning' },
  { id: 'o4-mini-deep-research', name: 'O4 Mini Deep Research', provider: 'openai', tier: 'reasoning' },

  // Anthropic Models
  // Claude 4 Series
  { id: 'claude-opus-4.6', name: 'Claude Opus 4.6', provider: 'anthropic', tier: 'premium' },
  { id: 'claude-opus-4.5', name: 'Claude Opus 4.5', provider: 'anthropic', tier: 'premium' },
  { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', provider: 'anthropic', tier: 'fast' },
  { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', provider: 'anthropic', tier: 'standard' },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'anthropic', tier: 'standard' },
  // Claude 3 Series
  { id: 'claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'anthropic', tier: 'standard' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', tier: 'standard' },

  // Google (Native)
  { id: 'gemini-3-deep-think', name: 'Gemini 3 Deep Think', provider: 'google', tier: 'reasoning' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', provider: 'google', tier: 'fast' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview', provider: 'google', tier: 'premium' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', tier: 'premium' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', tier: 'fast' },

  // OpenRouter Models
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (OpenRouter)', provider: 'openrouter', tier: 'standard' },
  // Zhipu AI (GLM)
  { id: 'glm-5', name: 'GLM-5', provider: 'zai', tier: 'premium' },
  { id: 'glm-4.7', name: 'GLM-4.7', provider: 'zai', tier: 'standard' },
  { id: 'glm-4.6', name: 'GLM-4.6', provider: 'zai', tier: 'standard' },
  { id: 'glm-4.5-air', name: 'GLM-4.5 Air', provider: 'zai', tier: 'fast' },
  { id: 'glm-4-plus', name: 'GLM-4 Plus', provider: 'zai', tier: 'standard' },

  // Alibaba (Qwen)
  // Qwen 3 Series
  { id: 'qwen3.5-coder-plus', name: 'Qwen 3.5 Coder Plus', provider: 'alibaba', tier: 'premium' },
  { id: 'qwen3.5-max', name: 'Qwen 3.5 Max', provider: 'alibaba', tier: 'premium' },
  { id: 'qwen3-max-thinking', name: 'Qwen 3 Max Thinking', provider: 'alibaba', tier: 'reasoning' },
  { id: 'qwen3-coder-plus', name: 'Qwen 3 Coder Plus', provider: 'alibaba', tier: 'standard' },
  { id: 'qwen3-235b', name: 'Qwen 3 235B', provider: 'alibaba', tier: 'standard' },
  // Qwen 2 Series
  { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder', provider: 'alibaba', tier: 'standard' },
  { id: 'qwen2.5-math', name: 'Qwen 2.5 Math', provider: 'alibaba', tier: 'reasoning' },
  { id: 'qwen2.5-72b', name: 'Qwen 2.5 72B', provider: 'alibaba', tier: 'standard' },

  // Moonshot (Kimi)
  // Kimi K2 Series
  { id: 'kimi-k2.5', name: 'Kimi k2.5', provider: 'kimi', tier: 'standard' },
  { id: 'kimi-k2-thinking', name: 'Kimi k2 Thinking', provider: 'kimi', tier: 'reasoning' },
  { id: 'kimi-k2-turbo-preview', name: 'Kimi k2 Turbo Preview', provider: 'kimi', tier: 'fast' },
  { id: 'kimi-k2-0905', name: 'Kimi k2 (0905)', provider: 'kimi', tier: 'standard' },
  { id: 'kimi-k2-0711', name: 'Kimi k2 (0711)', provider: 'kimi', tier: 'standard' },

  // xAI (Grok)
  // Grok-4 Series
  { id: 'grok-4.1-fast-reasoning', name: 'Grok 4.1 Fast Reasoning', provider: 'grok', tier: 'reasoning' },
  { id: 'grok-4.1-fast', name: 'Grok 4.1 Fast', provider: 'grok', tier: 'fast' },
  { id: 'grok-4', name: 'Grok 4', provider: 'grok', tier: 'premium' },
  { id: 'grok-4-code', name: 'Grok 4 Code', provider: 'grok', tier: 'standard' },
  { id: 'grok-4-0709', name: 'Grok 4 (0709)', provider: 'grok', tier: 'standard' },
  // Grok-3 Series
  { id: 'grok-3', name: 'Grok 3', provider: 'grok', tier: 'standard' },
  { id: 'grok-3-mini', name: 'Grok 3 Mini', provider: 'grok', tier: 'fast' },
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
  private historyManager: HistoryManager;

  constructor(config: Partial<WebUIServerConfig> = {}) {
    this.config = {
      port: config.port || 3847,
      host: config.host || 'localhost',
      staticDir: config.staticDir || path.join(__dirname, '../../webui-dist'),
      workingDir: config.workingDir || process.cwd(),
    };
    this.workingDir = this.config.workingDir!;
    this.configManager = new ConfigManager();
    this.historyManager = new HistoryManager(this.workingDir);
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
        sendJSON({ status: 'ok', version: '0.5.0' });
        return;
      }

      // Configuration
      if (pathname === '/api/config') {
        if (req.method === 'GET') {
          const display = this.configManager.getDisplayConfig();
          const currentModel = this.configManager.getModel();
          const apiKeySet = !!this.configManager.getApiKey();
          const allConfig = this.configManager.getAll();
          sendJSON({
            ...display,
            apiKeySet,
            currentModel,
            availableModels: AVAILABLE_MODELS,
            // Raw config values for the settings panel
            raw: {
              provider: allConfig.provider || '',
              model: allConfig.model || 'claude-sonnet-4-5-20250929',
              apiKey: apiKeySet ? '••••••••' : '',
              baseUrl: allConfig.baseUrl || '',
              anthropicBaseUrl: allConfig.anthropicBaseUrl || '',
              openaiBaseUrl: allConfig.openaiBaseUrl || '',
              maxIterations: allConfig.maxIterations ?? 50,
              theme: allConfig.theme || 'default',
              showDetails: this.configManager.getShowDetails(),
              showThinking: this.configManager.getShowThinking(),
              compactThreshold: allConfig.compactThreshold ?? 50000,
              preferredPackageManager: allConfig.preferredPackageManager || 'pnpm',
              enableDryRunByDefault: allConfig.enableDryRunByDefault ?? false,
              gitCheckpointStrategy: allConfig.gitCheckpointStrategy || 'stash',
              testCommandOverride: allConfig.testCommandOverride || '',
              defaultEditor: allConfig.defaultEditor || '',
              statusBarEnabled: allConfig.statusBarEnabled ?? true,
              headerMinimal: allConfig.headerMinimal ?? false,
              sessionDirectory: allConfig.sessionDirectory || '',

              plugins: allConfig.plugins || [],
            },
            providerConfigs: PROVIDER_CONFIGS,
          });
          return;
        }
        if (req.method === 'PUT') {
          const body = await parseBody();
          // Core AI settings
          if (body.apiKey) this.configManager.set('apiKey', body.apiKey);
          if (body.model) this.configManager.set('model', body.model);
          if (body.provider !== undefined) this.configManager.set('provider', body.provider);
          if (body.baseUrl !== undefined) this.configManager.set('baseUrl', body.baseUrl);
          if (body.anthropicBaseUrl !== undefined) this.configManager.set('anthropicBaseUrl', body.anthropicBaseUrl);
          if (body.openaiBaseUrl !== undefined) this.configManager.set('openaiBaseUrl', body.openaiBaseUrl);
          if (body.maxIterations !== undefined) this.configManager.set('maxIterations', body.maxIterations);
          // Display settings
          if (body.theme !== undefined) this.configManager.set('theme', body.theme);
          if (body.showDetails !== undefined) this.configManager.set('showDetails', body.showDetails);
          if (body.showThinking !== undefined) this.configManager.set('showThinking', body.showThinking);
          if (body.compactThreshold !== undefined) this.configManager.set('compactThreshold', body.compactThreshold);
          // Dev settings
          if (body.preferredPackageManager !== undefined) this.configManager.set('preferredPackageManager', body.preferredPackageManager);
          if (body.enableDryRunByDefault !== undefined) this.configManager.set('enableDryRunByDefault', body.enableDryRunByDefault);
          if (body.gitCheckpointStrategy !== undefined) this.configManager.set('gitCheckpointStrategy', body.gitCheckpointStrategy);
          if (body.testCommandOverride !== undefined) this.configManager.set('testCommandOverride', body.testCommandOverride);
          if (body.defaultEditor !== undefined) this.configManager.set('defaultEditor', body.defaultEditor);
          if (body.statusBarEnabled !== undefined) this.configManager.set('statusBarEnabled', body.statusBarEnabled);
          if (body.headerMinimal !== undefined) this.configManager.set('headerMinimal', body.headerMinimal);
          if (body.sessionDirectory !== undefined) this.configManager.set('sessionDirectory', body.sessionDirectory);
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

      // MCP servers JSON file (read/write for the Monaco editor)
      if (pathname === '/api/mcp/file') {
        const mcpFilePath = path.join(
          process.env.HOME || process.env.USERPROFILE || '.',
          '.xibecode',
          'mcp-servers.json'
        );

        if (req.method === 'GET') {
          try {
            const content = await fs.readFile(mcpFilePath, 'utf-8');
            sendJSON({ success: true, content, path: mcpFilePath });
          } catch {
            // File doesn't exist yet, return default template
            const defaultContent = JSON.stringify({
              mcpServers: {}
            }, null, 2);
            sendJSON({ success: true, content: defaultContent, path: mcpFilePath });
          }
          return;
        }

        if (req.method === 'PUT') {
          const body = await parseBody();
          if (!body.content) {
            sendJSON({ success: false, error: 'Missing content' }, 400);
            return;
          }
          try {
            // Validate it's valid JSON
            JSON.parse(body.content);
            // Ensure directory exists
            const dir = path.dirname(mcpFilePath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(mcpFilePath, body.content, 'utf-8');
            sendJSON({ success: true });
          } catch (error: any) {
            sendJSON({ success: false, error: error.message || 'Invalid JSON' }, 400);
          }
          return;
        }
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

      // Git log (commit history)
      if (pathname === '/api/git/log') {
        try {
          const { execSync } = await import('child_process');
          const count = 30;
          const logOutput = execSync(
            `git log --pretty=format:'{"hash":"%H","shortHash":"%h","author":"%an","email":"%ae","date":"%ai","message":"%s","refs":"%D"}' -${count}`,
            { cwd: this.workingDir, encoding: 'utf-8', timeout: 5000 }
          );
          const commits = logOutput.trim().split('\n').filter(Boolean).map(line => {
            try {
              // Handle special chars in commit messages
              const sanitized = line.replace(/\\/g, '\\\\').replace(/(?<!\\)"/g, (match, offset) => {
                // Only escape quotes inside the message field
                return match;
              });
              return JSON.parse(sanitized);
            } catch {
              // Fallback: parse manually
              const hashMatch = line.match(/"hash":"([^"]+)"/);
              const shortMatch = line.match(/"shortHash":"([^"]+)"/);
              const authorMatch = line.match(/"author":"([^"]+)"/);
              const dateMatch = line.match(/"date":"([^"]+)"/);
              const messageMatch = line.match(/"message":"(.+?)","refs"/);
              const refsMatch = line.match(/"refs":"([^"]*)"/);
              return {
                hash: hashMatch?.[1] || '',
                shortHash: shortMatch?.[1] || '',
                author: authorMatch?.[1] || '',
                email: '',
                date: dateMatch?.[1] || '',
                message: messageMatch?.[1] || 'commit',
                refs: refsMatch?.[1] || '',
              };
            }
          });

          // Also get graph lines
          let graph: string[] = [];
          try {
            const graphOutput = execSync(
              `git log --graph --oneline --decorate -${count}`,
              { cwd: this.workingDir, encoding: 'utf-8', timeout: 5000 }
            );
            graph = graphOutput.trim().split('\n');
          } catch { }

          sendJSON({ success: true, commits, graph });
        } catch (error: any) {
          sendJSON({ success: false, error: error.message, commits: [], graph: [] }, 500);
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

      // Recursive file tree for the WebUI file explorer
      if (pathname === '/api/files/tree') {
        const body = await parseBody();
        const dirPath = body.path || '.';
        const maxDepth = body.depth || 10;
        const SKIP_DIRS = new Set([
          'node_modules', '.git', 'dist', 'build', '.next', '.cache',
          '__pycache__', '.venv', 'venv', '.tox', 'coverage', '.nyc_output',
          '.svn', '.hg', 'bower_components', '.parcel-cache', '.turbo',
        ]);

        const buildTree = async (currentPath: string, relativePath: string, depth: number): Promise<any[]> => {
          if (depth <= 0) return [];
          const fullPath = path.resolve(this.workingDir, currentPath);
          // Path traversal protection
          if (!fullPath.startsWith(path.resolve(this.workingDir))) return [];
          try {
            const entries = await fs.readdir(fullPath, { withFileTypes: true });
            const nodes: any[] = [];
            // Sort: directories first, then alphabetically
            const sorted = entries.sort((a, b) => {
              if (a.isDirectory() && !b.isDirectory()) return -1;
              if (!a.isDirectory() && b.isDirectory()) return 1;
              return a.name.localeCompare(b.name);
            });
            for (const entry of sorted) {
              if (entry.name.startsWith('.') && entry.name !== '.env' && entry.name !== '.env.local') {
                // Skip most hidden files/dirs but allow .env
                if (entry.isDirectory()) continue;
              }
              if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
              const entryRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
              const node: any = {
                name: entry.name,
                path: entryRelPath,
                isDirectory: entry.isDirectory(),
              };
              if (entry.isDirectory()) {
                node.children = await buildTree(
                  path.join(currentPath, entry.name),
                  entryRelPath,
                  depth - 1
                );
              }
              nodes.push(node);
            }
            return nodes;
          } catch {
            return [];
          }
        };

        try {
          const tree = await buildTree(dirPath, '', maxDepth);
          sendJSON({ success: true, tree });
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

      // Serve raw binary files (images, videos, audio) for media preview
      if (pathname === '/api/files/raw') {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);
        const filePath = url.searchParams.get('path');
        if (!filePath) {
          sendJSON({ success: false, error: 'Missing path parameter' }, 400);
          return;
        }
        const fullPath = path.resolve(this.workingDir, filePath);
        // Path traversal protection
        if (!fullPath.startsWith(path.resolve(this.workingDir))) {
          sendJSON({ success: false, error: 'Invalid path' }, 403);
          return;
        }
        try {
          const content = await fs.readFile(fullPath);
          const ext = path.extname(fullPath).toLowerCase();
          const mimeTypes: Record<string, string> = {
            '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
            '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.bmp': 'image/bmp',
            '.avif': 'image/avif', '.tiff': 'image/tiff', '.tif': 'image/tiff',
            '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'video/ogg', '.mov': 'video/quicktime',
            '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
            '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.aac': 'audio/aac',
            '.m4a': 'audio/mp4', '.opus': 'audio/opus',
            '.pdf': 'application/pdf',
            '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
          };
          const contentType = mimeTypes[ext] || 'application/octet-stream';
          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': content.length.toString(),
            'Cache-Control': 'public, max-age=3600',
          });
          res.end(content);
        } catch (error: any) {
          sendJSON({ success: false, error: error.message }, 404);
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

      // Environment variables (.env file management)
      if (pathname === '/api/env') {
        if (req.method === 'GET') {
          // Auto-detect .env file in the working directory
          const envFiles = ['.env', '.env.local', '.env.development', '.env.production'];
          let envFilePath: string | null = null;
          let envContent = '';

          for (const envFile of envFiles) {
            const fullEnvPath = path.join(this.workingDir, envFile);
            try {
              envContent = await fs.readFile(fullEnvPath, 'utf-8');
              envFilePath = envFile;
              break;
            } catch {
              // File doesn't exist, try next
            }
          }

          if (!envFilePath) {
            // No .env file found, return empty state with suggested path
            sendJSON({
              success: true,
              exists: false,
              path: '.env',
              fullPath: path.join(this.workingDir, '.env'),
              variables: [],
              raw: '',
            });
            return;
          }

          // Parse the .env file content into structured variables
          const variables: Array<{ key: string; value: string; comment?: string; isComment: boolean; raw: string }> = [];
          const lines = envContent.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === '') {
              variables.push({ key: '', value: '', isComment: false, raw: line });
            } else if (trimmed.startsWith('#')) {
              variables.push({ key: '', value: '', comment: trimmed.slice(1).trim(), isComment: true, raw: line });
            } else {
              const eqIndex = trimmed.indexOf('=');
              if (eqIndex !== -1) {
                const key = trimmed.substring(0, eqIndex).trim();
                let value = trimmed.substring(eqIndex + 1).trim();
                // Remove surrounding quotes if present
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                  value = value.slice(1, -1);
                }
                variables.push({ key, value, isComment: false, raw: line });
              } else {
                variables.push({ key: trimmed, value: '', isComment: false, raw: line });
              }
            }
          }

          sendJSON({
            success: true,
            exists: true,
            path: envFilePath,
            fullPath: path.join(this.workingDir, envFilePath),
            variables,
            raw: envContent,
          });
          return;
        }

        if (req.method === 'PUT') {
          const body = await parseBody();
          const envFileName = body.path || '.env';
          const fullEnvPath = path.join(this.workingDir, envFileName);

          // Path traversal protection
          if (!fullEnvPath.startsWith(path.resolve(this.workingDir))) {
            sendJSON({ success: false, error: 'Invalid path' }, 400);
            return;
          }

          try {
            if (body.raw !== undefined) {
              // Write raw content directly
              await fs.writeFile(fullEnvPath, body.raw, 'utf-8');
            } else if (body.variables) {
              // Build .env content from structured variables
              const lines: string[] = [];
              for (const v of body.variables) {
                if (v.isComment) {
                  lines.push(`# ${v.comment || ''}`);
                } else if (v.key === '' && v.value === '') {
                  lines.push('');
                } else {
                  const needsQuotes = v.value && (v.value.includes(' ') || v.value.includes('#') || v.value.includes('"'));
                  const quotedValue = needsQuotes ? `"${v.value}"` : (v.value || '');
                  lines.push(`${v.key}=${quotedValue}`);
                }
              }
              await fs.writeFile(fullEnvPath, lines.join('\n') + '\n', 'utf-8');
            } else {
              sendJSON({ success: false, error: 'Missing raw or variables field' }, 400);
              return;
            }
            sendJSON({ success: true, path: envFileName, fullPath: fullEnvPath });
          } catch (error: any) {
            sendJSON({ success: false, error: error.message }, 500);
          }
          return;
        }
      }

      // File list for @ command (simple GET)
      if (pathname === '/api/files') {
        try {
          const files: string[] = [];
          const walkDir = async (dir: string, prefix: string = '') => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              // Skip hidden files, node_modules, dist, etc.
              if (entry.name.startsWith('.') ||
                entry.name === 'node_modules' ||
                entry.name === 'dist' ||
                entry.name === 'build' ||
                entry.name === 'coverage' ||
                entry.name === '__pycache__') {
                continue;
              }
              const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
              if (entry.isDirectory()) {
                files.push(relativePath + '/');
                // Limit depth to avoid huge lists
                if (relativePath.split('/').length < 4) {
                  await walkDir(path.join(dir, entry.name), relativePath);
                }
              } else {
                files.push(relativePath);
              }
            }
          };
          await walkDir(this.workingDir);
          // Sort: directories first, then files
          files.sort((a, b) => {
            const aIsDir = a.endsWith('/');
            const bIsDir = b.endsWith('/');
            if (aIsDir && !bIsDir) return -1;
            if (!aIsDir && bIsDir) return 1;
            return a.localeCompare(b);
          });
          sendJSON({ success: true, files: files.slice(0, 500) }); // Limit to 500 files
        } catch (error: any) {
          sendJSON({ success: false, error: error.message }, 500);
        }
        return;
      }

      // Chat history API
      if (pathname === '/api/history') {
        if (req.method === 'GET') {
          try {
            const conversations = await this.historyManager.list();
            sendJSON({ success: true, conversations });
          } catch (error: any) {
            sendJSON({ success: false, error: error.message }, 500);
          }
          return;
        }
        if (req.method === 'POST') {
          const body = await parseBody();
          try {
            if (body.conversation) {
              await this.historyManager.save(body.conversation as SavedConversation);
              sendJSON({ success: true, id: body.conversation.id });
            } else {
              sendJSON({ success: false, error: 'Missing conversation data' }, 400);
            }
          } catch (error: any) {
            sendJSON({ success: false, error: error.message }, 500);
          }
          return;
        }
      }

      // Load specific conversation
      if (pathname.startsWith('/api/history/') && req.method === 'GET') {
        const id = pathname.split('/')[3];
        if (id) {
          try {
            const conversation = await this.historyManager.load(id);
            if (conversation) {
              sendJSON({ success: true, conversation });
            } else {
              sendJSON({ success: false, error: 'Conversation not found' }, 404);
            }
          } catch (error: any) {
            sendJSON({ success: false, error: error.message }, 500);
          }
          return;
        }
      }

      // Delete specific conversation
      if (pathname.startsWith('/api/history/') && req.method === 'DELETE') {
        const id = pathname.split('/')[3];
        if (id) {
          try {
            const deleted = await this.historyManager.delete(id);
            sendJSON({ success: deleted, error: deleted ? undefined : 'Not found' });
          } catch (error: any) {
            sendJSON({ success: false, error: error.message }, 500);
          }
          return;
        }
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

    // Terminal mode - spawn a real shell with PTY via Python bridge
    if (mode === 'terminal') {
      let ptyProcess: ChildProcess | null = null;

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === 'terminal:create') {
            const cwd = message.cwd ? path.resolve(this.workingDir, message.cwd) : this.workingDir;
            const shell = process.env.SHELL || '/bin/bash';
            const cols = message.cols || 120;
            const rows = message.rows || 30;

            // Python PTY bridge script - creates a real pseudo-terminal
            const ptyBridge = `
import pty, os, sys, select, signal, struct, fcntl, termios

def set_winsize(fd, rows, cols):
    s = struct.pack('HHHH', rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, s)

master, slave = pty.openpty()
set_winsize(master, ${rows}, ${cols})

pid = os.fork()
if pid == 0:
    os.close(master)
    os.setsid()
    os.dup2(slave, 0)
    os.dup2(slave, 1)
    os.dup2(slave, 2)
    os.close(slave)
    os.environ['TERM'] = 'xterm-256color'
    os.environ['COLORTERM'] = 'truecolor'
    os.chdir('${cwd.replace(/'/g, "\\'")}')
    os.execvp('${shell}', ['${shell}', '-i'])
else:
    os.close(slave)
    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()
    try:
        while True:
            r, _, _ = select.select([stdin_fd, master], [], [], 0.02)
            if stdin_fd in r:
                d = os.read(stdin_fd, 4096)
                if not d: break
                os.write(master, d)
            if master in r:
                try:
                    d = os.read(master, 4096)
                except OSError: break
                if not d: break
                os.write(stdout_fd, d)
    except (IOError, OSError): pass
    finally:
        try: os.kill(pid, signal.SIGTERM)
        except: pass
`;

            ptyProcess = spawn('python3', ['-u', '-c', ptyBridge], {
              cwd,
              env: { ...process.env, PYTHONUNBUFFERED: '1' },
              stdio: ['pipe', 'pipe', 'pipe'],
            });

            if (ptyProcess.stdout) {
              ptyProcess.stdout.on('data', (chunk: Buffer) => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'terminal:output', data: chunk.toString('utf-8') }));
                }
              });
            }

            if (ptyProcess.stderr) {
              ptyProcess.stderr.on('data', (chunk: Buffer) => {
                // stderr from the PTY bridge (mostly shell startup messages)
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'terminal:output', data: chunk.toString('utf-8') }));
                }
              });
            }

            ptyProcess.on('exit', (code) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'terminal:output', data: `\r\n\x1b[90mShell exited (code ${code})\x1b[0m\r\n` }));
              }
            });

            ptyProcess.on('error', (err) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'terminal:output', data: `\r\n\x1b[31mError: ${err.message}\x1b[0m\r\n` }));
              }
            });

            ws.send(JSON.stringify({ type: 'terminal:created', pid: ptyProcess.pid }));
          }

          if (message.type === 'terminal:input' && ptyProcess?.stdin) {
            ptyProcess.stdin.write(message.data);
          }

          if (message.type === 'terminal:resize' && ptyProcess?.pid) {
            // For resize, we'd need to signal the Python bridge
            // The Python bridge will handle SIGWINCH
            try {
              process.kill(ptyProcess.pid, 'SIGWINCH');
            } catch {
              // ignore
            }
          }
        } catch (error) {
          console.error('Terminal WebSocket error:', error);
        }
      });

      ws.on('close', () => {
        if (ptyProcess) {
          try {
            ptyProcess.kill('SIGTERM');
            setTimeout(() => {
              try { ptyProcess?.kill('SIGKILL'); } catch { }
            }, 1000);
          } catch { }
          ptyProcess = null;
        }
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
      name: packageJson?.name || path.basename(this.workingDir),
      version: packageJson?.version,
      description: packageJson?.description,
      workingDir: this.workingDir,
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
   * Minimalistic terminal-style WebUI
   */
  private getFallbackHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>XibeCode</title>
  <style>
    :root {
      --bg-primary: #0d1117;
      --bg-secondary: #161b22;
      --bg-tertiary: #21262d;
      --border-color: #30363d;
      --text-primary: #e6edf3;
      --text-secondary: #8b949e;
      --text-muted: #6e7681;
      --accent-blue: #58a6ff;
      --accent-green: #3fb950;
      --accent-yellow: #d29922;
      --accent-red: #f85149;
      --accent-purple: #a371f7;
      --accent-cyan: #39c5cf;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'SF Mono', 'Fira Code', 'Monaco', 'Consolas', monospace;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      font-size: 14px;
      line-height: 1.5;
    }

    /* Header */
    .header {
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .logo-icon {
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, var(--accent-cyan), var(--accent-blue));
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 16px;
    }
    .logo-text {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .logo-text span { color: var(--accent-cyan); }
    .header-info {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    .info-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--text-secondary);
    }
    .info-item .label { color: var(--text-muted); }
    .info-item .value { color: var(--accent-cyan); }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-red);
    }
    .status-dot.connected { background: var(--accent-green); }

    /* Main layout */
    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      max-width: 1200px;
      width: 100%;
      margin: 0 auto;
      padding: 16px;
    }

    /* Messages area */
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 400px;
    }

    /* Message styles */
    .message {
      padding: 12px 16px;
      border-radius: 8px;
      max-width: 85%;
      word-wrap: break-word;
    }
    .message.user {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      align-self: flex-end;
      margin-left: auto;
    }
    .message.user::before {
      content: '> ';
      color: var(--accent-green);
    }
    .message.assistant {
      background: var(--bg-secondary);
      border-left: 3px solid var(--accent-cyan);
      align-self: flex-start;
    }
    .message.system {
      background: transparent;
      color: var(--text-muted);
      font-size: 12px;
      text-align: center;
      align-self: center;
      max-width: 100%;
    }
    .message.tool {
      background: var(--bg-tertiary);
      border-left: 3px solid var(--accent-yellow);
      font-size: 13px;
      padding: 10px 14px;
    }
    .message.tool .tool-name {
      color: var(--accent-yellow);
      font-weight: 600;
    }
    .message.tool .tool-status {
      color: var(--text-muted);
      margin-left: 8px;
    }
    .message.tool .tool-status.success { color: var(--accent-green); }
    .message.tool .tool-status.error { color: var(--accent-red); }

    /* Thinking indicator */
    .thinking {
      display: none;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      color: var(--text-secondary);
      font-size: 13px;
    }
    .thinking.visible { display: flex; }
    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--border-color);
      border-top-color: var(--accent-cyan);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Input area */
    .input-area {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 12px;
      margin-top: 16px;
      position: relative;
    }
    .input-wrapper {
      display: flex;
      gap: 12px;
      align-items: flex-end;
    }
    .input-field {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text-primary);
      font-family: inherit;
      font-size: 14px;
      resize: none;
      min-height: 24px;
      max-height: 200px;
      outline: none;
    }
    .input-field::placeholder { color: var(--text-muted); }
    .send-btn {
      background: var(--accent-cyan);
      color: var(--bg-primary);
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-family: inherit;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .send-btn:hover { opacity: 0.9; }
    .send-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .input-hints {
      display: flex;
      gap: 16px;
      margin-top: 8px;
      font-size: 12px;
      color: var(--text-muted);
    }
    .hint-key {
      background: var(--bg-tertiary);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 11px;
    }

    /* Command popup */
    .cmd-popup {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 0;
      right: 0;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      margin-bottom: 8px;
      max-height: 300px;
      overflow-y: auto;
      z-index: 100;
    }
    .cmd-popup.visible { display: block; }
    .cmd-popup-header {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border-color);
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 600;
    }
    .cmd-item {
      padding: 10px 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid var(--border-color);
    }
    .cmd-item:last-child { border-bottom: none; }
    .cmd-item:hover { background: var(--bg-tertiary); }
    .cmd-item.selected { background: var(--bg-tertiary); }
    .cmd-item-icon {
      width: 24px;
      text-align: center;
    }
    .cmd-item-info { flex: 1; }
    .cmd-item-name {
      font-weight: 600;
      color: var(--text-primary);
    }
    .cmd-item-desc {
      font-size: 12px;
      color: var(--text-muted);
    }
    .cmd-item-color {
      width: 12px;
      height: 12px;
      border-radius: 3px;
    }
    .cmd-section-header {
      padding: 8px 14px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      background: var(--bg-tertiary);
      font-weight: 600;
    }

    /* Settings panel */
    .settings-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      z-index: 200;
      align-items: center;
      justify-content: center;
    }
    .settings-overlay.visible {
      display: flex;
    }
    .settings-panel {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      width: 90%;
      max-width: 500px;
      max-height: 80vh;
      overflow-y: auto;
    }
    .settings-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .settings-header h2 {
      font-size: 16px;
      font-weight: 600;
    }
    .settings-close {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 18px;
      padding: 4px;
    }
    .settings-close:hover { color: var(--text-primary); }
    .settings-content {
      padding: 20px;
    }
    .settings-section {
      margin-bottom: 24px;
    }
    .settings-section:last-child { margin-bottom: 0; }
    .settings-section h3 {
      font-size: 12px;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 12px;
      letter-spacing: 0.5px;
    }
    .settings-field {
      margin-bottom: 16px;
    }
    .settings-field:last-child { margin-bottom: 0; }
    .settings-field label {
      display: block;
      font-size: 13px;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }
    .settings-field input,
    .settings-field select {
      width: 100%;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 10px 12px;
      color: var(--text-primary);
      font-family: inherit;
      font-size: 13px;
    }
    .settings-field input:focus,
    .settings-field select:focus {
      outline: none;
      border-color: var(--accent-cyan);
    }
    .settings-field input::placeholder { color: var(--text-muted); }
    .settings-field small {
      display: block;
      margin-top: 4px;
      font-size: 11px;
      color: var(--text-muted);
    }
    .settings-btn {
      width: 100%;
      background: var(--accent-cyan);
      color: var(--bg-primary);
      border: none;
      padding: 12px;
      border-radius: 6px;
      font-family: inherit;
      font-weight: 600;
      cursor: pointer;
      margin-top: 16px;
    }
    .settings-btn:hover { opacity: 0.9; }

    /* Markdown rendering */
    .message.assistant code {
      background: var(--bg-tertiary);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
    }
    .message.assistant pre {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 12px;
      margin: 8px 0;
      overflow-x: auto;
    }
    .message.assistant pre code {
      background: none;
      padding: 0;
    }
    .message.assistant strong { color: var(--accent-cyan); }
    .message.assistant em { color: var(--text-secondary); }
    .message.assistant a {
      color: var(--accent-blue);
      text-decoration: none;
    }
    .message.assistant a:hover { text-decoration: underline; }
    .message.assistant ul, .message.assistant ol {
      margin: 8px 0;
      padding-left: 20px;
    }
    .message.assistant li { margin: 4px 0; }
    .message.assistant blockquote {
      border-left: 3px solid var(--border-color);
      padding-left: 12px;
      color: var(--text-secondary);
      margin: 8px 0;
    }
    .message.assistant h1, .message.assistant h2, .message.assistant h3 {
      margin: 16px 0 8px;
      color: var(--text-primary);
    }
    .message.assistant h1 { font-size: 18px; }
    .message.assistant h2 { font-size: 16px; }
    .message.assistant h3 { font-size: 14px; }

    /* Settings button in header */
    .settings-trigger {
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .settings-trigger:hover {
      background: var(--bg-tertiary);
      color: var(--text-primary);
    }

    /* Responsive */
    @media (max-width: 768px) {
      .header { padding: 10px 14px; }
      .header-info { display: none; }
      .main { padding: 12px; }
      .message { max-width: 95%; }
      .settings-panel { width: 95%; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="logo">
      <div class="logo-icon">X</div>
      <div class="logo-text">Xibe<span>Code</span></div>
    </div>
    <div class="header-info">
      <div class="info-item">
        <span class="label">Path:</span>
        <span class="value" id="current-path">~</span>
      </div>
      <div class="info-item">
        <span class="label">Model:</span>
        <span class="value" id="current-model">-</span>
      </div>
      <div class="info-item">
        <span class="label">Mode:</span>
        <span class="value" id="current-mode">Agent</span>
      </div>
      <div class="info-item">
        <span class="status-dot" id="status-dot"></span>
        <span id="status-text">Connecting...</span>
      </div>
    </div>
    <button class="settings-trigger" onclick="openSettings()">
      <span>&#9881;</span> Settings
    </button>
  </header>

  <main class="main">
    <div class="messages" id="messages">
      <div class="message system">Welcome to XibeCode. Type <span class="hint-key">/</span> for modes or <span class="hint-key">@</span> to reference files.</div>
    </div>

    <div class="thinking" id="thinking">
      <div class="spinner"></div>
      <span id="thinking-text">AI is thinking...</span>
    </div>

    <div class="input-area">
      <div class="cmd-popup" id="cmd-popup">
        <div class="cmd-popup-header">Select Mode</div>
        <div id="cmd-list"></div>
      </div>
      <div class="cmd-popup" id="file-popup">
        <div class="cmd-popup-header">Select File</div>
        <div id="file-list"></div>
      </div>
      <div class="input-wrapper">
        <textarea class="input-field" id="user-input" placeholder="Type a message... (/ for modes, @ for files)" rows="1"></textarea>
        <button class="send-btn" id="send-btn" onclick="sendMessage()">Send</button>
      </div>
      <div class="input-hints">
        <span><span class="hint-key">/</span> modes</span>
        <span><span class="hint-key">@</span> files</span>
        <span><span class="hint-key">Enter</span> send</span>
        <span><span class="hint-key">Shift+Enter</span> new line</span>
      </div>
    </div>
  </main>

  <!-- Settings Panel -->
  <div class="settings-overlay" id="settings-overlay" onclick="closeSettings(event)">
    <div class="settings-panel" onclick="event.stopPropagation()">
      <div class="settings-header">
        <h2>Settings</h2>
        <button class="settings-close" onclick="closeSettings()">&times;</button>
      </div>
      <div class="settings-content">
        <div class="settings-section">
          <h3>AI Provider</h3>
          <div class="settings-field">
            <label>Provider</label>
            <select id="settings-provider" onchange="onProviderChange()">
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI</option>
              <option value="custom">Custom / OpenAI-compatible</option>
            </select>
          </div>
          <div class="settings-field">
            <label>Model</label>
            <select id="settings-model">
              <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5</option>
              <option value="claude-opus-4-5-20251101">Claude Opus 4.5</option>
              <option value="claude-haiku-4-5-20251015">Claude Haiku 4.5</option>
            </select>
          </div>
          <div class="settings-field" id="custom-model-field" style="display:none;">
            <label>Custom Model ID</label>
            <input type="text" id="settings-custom-model" placeholder="e.g., gpt-4-turbo, llama-3-70b">
            <small>Enter the model identifier for your provider</small>
          </div>
          <div class="settings-field">
            <label>API Key</label>
            <input type="password" id="settings-api-key" placeholder="sk-...">
          </div>
          <div class="settings-field" id="base-url-field" style="display:none;">
            <label>Base URL</label>
            <input type="text" id="settings-base-url" placeholder="https://api.openai.com/v1">
            <small>For custom OpenAI-compatible endpoints</small>
          </div>
        </div>

        <div class="settings-section">
          <h3>Session Info</h3>
          <div class="settings-field">
            <label>Working Directory</label>
            <input type="text" id="settings-workdir" readonly>
          </div>
          <div class="settings-field">
            <label>Git Branch</label>
            <input type="text" id="settings-branch" readonly>
          </div>
          <div class="settings-field">
            <label>Session ID</label>
            <input type="text" id="settings-session" readonly>
          </div>
        </div>

        <button class="settings-btn" onclick="saveSettings()">Save Settings</button>
      </div>
    </div>
  </div>

  <script>
    // Commands configuration
    const COMMANDS = [
      { id: 'clear', name: '/clear', icon: '&#x1F9F9;', desc: 'Clear chat messages', color: '#8B949E', type: 'action' },
      { id: 'help', name: '/help', icon: '&#x2753;', desc: 'Show available commands', color: '#58A6FF', type: 'action' },
      { id: 'diff', name: '/diff', icon: '&#x1F4DD;', desc: 'Show git diff', color: '#3FB950', type: 'action' },
      { id: 'status', name: '/status', icon: '&#x1F4CA;', desc: 'Show git status', color: '#A371F7', type: 'action' },
      { id: 'test', name: '/test', icon: '&#x1F9EA;', desc: 'Run project tests', color: '#FF4081', type: 'action' },
      { id: 'format', name: '/format', icon: '&#x2728;', desc: 'Format code in project', color: '#FFD740', type: 'action' },
      { id: 'reset', name: '/reset', icon: '&#x1F504;', desc: 'Reset chat session', color: '#F85149', type: 'action' },
      { id: 'files', name: '/files', icon: '&#x1F4C1;', desc: 'List project files', color: '#39C5CF', type: 'action' },
    ];

    // Modes configuration
    const MODES = [
      { id: 'agent', name: 'Agent', icon: '&#x1F916;', desc: 'Autonomous coding', color: '#00E676' },
      { id: 'plan', name: 'Plan', icon: '&#x1F4CB;', desc: 'Analyze and plan without modifying', color: '#40C4FF' },
      { id: 'tester', name: 'Tester', icon: '&#x1F9EA;', desc: 'Testing and QA', color: '#FF4081' },
      { id: 'debugger', name: 'Debugger', icon: '&#x1F41B;', desc: 'Bug investigation', color: '#FFD740' },
      { id: 'security', name: 'Security', icon: '&#x1F512;', desc: 'Security analysis', color: '#FF5252' },
      { id: 'review', name: 'Review', icon: '&#x1F440;', desc: 'Code review', color: '#BB86FC' },
      { id: 'team_leader', name: 'Team Leader', icon: '&#x1F451;', desc: 'Coordinate team', color: '#FFD600' },
      { id: 'architect', name: 'Architect', icon: '&#x1F3DB;', desc: 'System design', color: '#7C4DFF' },
      { id: 'engineer', name: 'Engineer', icon: '&#x1F6E0;', desc: 'Implementation', color: '#00E676' },
      { id: 'seo', name: 'SEO', icon: '&#x1F310;', desc: 'SEO optimization', color: '#00B0FF' },
      { id: 'product', name: 'Product', icon: '&#x1F525;', desc: 'Product strategy', color: '#FF6D00' },
      { id: 'data', name: 'Data', icon: '&#x1F4CA;', desc: 'Data analysis', color: '#00BCD4' },
      { id: 'researcher', name: 'Researcher', icon: '&#x1F4DA;', desc: 'Deep research', color: '#E91E63' },
    ];

    // Combined list for slash popup
    const ALL_SLASH_ITEMS = [
      ...COMMANDS.map(c => ({ ...c, category: 'command' })),
      ...MODES.map(m => ({ ...m, name: '/mode ' + m.id, category: 'mode' })),
    ];

    let ws = null;
    let files = [];
    let selectedCmdIndex = 0;
    let selectedFileIndex = 0;
    let currentPopup = null; // 'modes' | 'files' | null
    let streamingMessageEl = null;
    let streamingText = ''; // Track raw text for streaming

    // Initialize
    document.addEventListener('DOMContentLoaded', async () => {
      await loadProjectInfo();
      await loadConfig();
      connectWebSocket();
      setupInput();
    });

    // Setup input handling
    function setupInput() {
      const input = document.getElementById('user-input');

      input.addEventListener('input', (e) => {
        autoResize(input);
        handleInputChange(e.target.value);
      });

      input.addEventListener('keydown', (e) => {
        if (currentPopup) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            navigatePopup(1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            navigatePopup(-1);
          } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            selectPopupItem();
          } else if (e.key === 'Escape') {
            closePopups();
          }
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
    }

    function autoResize(textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }

    function handleInputChange(value) {
      const lastChar = value.slice(-1);
      const beforeLast = value.slice(0, -1);

      // Check for / command at start or after space
      if (lastChar === '/' && (beforeLast === '' || beforeLast.endsWith(' '))) {
        openModePopup();
        return;
      }

      // Check for @ command
      if (lastChar === '@' && (beforeLast === '' || beforeLast.endsWith(' '))) {
        openFilePopup();
        return;
      }

      // Filter popups based on input after trigger
      if (currentPopup === 'modes') {
        const match = value.match(/\\/([\\w]*)$/);
        if (match) {
          filterSlashList(match[1]);
        } else {
          closePopups();
        }
      } else if (currentPopup === 'files') {
        const match = value.match(/@([\\w\\.\\-\\/]*)$/);
        if (match) {
          filterFileList(match[1]);
        } else {
          closePopups();
        }
      }
    }

    function openModePopup() {
      currentPopup = 'modes';
      selectedCmdIndex = 0;
      document.getElementById('cmd-popup').classList.add('visible');
      document.getElementById('file-popup').classList.remove('visible');
      renderSlashList();
    }

    function openFilePopup() {
      currentPopup = 'files';
      selectedFileIndex = 0;
      document.getElementById('file-popup').classList.add('visible');
      document.getElementById('cmd-popup').classList.remove('visible');
      loadFiles();
    }

    function closePopups() {
      currentPopup = null;
      document.getElementById('cmd-popup').classList.remove('visible');
      document.getElementById('file-popup').classList.remove('visible');
    }

    function renderSlashList(filter = '') {
      const list = document.getElementById('cmd-list');
      const header = document.querySelector('#cmd-popup .cmd-popup-header');
      header.textContent = 'Commands & Modes';

      const filtered = ALL_SLASH_ITEMS.filter(item =>
        item.name.toLowerCase().includes(filter.toLowerCase()) ||
        item.id.toLowerCase().includes(filter.toLowerCase()) ||
        item.desc.toLowerCase().includes(filter.toLowerCase())
      );

      if (filtered.length === 0) {
        list.innerHTML = '<div class="cmd-item"><div class="cmd-item-info"><div class="cmd-item-desc">No commands found</div></div></div>';
        return;
      }

      // Group by category
      const commands = filtered.filter(i => i.category === 'command');
      const modes = filtered.filter(i => i.category === 'mode');

      let html = '';

      if (commands.length > 0) {
        html += '<div class="cmd-section-header">Commands</div>';
        commands.forEach((item, i) => {
          const globalIdx = filtered.indexOf(item);
          html += \`
            <div class="cmd-item \${globalIdx === selectedCmdIndex ? 'selected' : ''}"
                 onclick="executeSlashItem('\${item.id}', '\${item.category}')"
                 onmouseenter="selectedCmdIndex = \${globalIdx}; renderSlashList('\${filter}')">
              <div class="cmd-item-icon">\${item.icon}</div>
              <div class="cmd-item-info">
                <div class="cmd-item-name">\${item.name}</div>
                <div class="cmd-item-desc">\${item.desc}</div>
              </div>
              <div class="cmd-item-color" style="background: \${item.color}"></div>
            </div>
          \`;
        });
      }

      if (modes.length > 0) {
        html += '<div class="cmd-section-header">Modes</div>';
        modes.forEach((item, i) => {
          const globalIdx = filtered.indexOf(item);
          html += \`
            <div class="cmd-item \${globalIdx === selectedCmdIndex ? 'selected' : ''}"
                 onclick="executeSlashItem('\${item.id}', '\${item.category}')"
                 onmouseenter="selectedCmdIndex = \${globalIdx}; renderSlashList('\${filter}')">
              <div class="cmd-item-icon">\${item.icon}</div>
              <div class="cmd-item-info">
                <div class="cmd-item-name">\${item.name}</div>
                <div class="cmd-item-desc">\${item.desc}</div>
              </div>
              <div class="cmd-item-color" style="background: \${item.color}"></div>
            </div>
          \`;
        });
      }

      list.innerHTML = html;
    }

    function filterSlashList(filter) {
      selectedCmdIndex = 0;
      renderSlashList(filter);
    }

    async function loadFiles() {
      try {
        const res = await fetch('/api/files');
        const data = await res.json();
        files = data.files || [];
        renderFileList();
      } catch (e) {
        files = [];
        renderFileList();
      }
    }

    function renderFileList(filter = '') {
      const list = document.getElementById('file-list');
      const filtered = files.filter(f =>
        f.toLowerCase().includes(filter.toLowerCase())
      ).slice(0, 20);

      if (filtered.length === 0) {
        list.innerHTML = '<div class="cmd-item"><div class="cmd-item-info"><div class="cmd-item-desc">No files found</div></div></div>';
        return;
      }

      list.innerHTML = filtered.map((file, i) => \`
        <div class="cmd-item \${i === selectedFileIndex ? 'selected' : ''}"
             onclick="selectFile('\${file}')"
             onmouseenter="selectedFileIndex = \${i}; renderFileList('\${filter}')">
          <div class="cmd-item-icon">\${file.includes('.') ? '&#x1F4C4;' : '&#x1F4C1;'}</div>
          <div class="cmd-item-info">
            <div class="cmd-item-name">\${file.split('/').pop()}</div>
            <div class="cmd-item-desc">\${file}</div>
          </div>
        </div>
      \`).join('');
    }

    function filterFileList(filter) {
      selectedFileIndex = 0;
      renderFileList(filter);
    }

    function navigatePopup(direction) {
      if (currentPopup === 'modes') {
        const input = document.getElementById('user-input').value;
        const match = input.match(/\\/([\\w]*)$/);
        const filter = match ? match[1] : '';
        const filtered = ALL_SLASH_ITEMS.filter(item =>
          item.name.toLowerCase().includes(filter.toLowerCase()) ||
          item.id.toLowerCase().includes(filter.toLowerCase())
        );
        selectedCmdIndex = Math.max(0, Math.min(filtered.length - 1, selectedCmdIndex + direction));
        renderSlashList(filter);
      } else if (currentPopup === 'files') {
        const input = document.getElementById('user-input').value;
        const match = input.match(/@([\\w\\.\\-\\/]*)$/);
        const filter = match ? match[1] : '';
        const filteredFiles = files.filter(f =>
          f.toLowerCase().includes(filter.toLowerCase())
        ).slice(0, 20);
        selectedFileIndex = Math.max(0, Math.min(filteredFiles.length - 1, selectedFileIndex + direction));
        renderFileList(filter);
      }
    }

    function selectPopupItem() {
      if (currentPopup === 'modes') {
        const input = document.getElementById('user-input').value;
        const match = input.match(/\\/([\\w]*)$/);
        const filter = match ? match[1] : '';
        const filtered = ALL_SLASH_ITEMS.filter(item =>
          item.name.toLowerCase().includes(filter.toLowerCase()) ||
          item.id.toLowerCase().includes(filter.toLowerCase())
        );
        if (filtered[selectedCmdIndex]) {
          executeSlashItem(filtered[selectedCmdIndex].id, filtered[selectedCmdIndex].category);
        }
      } else if (currentPopup === 'files') {
        const input = document.getElementById('user-input').value;
        const match = input.match(/@([\\w\\.\\-\\/]*)$/);
        const filter = match ? match[1] : '';
        const filteredFiles = files.filter(f =>
          f.toLowerCase().includes(filter.toLowerCase())
        ).slice(0, 20);
        if (filteredFiles[selectedFileIndex]) {
          selectFile(filteredFiles[selectedFileIndex]);
        }
      }
    }

    let currentMode = 'agent';

    async function executeSlashItem(itemId, category) {
      const input = document.getElementById('user-input');
      input.value = ''; // Clear input
      closePopups();
      input.focus();

      if (category === 'mode') {
        // Switch mode
        currentMode = itemId;
        const mode = MODES.find(m => m.id === itemId);
        document.getElementById('current-mode').textContent = mode?.name || itemId;
        addMessage('system', \`Switched to \${mode?.icon || ''} \${mode?.name || itemId} mode\`);

        // Send mode switch command to TUI
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'message', content: '/mode ' + itemId }));
        }
        return;
      }

      // Execute command
      switch (itemId) {
        case 'clear':
          document.getElementById('messages').innerHTML = '<div class="message system">Chat cleared. Type <span class="hint-key">/</span> for commands.</div>';
          break;

        case 'help':
          const helpText = \`**Available Commands:**
- **/clear** - Clear chat messages
- **/help** - Show this help
- **/diff** - Show git diff
- **/status** - Show git status
- **/test** - Run project tests
- **/format** - Format code
- **/reset** - Reset session
- **/files** - List project files
- **/mode [name]** - Switch agent mode

**Available Modes:** agent, plan, tester, debugger, security, review, team_leader, architect, engineer, seo, product, data, researcher

**Tips:**
- Type **@** to reference files
- Press **Enter** to send, **Shift+Enter** for new line\`;
          addMessage('assistant', helpText);
          break;

        case 'diff':
          showThinking(true, 'Getting git diff...');
          try {
            const diffRes = await fetch('/api/git/diff');
            const diffData = await diffRes.json();
            showThinking(false);
            if (diffData.success && diffData.diff) {
              addMessage('assistant', '**Git Diff:**\\n\`\`\`diff\\n' + diffData.diff + '\\n\`\`\`');
            } else {
              addMessage('system', 'No changes to show or not a git repository.');
            }
          } catch (e) {
            showThinking(false);
            addMessage('system', 'Failed to get git diff');
          }
          break;

        case 'status':
          showThinking(true, 'Getting git status...');
          try {
            const statusRes = await fetch('/api/git/status');
            const statusData = await statusRes.json();
            showThinking(false);
            if (statusData.success) {
              const statusMsg = \`**Git Status:**
- Branch: **\${statusData.branch || 'unknown'}**
- Status: \${statusData.clean ? '✅ Clean' : '⚠️ Uncommitted changes'}
- Modified: \${statusData.modifiedCount || 0} files
- Staged: \${statusData.stagedCount || 0} files
- Untracked: \${statusData.untrackedCount || 0} files\`;
              addMessage('assistant', statusMsg);
            } else {
              addMessage('system', 'Not a git repository or git not available.');
            }
          } catch (e) {
            showThinking(false);
            addMessage('system', 'Failed to get git status');
          }
          break;

        case 'test':
          addMessage('system', 'Running tests...');
          // Send to TUI to run tests
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'message', content: 'Run the project tests' }));
          }
          break;

        case 'format':
          addMessage('system', 'Formatting code...');
          // Send to TUI to format
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'message', content: 'Format the code in this project using the appropriate formatter' }));
          }
          break;

        case 'reset':
          document.getElementById('messages').innerHTML = '<div class="message system">Session reset. Welcome to XibeCode.</div>';
          currentMode = 'agent';
          document.getElementById('current-mode').textContent = 'Agent';
          break;

        case 'files':
          showThinking(true, 'Listing files...');
          try {
            const filesRes = await fetch('/api/files');
            const filesData = await filesRes.json();
            showThinking(false);
            if (filesData.success && filesData.files) {
              const filesList = filesData.files.slice(0, 50).join('\\n');
              addMessage('assistant', \`**Project Files (\${filesData.files.length} total):**\\n\\\`\\\`\\\`\\n\${filesList}\${filesData.files.length > 50 ? '\\n... and more' : ''}\\n\\\`\\\`\\\`\`);
            } else {
              addMessage('system', 'Failed to list files.');
            }
          } catch (e) {
            showThinking(false);
            addMessage('system', 'Failed to list files');
          }
          break;
      }
    }

    function selectFile(file) {
      const input = document.getElementById('user-input');
      // Replace @xxx with the file path
      input.value = input.value.replace(/@[\\w\\.\\-\\/]*$/, '@' + file + ' ');
      closePopups();
      input.focus();
    }

    // WebSocket connection
    function connectWebSocket() {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(\`\${protocol}//\${location.host}?mode=bridge\`);

      ws.onopen = () => {
        document.getElementById('status-dot').classList.add('connected');
        document.getElementById('status-text').textContent = 'Connected';
      };

      ws.onclose = () => {
        document.getElementById('status-dot').classList.remove('connected');
        document.getElementById('status-text').textContent = 'Disconnected';
        setTimeout(connectWebSocket, 3000);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWSMessage(data);
      };
    }

    function handleWSMessage(data) {
      switch (data.type) {
        case 'user_message':
          // Only show TUI messages - WebUI messages are already shown locally
          if (data.source === 'tui') {
            addMessage('user', data.data.content + ' (TUI)');
          }
          document.getElementById('send-btn').disabled = true;
          showThinking(true);
          break;
        case 'assistant_message':
          addMessage('assistant', data.data.content);
          document.getElementById('send-btn').disabled = false;
          showThinking(false);
          break;
        case 'thinking':
          showThinking(true, data.data?.text || 'Processing...');
          break;
        case 'stream_start':
          startStreamMessage();
          showThinking(false);
          break;
        case 'stream_text':
          appendStreamText(data.data?.text || data.text || '');
          break;
        case 'stream_end':
          endStreamMessage();
          document.getElementById('send-btn').disabled = false;
          break;
        case 'tool_call':
          addToolMessage(data.data?.name || data.name, 'running');
          break;
        case 'tool_result':
          updateLastToolMessage(data.data?.name || data.name, data.data?.success ? 'success' : 'error');
          break;
        case 'complete':
          document.getElementById('send-btn').disabled = false;
          showThinking(false);
          break;
        case 'error':
          addMessage('system', 'Error: ' + (data.data?.error || data.error));
          document.getElementById('send-btn').disabled = false;
          showThinking(false);
          break;
        case 'session_sync':
          if (data.data?.sessionId) {
            document.getElementById('settings-session').value = data.data.sessionId;
          }
          break;
      }
    }

    function showThinking(show, text = 'AI is thinking...') {
      const el = document.getElementById('thinking');
      if (show) {
        el.classList.add('visible');
        document.getElementById('thinking-text').textContent = text;
      } else {
        el.classList.remove('visible');
      }
    }

    function startStreamMessage() {
      const messages = document.getElementById('messages');
      streamingMessageEl = document.createElement('div');
      streamingMessageEl.className = 'message assistant';
      streamingText = ''; // Reset streaming text
      messages.appendChild(streamingMessageEl);
      messages.scrollTop = messages.scrollHeight;
    }

    function appendStreamText(text) {
      if (streamingMessageEl && text) {
        streamingText += text;
        // For performance, only render markdown every few updates or just show plain text while streaming
        streamingMessageEl.textContent = streamingText;
        document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
      }
    }

    function endStreamMessage() {
      if (streamingMessageEl) {
        // Final markdown render when streaming is complete
        streamingMessageEl.innerHTML = renderMarkdown(streamingText);
      }
      streamingMessageEl = null;
      streamingText = '';
    }

    function addMessage(role, content) {
      const messages = document.getElementById('messages');
      const msg = document.createElement('div');
      msg.className = 'message ' + role;
      if (role === 'assistant') {
        msg.innerHTML = renderMarkdown(content);
      } else {
        msg.textContent = content;
      }
      messages.appendChild(msg);
      messages.scrollTop = messages.scrollHeight;
    }

    function addToolMessage(name, status) {
      const messages = document.getElementById('messages');
      const msg = document.createElement('div');
      msg.className = 'message tool';
      msg.innerHTML = \`<span class="tool-name">\${escapeHtml(name)}</span><span class="tool-status \${status}">\${status === 'running' ? '&#x23F3; running' : status}</span>\`;
      msg.dataset.toolName = name;
      messages.appendChild(msg);
      messages.scrollTop = messages.scrollHeight;
    }

    function updateLastToolMessage(name, status) {
      const messages = document.getElementById('messages');
      const toolMsgs = messages.querySelectorAll('.message.tool');
      for (let i = toolMsgs.length - 1; i >= 0; i--) {
        if (toolMsgs[i].dataset.toolName === name) {
          toolMsgs[i].innerHTML = \`<span class="tool-name">\${escapeHtml(name)}</span><span class="tool-status \${status}">\${status === 'success' ? '&#x2713; done' : '&#x2717; failed'}</span>\`;
          break;
        }
      }
    }

    function sendMessage() {
      const input = document.getElementById('user-input');
      const message = input.value.trim();
      if (!message) return;

      addMessage('user', message);
      input.value = '';
      autoResize(input);
      document.getElementById('send-btn').disabled = true;
      showThinking(true);

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'message', content: message }));
      }
    }

    // Simple markdown renderer
    function renderMarkdown(text) {
      if (!text) return '';
      let html = escapeHtml(text);

      // Code blocks
      html = html.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre><code>$1</code></pre>');
      // Inline code
      html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
      // Bold
      html = html.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
      // Italic
      html = html.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
      // Headers
      html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
      html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
      html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
      // Lists
      html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
      html = html.replace(/(<li>.*<\\/li>\\n?)+/g, '<ul>$&</ul>');
      // Links
      html = html.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank">$1</a>');
      // Line breaks
      html = html.replace(/\\n/g, '<br>');

      return html;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Settings
    function openSettings() {
      document.getElementById('settings-overlay').classList.add('visible');
    }

    function closeSettings(event) {
      if (!event || event.target === event.currentTarget) {
        document.getElementById('settings-overlay').classList.remove('visible');
      }
    }

    function onProviderChange() {
      const provider = document.getElementById('settings-provider').value;
      const modelSelect = document.getElementById('settings-model');
      const customField = document.getElementById('custom-model-field');
      const baseUrlField = document.getElementById('base-url-field');

      if (provider === 'anthropic') {
        modelSelect.innerHTML = \`
          <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5</option>
          <option value="claude-opus-4-5-20251101">Claude Opus 4.5</option>
          <option value="claude-haiku-4-5-20251015">Claude Haiku 4.5</option>
        \`;
        customField.style.display = 'none';
        baseUrlField.style.display = 'none';
      } else if (provider === 'openai') {
        modelSelect.innerHTML = \`
          <option value="gpt-4o">GPT-4o</option>
          <option value="gpt-4o-mini">GPT-4o Mini</option>
          <option value="gpt-4-turbo">GPT-4 Turbo</option>
          <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
        \`;
        customField.style.display = 'none';
        baseUrlField.style.display = 'none';
      } else {
        modelSelect.innerHTML = '<option value="custom">Custom Model</option>';
        customField.style.display = 'block';
        baseUrlField.style.display = 'block';
      }
    }

    async function loadProjectInfo() {
      try {
        const res = await fetch('/api/project');
        const info = await res.json();
        document.getElementById('current-path').textContent = info.workingDir || info.name || '~';
        document.getElementById('settings-workdir').value = info.workingDir || process.cwd();
        document.getElementById('settings-branch').value = info.gitBranch || 'N/A';
      } catch (e) {
        console.error('Failed to load project info:', e);
      }
    }

    async function loadConfig() {
      try {
        const res = await fetch('/api/config');
        const config = await res.json();
        document.getElementById('current-model').textContent = config.currentModel?.split('-').slice(0, 2).join('-') || 'Claude';
        document.getElementById('settings-model').value = config.currentModel || 'claude-sonnet-4-5-20250929';
        if (config.apiKeySet) {
          document.getElementById('settings-api-key').placeholder = '••••••••';
        }
      } catch (e) {
        console.error('Failed to load config:', e);
      }
    }

    async function saveSettings() {
      const provider = document.getElementById('settings-provider').value;
      const model = provider === 'custom'
        ? document.getElementById('settings-custom-model').value
        : document.getElementById('settings-model').value;
      const apiKey = document.getElementById('settings-api-key').value;
      const baseUrl = document.getElementById('settings-base-url').value;

      try {
        await fetch('/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            apiKey: apiKey || undefined,
            baseUrl: baseUrl || undefined,
            provider
          }),
        });
        addMessage('system', 'Settings saved successfully');
        closeSettings();
        // Update header
        document.getElementById('current-model').textContent = model.split('-').slice(0, 2).join('-');
      } catch (e) {
        addMessage('system', 'Failed to save settings');
      }
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
