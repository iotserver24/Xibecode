import inquirer from 'inquirer';
import readline from 'readline';
import { EnhancedAgent } from '../core/agent.js';
import { CodingToolExecutor } from '../core/tools.js';
import { MCPClientManager } from '../core/mcp-client.js';
import { EnhancedUI } from '../ui/enhanced-tui.js';
import { ConfigManager } from '../utils/config.js';
import { SessionManager, type ChatSession } from '../core/session-manager.js';
import { exportSessionToMarkdown } from '../core/export.js';
import { ContextManager } from '../core/context.js';
import { PlanMode } from '../core/planMode.js';
import { TodoManager } from '../utils/todoManager.js';
import { getAllModes, type AgentMode } from '../core/modes.js';
import { isThemeName, THEME_NAMES, type ThemeName } from '../ui/themes.js';
import { SkillManager } from '../core/skills.js';
import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ChatOptions {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  provider?: string;
  theme?: string;
  session?: string;
}

export async function chatCommand(options: ChatOptions) {
  const config = new ConfigManager();
  const preferredTheme = (options.theme || config.getTheme()) as string;
  const themeName: ThemeName = isThemeName(preferredTheme) ? preferredTheme : 'default';
  const ui = new EnhancedUI(false, themeName);
  ui.setShowDetails(config.getShowDetails());
  ui.setShowThinking(config.getShowThinking());

  const sessionManager = new SessionManager(config.getSessionDirectory());
  const contextManager = new ContextManager(process.cwd());
  const planMode = new PlanMode(process.cwd());
  const skillManager = new SkillManager(process.cwd());
  await skillManager.loadSkills();

  ui.clear();
  if (!config.isHeaderMinimal()) {
    ui.header('1.0.0');
  }

  // Get API key
  const apiKey = options.apiKey || config.getApiKey();
  if (!apiKey) {
    ui.error('No API key found!');
    console.log(chalk.white('  Set your API key:\n'));
    console.log(chalk.cyan('    xibecode config --set-key YOUR_KEY\n'));
    process.exit(1);
  }

  const model = options.model || config.getModel();
  const baseUrl = options.baseUrl || config.getBaseUrl();
  let currentProvider: 'anthropic' | 'openai' | undefined =
    (options.provider as 'anthropic' | 'openai' | undefined) || config.get('provider');

  // Initialize MCP client manager.
  // Connections are established on-demand (for example when the user runs /mcp),
  // instead of eagerly on startup.
  const mcpClientManager = new MCPClientManager();

  // Gemini‑style intro screen
  ui.chatBanner(process.cwd(), model, baseUrl);

  let enableTools = true;
  const toolExecutor = new CodingToolExecutor(process.cwd(), { mcpClientManager });

  // ── Undo/Redo history stack ──
  const undoStack: Array<{ messages: any[]; label: string }> = [];
  const redoStack: Array<{ messages: any[]; label: string }> = [];
  const MAX_UNDO = 20;

  // ── Create ONE agent for the entire chat session ──
  // This keeps conversation history (messages) across all turns,
  // so the AI remembers everything you talked about.
  let agent = new EnhancedAgent(
    {
      apiKey: apiKey as string,
      baseUrl,
      model,
      maxIterations: 150,
      verbose: false,
    },
    currentProvider
  );

  const allModes = getAllModes();
  let currentMode: AgentMode = agent.getMode();

  function setupAgentHandlers() {
    agent.removeAllListeners('event');
    agent.on('event', (event: any) => {
      switch (event.type) {
        case 'thinking':
          if (!hasResponse) {
            ui.thinking(event.data.message || 'Analyzing your request...');
          }
          break;

        // ── Streaming ──
        case 'stream_start':
          ui.startAssistantResponse();
          hasResponse = true;
          break;

        case 'stream_text':
          ui.streamText(event.data.text);
          break;

        case 'stream_end':
          ui.endAssistantResponse();
          break;

        // ── Non-streaming fallback ──
        case 'response':
          if (!hasResponse) {
            ui.response(event.data.text);
            hasResponse = true;
          }
          break;

        // ── Tools ──
        case 'tool_call':
          if (enableTools) {
            ui.toolCall(event.data.name, event.data.input);
          }
          break;

        case 'tool_result':
          if (enableTools) {
            ui.toolResult(event.data.name, event.data.result, event.data.success);

            const r = event.data.result;
            if (r?.success && event.data.name === 'write_file') {
              ui.fileChanged('created', r.path, r.lines ? `${r.lines} lines` : undefined);
            } else if (r?.success && event.data.name === 'edit_file') {
              ui.fileChanged('modified', r.path || '', r.linesChanged ? `${r.linesChanged} lines` : undefined);
            } else if (r?.success && event.data.name === 'edit_lines') {
              ui.fileChanged('modified', r.path || '', r.linesChanged ? `${r.linesChanged} lines` : undefined);
            } else if (r?.success && event.data.name === 'verified_edit') {
              ui.fileChanged('modified', r.path || '', r.linesChanged ? `${r.linesChanged} lines` : undefined);
            }

            // Diff preview: show colorized diff when available
            if (r?.diff && (event.data.name === 'edit_file' || event.data.name === 'edit_lines' || event.data.name === 'verified_edit')) {
              ui.showDiff(r.diff, r.path || r.message || '');
            }
          }
          break;

        // ── Iteration ──
        case 'iteration':
          if (!hasResponse && event.data?.current) {
            ui.updateThinking(`Thinking... step ${event.data.current}`);
          }
          hasResponse = false;
          break;

        // ── Errors / Warnings ──
        case 'error':
          ui.error(event.data.message || event.data.error);
          break;

        case 'warning':
          ui.warning(event.data.message);
          break;

        case 'mode_changed':
          currentMode = event.data.to as AgentMode;
          ui.info(`Mode: ${currentMode}`);
          break;
      }
    });
  }

  let hasResponse = false;
  setupAgentHandlers();

  // ── Session bootstrap ──────────────────────────────────
  let currentSession: ChatSession;
  const existingId = options.session;
  if (existingId) {
    const loaded = await sessionManager.loadSession(existingId);
    if (loaded) {
      currentSession = loaded;
      agent.setMessages(loaded.messages || []);
    } else {
      currentSession = await sessionManager.createSession({ model, cwd: process.cwd() });
    }
  } else {
    currentSession = await sessionManager.createSession({ model, cwd: process.cwd() });
  }

  async function showPathSuggestions(raw: string) {
    const input = raw.trim().slice(1).trim(); // drop leading '@'
    const target = input ? path.resolve(process.cwd(), input) : process.cwd();

    try {
      const stats = await fs.stat(target);
      const dir = stats.isDirectory() ? target : path.dirname(target);
      const base = stats.isDirectory() ? '' : path.basename(target);

      const entries = await fs.readdir(dir, { withFileTypes: true });
      const filtered = base
        ? entries.filter(e => e.name.toLowerCase().startsWith(base.toLowerCase()))
        : entries;

      if (!filtered.length) {
        ui.info(`No matches under ${dir}`);
        return;
      }

      console.log('');
      console.log('  ' + chalk.bold('Files & folders:'));
      for (const entry of filtered.slice(0, 50)) {
        const isDir = entry.isDirectory();
        const name = entry.name + (isDir ? '/' : '');
        const rel = path.relative(process.cwd(), path.join(dir, entry.name)) || '.';
        console.log(
          '  ' +
          (isDir ? chalk.hex('#40C4FF')('📁') : chalk.hex('#CE93D8')('📄')) +
          ' ' +
          chalk.white(name) +
          chalk.hex('#6B6B7B')(`  ·  ${rel}`)
        );
      }
      if (filtered.length > 50) {
        console.log('  ' + chalk.hex('#6B6B7B')(`… and ${filtered.length - 50} more`));
      }
      console.log('');
    } catch (error: any) {
      ui.error('Failed to list files for @ path', error);
    }
  }

  function showSlashHelp() {
    console.log('');
    console.log(chalk.bold('  XibeCode chat commands'));
    console.log('  ' + chalk.hex('#6B6B7B')('────────────────────────────'));
    console.log('  ' + chalk.hex('#00D4FF')('/help') + chalk.hex('#6B6B7B')('        show this help, not an AI reply'));
    console.log('  ' + chalk.hex('#00D4FF')('/mcp') + chalk.hex('#6B6B7B')('         show connected MCP servers and tools'));
    console.log('  ' + chalk.hex('#00D4FF')('/new') + chalk.hex('#6B6B7B')('         start a new chat session'));
    console.log('  ' + chalk.hex('#00D4FF')('/sessions') + chalk.hex('#6B6B7B')('    list and switch saved sessions'));
    console.log('  ' + chalk.hex('#00D4FF')('/models') + chalk.hex('#6B6B7B')('      show/switch models'));
    console.log('  ' + chalk.hex('#00D4FF')('/provider') + chalk.hex('#6B6B7B')('   switch between Anthropic/OpenAI format'));
    console.log('  ' + chalk.hex('#00D4FF')('/format <claude|openai>') + chalk.hex('#6B6B7B')(' quick alias to set provider'));
    console.log('  ' + chalk.hex('#00D4FF')('/export') + chalk.hex('#6B6B7B')('      export this session to Markdown'));
    console.log('  ' + chalk.hex('#00D4FF')('/plan') + chalk.hex('#6B6B7B')('        create or update todo.md from a high-level goal'));
    console.log('  ' + chalk.hex('#00D4FF')('/compact') + chalk.hex('#6B6B7B')('     compact long conversation history'));
    console.log('  ' + chalk.hex('#00D4FF')('/details') + chalk.hex('#6B6B7B')('     toggle verbose tool details'));
    console.log('  ' + chalk.hex('#00D4FF')('/thinking') + chalk.hex('#6B6B7B')('    toggle thinking spinner'));
    console.log('  ' + chalk.hex('#00D4FF')('/themes') + chalk.hex('#6B6B7B')('      choose a color theme'));
    console.log('  ' + chalk.hex('#00D4FF')('@path') + chalk.hex('#6B6B7B')('        list files/folders under path (or cwd if just "@")'));
    console.log('  ' + chalk.hex('#00D4FF')('/undo') + chalk.hex('#6B6B7B')('        undo last AI turn (restore previous conversation state)'));
    console.log('  ' + chalk.hex('#00D4FF')('/redo') + chalk.hex('#6B6B7B')('        redo undone turn'));
    console.log('  ' + chalk.hex('#00D4FF')('/cost') + chalk.hex('#6B6B7B')('        show token usage and estimated cost'));
    console.log('  ' + chalk.hex('#00D4FF')('/skill <name>') + chalk.hex('#6B6B7B')('  activate a skill (e.g. /skill refactor-clean-code)'));
    console.log('  ' + chalk.hex('#00D4FF')('/skill list') + chalk.hex('#6B6B7B')('   show available skills'));
    console.log('  ' + chalk.hex('#00D4FF')('/skill off') + chalk.hex('#6B6B7B')('    deactivate current skill'));
    console.log('  ' + chalk.hex('#00D4FF')('clear') + chalk.hex('#6B6B7B')('       clear screen and redraw header'));
    console.log('  ' + chalk.hex('#00D4FF')('tools on/off') + chalk.hex('#6B6B7B')(' toggle tools (editor & filesystem)'));
    console.log('  ' + chalk.hex('#00D4FF')('exit / quit') + chalk.hex('#6B6B7B')('   end the chat session'));
    console.log('  ' + chalk.hex('#00D4FF')('!cmd') + chalk.hex('#6B6B7B')('         run a shell command and feed output to AI'));
    console.log('');
  }

  async function handleShellBang(input: string) {
    const cmd = input.slice(1).trim();
    if (!cmd) {
      ui.warning('No command provided after "!". Example: !ls -la');
      return;
    }
    ui.info(`Running shell command: ${cmd}`);
    const result = await toolExecutor.execute('run_command', { command: cmd, cwd: process.cwd(), timeout: 300 });
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';

    console.log('');
    console.log(chalk.bold('  Command Output'));
    console.log('  ' + chalk.hex('#6B6B7B')('────────────────────────────'));
    if (stdout) {
      console.log(chalk.white(stdout));
    }
    if (stderr) {
      console.log(chalk.red(stderr));
    }
    console.log('');

    const summary = [
      `Shell command: ${cmd}`,
      '',
      stdout ? stdout : '',
      stderr ? `STDERR:\n${stderr}` : '',
    ].join('\n');

    const tools = enableTools ? toolExecutor.getTools() : [];
    await agent.run(summary, tools, toolExecutor);
    const stats = agent.getStats();
    if (config.isStatusBarEnabled()) {
      ui.renderStatusBar({
        model,
        sessionTitle: currentSession.title,
        cwd: process.cwd(),
        toolsEnabled: enableTools,
        themeName: ui.getThemeName(),
        mode: currentMode,
      });
    }
    await sessionManager.saveMessagesAndStats({
      id: currentSession.id,
      messages: agent.getMessages(),
      stats,
    });
  }

  async function handleSessionsCommand() {
    const sessions = await sessionManager.listSessions();
    if (sessions.length === 0) {
      ui.info('No saved sessions yet.');
      return;
    }
    const { picked } = await inquirer.prompt([
      {
        type: 'list',
        name: 'picked',
        message: 'Select session',
        choices: sessions.map(s => ({
          name: `${s.title}  ·  ${s.model}  ·  ${s.updated}`,
          value: s.id,
        })),
      },
    ]);

    const loaded = await sessionManager.loadSession(picked);
    if (!loaded) {
      ui.error('Failed to load selected session');
      return;
    }
    currentSession = loaded;
    agent.setMessages(loaded.messages || []);
    ui.success(`Switched to session ${loaded.title}`);
  }

  async function handleNewSession() {
    currentSession = await sessionManager.createSession({ model, cwd: process.cwd() });
    agent = new EnhancedAgent(
      {
        apiKey: apiKey as string,
        baseUrl,
        model,
        maxIterations: 150,
        verbose: false,
      },
      currentProvider || config.get('provider')
    );
    setupAgentHandlers();
    currentMode = agent.getMode();
    ui.success('Started new session');
  }

  async function handleModelsCommand() {
    const current = model;
    const fixedModels = [
      'claude-sonnet-4-5-20250929',
      'claude-opus-4-5-20251101',
      'claude-haiku-4-5-20251015',
    ];
    const customModels = (config.get('customModels') || []) as { id: string; provider: string }[];
    const unique = Array.from(new Set([current, ...fixedModels, ...customModels.map(m => m.id)]));

    const { picked } = await inquirer.prompt([
      {
        type: 'list',
        name: 'picked',
        message: 'Select model',
        choices: unique.map(m => {
          const cm = customModels.find(x => x.id === m);
          const labelBase = cm ? `${m} (${cm.provider})` : m;
          const name = m === current ? `${labelBase} (current)` : labelBase;
          return { name, value: m };
        }),
      },
    ]);
    config.set('model', picked);
    ui.success(`Model set to: ${picked}`);
  }

  async function handleThemesCommand() {
    const current = ui.getThemeName();
    const { picked } = await inquirer.prompt([
      {
        type: 'list',
        name: 'picked',
        message: 'Select theme',
        choices: THEME_NAMES.map(name => ({
          name: name === current ? `${name} (current)` : name,
          value: name,
        })),
      },
    ]);
    ui.setTheme(picked);
    config.set('theme', picked);
    ui.success(`Theme set to: ${picked}`);
  }

  async function handleExportCommand() {
    const session: ChatSession = {
      ...currentSession,
      messages: agent.getMessages(),
    };
    const markdown = exportSessionToMarkdown(session);
    const exportsDir = path.join(config['getConfigPath' as keyof ConfigManager] as any, '..', 'sessions');
    const fileName = `${session.id}.md`;
    const fullPath = path.join(exportsDir, fileName);
    await fs.mkdir(exportsDir, { recursive: true });
    await fs.writeFile(fullPath, markdown, 'utf-8');
    ui.success(`Session exported to ${fullPath}`);
  }

  async function handlePlanCommand(raw: string) {
    const description = raw.replace(/^\/plan\s*/i, '').trim();
    if (!description) {
      ui.info('Usage: /plan your high-level goal here');
      return;
    }

    const result = await planMode.buildPlan(description);
    const todoManager = new TodoManager(process.cwd());
    const next = todoManager.getNextPending(result.doc);

    ui.success(`Created/updated todo.md with ${result.tasks.length} task(s).`);
    if (next) {
      ui.info(`Next TODO [id:${next.id}]: ${next.title}`);
    }
  }

  async function handleCompactCommand() {
    const messages = agent.getMessages();
    if (messages.length <= 10) {
      ui.info('Conversation is short; no compaction needed.');
      return;
    }
    const preserved = messages.slice(-6);
    const summaryMessage: any = {
      role: 'assistant',
      content: 'Earlier conversation has been compacted to save context. Key details from the last messages are preserved.',
    };
    const compacted = [summaryMessage, ...preserved];
    agent.setMessages(compacted);
    await sessionManager.saveMessagesAndStats({
      id: currentSession.id,
      messages: compacted,
      stats: agent.getStats(),
    });
    ui.success('Conversation compacted.');
  }

  async function handleAtPathFuzzy(raw: string) {
    const input = raw.trim().slice(1).trim();
    const pattern = input ? `**/*${input}*` : '**/*';
    try {
      const files = await contextManager.searchFiles(pattern, { maxResults: 100 });
      if (!files.length) {
        ui.info(`No matches for pattern ${pattern}`);
        return;
      }
      console.log('');
      console.log('  ' + chalk.bold('Files'));
      console.log('  ' + chalk.hex('#6B6B7B')('────────────────────────────'));
      files.forEach(f => {
        console.log('  ' + chalk.hex('#CE93D8')('📄') + ' ' + chalk.white(f));
      });
      console.log('');
    } catch (error: any) {
      ui.error('Failed to search files for @ path', error);
    }
  }

  // ── Global key handler for mode cycling (Tab) ───────────
  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    if (typeof (process.stdin as any).setRawMode === 'function') {
      try {
        (process.stdin as any).setRawMode(true);
      } catch {
        // ignore if raw mode cannot be set (e.g. non‑TTY env)
      }
    }

    process.stdin.on('keypress', (_str, key: any) => {
      if (!key) return;
      if (key.name === 'tab') {
        const idx = allModes.indexOf(currentMode);
        const next = allModes[(idx + 1) % allModes.length];
        currentMode = next;
        if (typeof (agent as any).setModeFromUser === 'function') {
          (agent as any).setModeFromUser(next, 'User pressed Tab to cycle mode');
        }
        ui.info(`Mode: ${currentMode} (press Tab to cycle)`);
        if (config.isStatusBarEnabled()) {
          ui.renderStatusBar({
            model,
            sessionTitle: currentSession.title,
            cwd: process.cwd(),
            toolsEnabled: enableTools,
            themeName: ui.getThemeName(),
            mode: currentMode,
          });
        }
      }
    });
  }

  // ── Chat loop ──
  while (true) {
    let { message } = await inquirer.prompt([
      {
        type: 'input',
        name: 'message',
        message: chalk.hex('#00E676').bold('❯ You '),
        prefix: '',
      },
    ]);

    // Special interactive flow when user types just "@"
    if (message.trim() === '@') {
      try {
        const dir = process.cwd();
        const entries = await fs.readdir(dir, { withFileTypes: true });

        if (!entries.length) {
          ui.info('No files or folders in current directory');
          continue;
        }

        const choices = entries.slice(0, 100).map(entry => {
          const isDir = entry.isDirectory();
          const label =
            (isDir ? '📁 ' : '📄 ') +
            entry.name +
            (isDir ? '/' : '');
          return {
            name: label,
            value: entry.name + (isDir ? '/' : ''),
          };
        });

        const { picked } = await inquirer.prompt([
          {
            type: 'list',
            name: 'picked',
            message: 'Select file or folder',
            choices,
          },
        ]);

        const followUp = await inquirer.prompt([
          {
            type: 'input',
            name: 'message',
            message: chalk.hex('#00E676').bold('❯ You '),
            prefix: '',
            default: '@' + picked,
          },
        ]);

        message = followUp.message;
      } catch (error: any) {
        ui.error('Failed to list files for selection', error);
        continue;
      }
    }

    if (!message.trim()) continue;

    const trimmed = message.trim();
    const lowerMessage = trimmed.toLowerCase();

    if (lowerMessage === '/help') {
      showSlashHelp();
      continue;
    }

    if (lowerMessage === '/new') {
      await handleNewSession();
      continue;
    }

    if (lowerMessage === '/sessions') {
      await handleSessionsCommand();
      continue;
    }

    if (lowerMessage === '/models') {
      await handleModelsCommand();
      continue;
    }

    if (lowerMessage === '/provider') {
      const { picked } = await inquirer.prompt([
        {
          type: 'list',
          name: 'picked',
          message: 'Select provider / API format',
          choices: [
            { name: 'Anthropic format (Claude / Messages API)', value: 'anthropic' },
            { name: 'OpenAI-compatible format (chat/completions)', value: 'openai' },
          ],
        },
      ]);

      currentProvider = picked;
      config.set('provider', picked);

      // Recreate agent with new provider but keep conversation history
      const previousMessages = agent.getMessages();
      agent = new EnhancedAgent(
        {
          apiKey: apiKey as string,
          baseUrl: config.getBaseUrl() || baseUrl,
          model,
          maxIterations: 150,
          verbose: false,
        },
        currentProvider
      );
      agent.setMessages(previousMessages);
      setupAgentHandlers();
      currentMode = agent.getMode();

      ui.success(`Provider set to: ${picked}`);
      continue;
    }

    if (lowerMessage.startsWith('/format')) {
      const parts = trimmed.split(/\s+/);
      const arg = (parts[1] || '').toLowerCase();

      if (!arg) {
        ui.info('Usage: /format claude   or   /format openai');
        continue;
      }

      let pickedProvider: 'anthropic' | 'openai' | null = null;
      if (arg === 'claude' || arg === 'anthropic') {
        pickedProvider = 'anthropic';
      } else if (arg === 'openai') {
        pickedProvider = 'openai';
      } else {
        ui.warning('Unknown format. Use "claude" or "openai".');
        continue;
      }

      currentProvider = pickedProvider;
      config.set('provider', pickedProvider);

      // Recreate agent with new provider but keep conversation history
      const previousMessages = agent.getMessages();
      agent = new EnhancedAgent(
        {
          apiKey: apiKey as string,
          baseUrl: config.getBaseUrl() || baseUrl,
          model,
          maxIterations: 150,
          verbose: false,
        },
        currentProvider
      );
      agent.setMessages(previousMessages);
      setupAgentHandlers();
      currentMode = agent.getMode();

      ui.success(`Provider/format set via /format: ${pickedProvider}`);
      continue;
    }

    if (lowerMessage.startsWith('/plan')) {
      await handlePlanCommand(trimmed);
      continue;
    }

    if (lowerMessage === '/themes') {
      await handleThemesCommand();
      continue;
    }

    if (lowerMessage === '/export') {
      await handleExportCommand();
      continue;
    }

    if (lowerMessage === '/compact') {
      await handleCompactCommand();
      continue;
    }

    if (lowerMessage === '/undo') {
      if (undoStack.length === 0) {
        ui.info('Nothing to undo.');
      } else {
        const current = { messages: [...agent.getMessages()], label: 'redo point' };
        redoStack.push(current);
        const prev = undoStack.pop()!;
        agent.setMessages(prev.messages);
        await sessionManager.saveMessagesAndStats({ id: currentSession.id, messages: prev.messages, stats: agent.getStats() });
        ui.success(`Undo: reverted to previous state (${prev.label})`);
      }
      continue;
    }

    if (lowerMessage === '/redo') {
      if (redoStack.length === 0) {
        ui.info('Nothing to redo.');
      } else {
        const current = { messages: [...agent.getMessages()], label: 'undo point' };
        undoStack.push(current);
        const next = redoStack.pop()!;
        agent.setMessages(next.messages);
        await sessionManager.saveMessagesAndStats({ id: currentSession.id, messages: next.messages, stats: agent.getStats() });
        ui.success(`Redo: restored next state`);
      }
      continue;
    }

    if (lowerMessage === '/cost') {
      const stats = agent.getStats();
      console.log('');
      console.log(chalk.bold('  Token Usage & Cost'));
      console.log('  ' + chalk.hex('#6B6B7B')('────────────────────────────'));
      console.log('  ' + chalk.hex('#00D4FF')('Input tokens:  ') + chalk.white(stats.inputTokens.toLocaleString()));
      console.log('  ' + chalk.hex('#00D4FF')('Output tokens: ') + chalk.white(stats.outputTokens.toLocaleString()));
      console.log('  ' + chalk.hex('#00D4FF')('Total tokens:  ') + chalk.white(stats.totalTokens.toLocaleString()));
      if (stats.costLabel) {
        console.log('  ' + chalk.hex('#00D4FF')('Est. cost:     ') + chalk.hex('#00E676')(stats.costLabel));
      } else {
        console.log('  ' + chalk.hex('#6B6B7B')('  (cost tracking unavailable for this model)'));
      }
      console.log('');
      continue;
    }

    if (lowerMessage.startsWith('/skill')) {
      const parts = trimmed.split(/\s+/);
      const subcommand = parts[1]?.toLowerCase();

      if (!subcommand || subcommand === 'list') {
        const skills = skillManager.listSkills();
        console.log('');
        console.log(chalk.bold('  Available Skills'));
        console.log('  ' + chalk.hex('#6B6B7B')('────────────────────────────────'));
        if (skills.length === 0) {
          console.log('  ' + chalk.hex('#6B6B7B')('No skills found'));
        } else {
          skills.forEach(skill => {
            const active = agent.getActiveSkill() === skill.name ? chalk.hex('#00E676')(' (active)') : '';
            console.log('  ' + chalk.hex('#00D4FF')(skill.name) + active);
            console.log('    ' + chalk.hex('#6B6B7B')(skill.description));
            if (skill.tags && skill.tags.length > 0) {
              console.log('    ' + chalk.dim(`tags: ${skill.tags.join(', ')}`));
            }
            console.log('');
          });
        }
        console.log('  ' + chalk.dim('Usage: /skill <name> to activate'));
        console.log('');
        continue;
      }

      if (subcommand === 'off') {
        agent.setSkill(null);
        ui.success('Skill deactivated');
        continue;
      }

      // Activate skill
      const skillName = parts.slice(1).join('-');
      const skill = skillManager.getSkill(skillName);
      if (!skill) {
        ui.error(`Skill not found: ${skillName}`);
        console.log('  ' + chalk.dim('Use /skill list to see available skills'));
        continue;
      }

      agent.setSkill(skill.name, skill.instructions);
      ui.success(`Activated skill: ${skill.name}`);
      console.log('  ' + chalk.hex('#6B6B7B')(skill.description));
      continue;
    }

    if (lowerMessage === '/details') {
      const next = !ui.getShowDetails();
      ui.setShowDetails(next);
      config.set('showDetails', next);
      ui.success(`Details ${next ? 'enabled' : 'disabled'}`);
      continue;
    }

    if (lowerMessage === '/thinking') {
      const next = !ui.getShowThinking();
      ui.setShowThinking(next);
      config.set('showThinking', next);
      ui.success(`Thinking display ${next ? 'enabled' : 'disabled'}`);
      continue;
    }

    if (lowerMessage === '/mcp') {
      console.log('');
      console.log(chalk.bold('  MCP Servers'));
      console.log('  ' + chalk.hex('#6B6B7B')('────────────────────────────'));

      try {
        // Load configured servers and establish connections on-demand
        const mcpServers = await config.getMCPServers();
        const serverNames = Object.keys(mcpServers);

        if (serverNames.length === 0) {
          console.log('  ' + chalk.hex('#6B6B7B')('No MCP servers configured'));
          console.log('  ' + chalk.dim('Configure servers with: xibecode mcp add'));
        } else {
          console.log('  ' + chalk.hex('#6B6B7B')(`Connecting to ${serverNames.length} MCP server(s)...`));
          for (const serverName of serverNames) {
            const serverConfig = mcpServers[serverName];

            // Skip servers that are already connected in this session
            if (!mcpClientManager.getConnectedServers().includes(serverName)) {
              try {
                await mcpClientManager.connect(serverName, serverConfig);
                const tools = mcpClientManager
                  .getAvailableTools()
                  .filter(t => t.serverName === serverName);
                console.log('  ' + chalk.green(`✓ ${serverName} (${tools.length} tool(s))`));
              } catch (error: any) {
                console.log('  ' + chalk.yellow(`✗ Failed to connect to ${serverName}: ${error.message}`));
              }
            }
          }
        }

        const connectedServers = mcpClientManager.getConnectedServers();
        if (connectedServers.length === 0) {
          console.log('  ' + chalk.hex('#6B6B7B')('No MCP servers connected'));
          console.log('  ' + chalk.dim('Configure servers with: xibecode config --add-mcp-server'));
        } else {
          for (const serverName of connectedServers) {
            const serverTools = mcpClientManager.getAvailableTools().filter(t => t.serverName === serverName);
            const serverResources = mcpClientManager.getAvailableResources().filter(r => r.serverName === serverName);
            const serverPrompts = mcpClientManager.getAvailablePrompts().filter(p => p.serverName === serverName);

            console.log('');
            console.log('  ' + chalk.hex('#00D4FF')(serverName));
            console.log('    ' + chalk.hex('#6B6B7B')(`Tools: ${serverTools.length} | Resources: ${serverResources.length} | Prompts: ${serverPrompts.length}`));

            if (serverTools.length > 0) {
              console.log('    ' + chalk.dim('Tools:'));
              serverTools.forEach(tool => {
                console.log('      ' + chalk.hex('#00D4FF')(`${tool.name}`) + chalk.hex('#6B6B7B')(` - ${tool.description}`));
              });
            }
          }
        }
      } catch (error: any) {
        console.log('  ' + chalk.yellow(`Failed to load MCP configuration: ${error.message}`));
      }

      console.log('');
      continue;
    }

    if (trimmed.startsWith('@')) {
      await handleAtPathFuzzy(trimmed);
      continue;
    }

    if (trimmed.startsWith('!')) {
      await handleShellBang(trimmed);
      console.log('');
      continue;
    }

    if (lowerMessage === 'exit' || lowerMessage === 'quit') {
      const stats = agent.getStats();
      console.log('');
      if (stats.toolCalls > 0 || stats.iterations > 0) {
        console.log(chalk.hex('#6B6B7B')(`  session: ${stats.iterations} turns · ${stats.toolCalls} tool calls · ${stats.filesChanged} files changed`));
        console.log('');
      }
      console.log(chalk.hex('#3A3A4A')('  ╭──────────────────────────────────╮'));
      console.log(chalk.hex('#3A3A4A')('  │') + chalk.hex('#00D4FF')('  👋 See you next time!             ') + chalk.hex('#3A3A4A')('│'));
      console.log(chalk.hex('#3A3A4A')('  ╰──────────────────────────────────╯'));
      console.log('');
      await sessionManager.saveMessagesAndStats({
        id: currentSession.id,
        messages: agent.getMessages(),
        stats,
      });
      break;
    }

    if (lowerMessage === 'clear') {
      ui.clear();
      if (!config.isHeaderMinimal()) {
        ui.header('1.0.0');
      }
      ui.chatBanner(process.cwd(), model, baseUrl);
      continue;
    }

    if (lowerMessage === 'tools on') {
      enableTools = true;
      ui.success('Tools enabled');
      continue;
    }

    if (lowerMessage === 'tools off') {
      enableTools = false;
      ui.success('Tools disabled');
      continue;
    }

    // Reset per-message display flag
    hasResponse = false;

    try {
      const tools = enableTools ? toolExecutor.getTools() : [];

      // Save undo point before AI turn
      undoStack.push({ messages: [...agent.getMessages()], label: message.slice(0, 40) });
      if (undoStack.length > MAX_UNDO) undoStack.shift();
      redoStack.length = 0; // clear redo on new action

      // agent.run() resets its iteration/tool counters but KEEPS
      // the conversation history (this.messages), so the AI has
      // full context of everything discussed in this session.
      await agent.run(message, tools, toolExecutor);
      const stats = agent.getStats();

      // Build tokens label for status bar
      const tokensLabel = stats.totalTokens > 0
        ? `${(stats.totalTokens / 1000).toFixed(1)}k${stats.costLabel ? ` · ${stats.costLabel}` : ''}`
        : undefined;

      const activeSkill = agent.getActiveSkill();
      if (config.isStatusBarEnabled()) {
        ui.renderStatusBar({
          model,
          sessionTitle: currentSession.title,
          tokensLabel,
          cwd: process.cwd(),
          toolsEnabled: enableTools,
          themeName: ui.getThemeName(),
          mode: currentMode,
          activeSkill,
        });
      }
      await sessionManager.saveMessagesAndStats({
        id: currentSession.id,
        messages: agent.getMessages(),
        stats,
      });
    } catch (error: any) {
      ui.error('Failed to process message', error);
    }

    console.log('');
  }

  // Cleanup: disconnect from any MCP servers connected during this session
  await mcpClientManager.disconnectAll();
}
