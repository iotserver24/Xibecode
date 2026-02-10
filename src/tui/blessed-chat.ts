import blessed from 'blessed';
import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createRequire } from 'module';

import { EnhancedAgent } from '../core/agent.js';
import { CodingToolExecutor } from '../core/tools.js';
import { MCPClientManager } from '../core/mcp-client.js';
import { ConfigManager } from '../utils/config.js';
import { SessionManager, type ChatSession } from '../core/session-manager.js';
import { ContextManager } from '../core/context.js';
import { isThemeName, THEME_NAMES, type ThemeName } from '../ui/themes.js';
import { renderMarkdownToAnsi } from './markdown-to-blessed.js';
import { getAllModes, type AgentMode } from '../core/modes.js';
import { exportSessionToMarkdown } from '../core/export.js';

export interface BlessedChatOptions {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  theme?: string;
  session?: string;
}

type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

interface ChatLine {
  role: ChatRole;
  text: string;
}

export async function runBlessedChat(options: BlessedChatOptions): Promise<void> {
  const config = new ConfigManager();
  const preferredTheme = (options.theme || config.getTheme()) as string;
  const themeName: ThemeName = isThemeName(preferredTheme) ? preferredTheme : 'default';

  const apiKey = options.apiKey || config.getApiKey();
  if (!apiKey) {
    // Use plain console output before blessed is initialised.
    // eslint-disable-next-line no-console
    console.error('No API key found!');
    // eslint-disable-next-line no-console
    console.log('  Set your API key:\n');
    // eslint-disable-next-line no-console
    console.log('    xibecode config --set-key YOUR_KEY\n');
    process.exit(1);
  }

  const model = options.model || config.getModel();
  const baseUrl = options.baseUrl || config.getBaseUrl();

  const sessionManager = new SessionManager(config.getSessionDirectory());
  const contextManager = new ContextManager(process.cwd());
  const mcpClientManager = new MCPClientManager();

  const mcpServers = await config.getMCPServers();
  const serverNames = Object.keys(mcpServers);

  // Connect MCP servers before launching TUI so we can show status.
  for (const serverName of serverNames) {
    const serverConfig = mcpServers[serverName];
    try {
      await mcpClientManager.connect(serverName, serverConfig);
    } catch {
      // Ignore connection failures here; they will be visible via /mcp later.
    }
  }

  const toolExecutor = new CodingToolExecutor(process.cwd(), { mcpClientManager });

  let agent = new EnhancedAgent({
    apiKey: apiKey as string,
    baseUrl,
    model,
    maxIterations: 150,
    verbose: false,
  });

  let currentMode: AgentMode = agent.getMode();
  const allModes = getAllModes();
  let enableTools = true;

  let currentSession: ChatSession;
  if (options.session) {
    const loaded = await sessionManager.loadSession(options.session);
    if (loaded) {
      currentSession = loaded;
    } else {
      currentSession = await sessionManager.createSession({ model, cwd: process.cwd() });
    }
  } else {
    currentSession = await sessionManager.createSession({ model, cwd: process.cwd() });
  }

  agent.setMessages(currentSession.messages || []);

  // ─── Blessed screen & layout ─────────────────────────────

  const screen = blessed.screen({
    smartCSR: true,
    title: 'XibeCode',
  });

  // Node ESM-safe require for reading package.json at runtime
  const require = createRequire(import.meta.url);
  const pkg = require('../../package.json') as { version?: string };

  // ─── Big XibeCode banner (gradient ASCII, similar to classic UI) ───
  const logoLines = [
    '██╗  ██╗██╗██████╗ ███████╗ ██████╗ ██████╗ ██████╗ ███████╗',
    '╚██╗██╔╝██║██╔══██╗██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔════╝',
    ' ╚███╔╝ ██║██████╔╝█████╗  ██║     ██║   ██║██║  ██║█████╗  ',
    ' ██╔██╗ ██║██╔══██╗██╔══╝  ██║     ██║   ██║██╔══██╗██╔══╝  ',
    '██╔╝ ██╗██║██████╔╝███████╗╚██████╗╚██████╔╝██████╔╝███████╗',
    '╚═╝  ╚═╝╚═╝╚═════╝ ╚══════╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝',
  ];

  function buildGradientBanner(lines: string[]): string {
    const start = { r: 89, g: 149, b: 235 };
    const end = { r: 224, g: 108, b: 117 };
    const out: string[] = [];
    for (const line of lines) {
      let coloredLine = '';
      const len = line.length;
      for (let i = 0; i < len; i++) {
        const ratio = i / len;
        const r = Math.floor(start.r + (end.r - start.r) * ratio);
        const g = Math.floor(start.g + (end.g - start.g) * ratio);
        const b = Math.floor(start.b + (end.b - start.b) * ratio);
        coloredLine += `\x1b[38;2;${r};${g};${b}m${line[i]}`;
      }
      out.push(coloredLine + '\x1b[0m');
    }
    out.push('');
    out.push(chalk.hex('#00D4FF').bold('XibeCode'));
    out.push(chalk.gray('AI-powered autonomous coding assistant') + chalk.gray(`  ·  v${pkg.version ?? 'dev'}`));
    return out.join('\n');
  }

  const bannerHeight = logoLines.length + 4;

  const banner = blessed.box({
    top: 0,
    left: 0,
    right: 0,
    height: bannerHeight,
    tags: false, // use raw ANSI colors
    content: buildGradientBanner(logoLines),
  });

  const header = blessed.box({
    top: bannerHeight,
    left: 0,
    right: 0,
    height: 1,
    tags: true,
    style: {
      fg: 'white',
      bg: 'black',
    },
    content:
      ' Tab: {green-fg}mode{/green-fg}  |  /help: {green-fg}commands{/green-fg}  |  {red-fg}q{/red-fg}: quit',
  });

  const messagesBox = blessed.box({
    top: bannerHeight + 1,
    left: 0,
    right: 0,
    bottom: 3,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: ' ' } as any,
    keys: true,
    mouse: true,
    tags: false,
    border: { type: 'line' },
    label: ' Conversation ',
    style: {
      border: { fg: 'grey' },
    },
  });

  const statusBar = blessed.box({
    bottom: 3,
    left: 0,
    right: 0,
    height: 2,
    tags: true,
    style: {
      fg: 'grey',
      bg: 'black',
    },
  });

  const input = blessed.textbox({
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    inputOnFocus: true,
    keys: true,
    mouse: true,
    border: { type: 'line' },
    label: ' Type your message or @path/to/file ',
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'gray' },
      focus: {
        border: { fg: 'cyan' },
      },
    },
  });

  screen.append(banner);
  screen.append(header);
  screen.append(messagesBox);
  screen.append(statusBar);
  screen.append(input);

  const lines: ChatLine[] = [];
  let showDetails = config.getShowDetails();
  let showThinking = config.getShowThinking();

  function getToolIcon(name: string): string {
    const icons: Record<string, string> = {
      read_file: '📄',
      read_multiple_files: '📚',
      write_file: '✍️',
      edit_file: '✏️',
      edit_lines: '🔧',
      delete_file: '🗑️',
      run_command: '⚡',
      search_files: '🔎',
      list_directory: '📂',
      create_directory: '📁',
      move_file: '📦',
      get_context: '🧠',
      revert_file: '↩️',
      insert_at_line: '➕',
    };
    return icons[name] || '🔧';
  }

  function summarizeToolInput(name: string, input: any): string | null {
    if (!input) return null;
    switch (name) {
      case 'read_file':
        return input.start_line
          ? `${input.path} (${input.start_line}-${input.end_line})`
          : input.path || null;
      case 'read_multiple_files':
        return Array.isArray(input.paths) ? `${input.paths.length} files` : null;
      case 'write_file':
      case 'edit_file':
      case 'edit_lines':
        return input.path || null;
      case 'run_command':
        if (!input.command) return null;
        return input.command.length > 60 ? `${input.command.slice(0, 57)}...` : input.command;
      case 'search_files':
        return input.pattern || null;
      case 'list_directory':
        return input.path || '.';
      default:
        return null;
    }
  }

  function summarizeToolResult(name: string, result: any): string | null {
    if (!result) return null;
    if (result.error || result.success === false) {
      return result.message || 'failed';
    }
    switch (name) {
      case 'read_file':
        return result.lines !== undefined ? `${result.lines} lines` : null;
      case 'read_multiple_files':
        return result.files ? `${result.files.length} files read` : null;
      case 'write_file':
        return result.lines ? `${result.lines} lines written` : 'written';
      case 'edit_file':
        return result.linesChanged ? `${result.linesChanged} lines changed` : 'edited';
      case 'run_command':
        return result.success ? 'ok' : 'failed';
      case 'search_files':
        return `${result.count ?? 0} matches`;
      case 'list_directory':
        return `${result.count ?? 0} items`;
      default:
        return 'ok';
    }
  }

  function formatToolCall(name: string, input: any): string {
    const icon = getToolIcon(name);
    const summary = summarizeToolInput(name, input);
    let header = `${chalk.gray('╭─')} ${icon} ${chalk.cyan(name)}`;
    if (summary) {
      header += ' ' + chalk.dim(summary);
    }
    if (!showDetails || !input) return header;

    const json = JSON.stringify(input, null, 2)
      .split('\n')
      .slice(0, 20)
      .map(line => `${chalk.gray('│')}  ${chalk.dim(line)}`)
      .join('\n');
    return `${header}\n${json}`;
  }

  function formatToolResult(name: string, result: any, success: boolean): string {
    const icon = success ? chalk.green('✔') : chalk.red('✘');
    const summary = summarizeToolResult(name, result);
    let header = `${chalk.gray('╰─')} ${icon}`;
    if (summary) {
      header += '  ' + chalk.dim(summary);
    }

    if (!showDetails || !result || !success) return header;

    const bodyStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    const json = bodyStr
      .split('\n')
      .slice(0, 30)
      .map(line => `   ${chalk.dim(line)}`)
      .join('\n');
    return `${header}\n${json}`;
  }

  function pushLine(line: ChatLine) {
    lines.push(line);
    renderMessages();
  }

  function renderMessages() {
    const rendered: string[] = [];
    for (const line of lines) {
      if (line.role === 'user') {
        rendered.push(chalk.green('You: ') + line.text);
      } else if (line.role === 'assistant') {
        const body = renderMarkdownToAnsi(line.text);
        rendered.push(chalk.cyan('Assistant:') + '\n' + body);
      } else if (line.role === 'tool') {
        rendered.push(line.text);
      } else {
        rendered.push(chalk.yellow(line.text));
      }
      rendered.push('');
    }
    messagesBox.setContent(rendered.join('\n'));
    messagesBox.setScrollPerc(100);
    updateStatus();
    screen.render();
  }

  function updateStatus() {
    if (!config.isStatusBarEnabled()) return;
    const parts: string[] = [];
    parts.push(`model: ${model}`);
    parts.push(`mode: ${currentMode}`);
    if (currentSession?.title) parts.push(`session: ${currentSession.title}`);
    parts.push(`tools: ${enableTools ? 'on' : 'off'}`);
    parts.push(`theme: ${themeName}`);
    const cwd = process.cwd();
    statusBar.setContent(
      `${chalk.gray(cwd)}\n${chalk.gray(parts.join('  |  '))}`,
    );
  }

  function cycleMode() {
    const idx = allModes.indexOf(currentMode);
    const next = allModes[(idx + 1) % allModes.length];
    agent.setModeFromUser(next, 'User pressed Tab to cycle mode');
    currentMode = next;
    pushLine({
      role: 'system',
      text: `Mode changed to ${next}`,
    });
  }

  async function runUserMessage(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;

    // Slash commands
    if (trimmed === '/help') {
      pushLine({
        role: 'system',
        text:
          'Commands: /help, /new, /sessions, /models, /themes, /export, /compact, /details, /thinking, /mcp\n' +
          'Use !<cmd> to run shell commands. Tab to cycle modes.',
      });
      return;
    }

    if (trimmed === '/new') {
      currentSession = await sessionManager.createSession({ model, cwd: process.cwd() });
      agent = new EnhancedAgent({
        apiKey: apiKey as string,
        baseUrl,
        model,
        maxIterations: 150,
        verbose: false,
      });
      lines.length = 0;
      setupAgentHandlers();
      currentMode = agent.getMode();
      pushLine({ role: 'system', text: 'Started new session.' });
      renderMessages();
      return;
    }

    if (trimmed === '/sessions') {
      const sessions = await sessionManager.listSessions();
      if (!sessions.length) {
        pushLine({ role: 'system', text: 'No saved sessions.' });
        return;
      }
      const items = sessions.map(
        (s, i) => `${i + 1}. ${s.title}  ·  ${s.model}  ·  ${s.updated}  [${s.id}]`,
      );
      const list = blessed.list({
        parent: screen,
        top: 'center',
        left: 'center',
        width: '70%',
        height: '60%',
        border: 'line',
        label: ' Sessions ',
        keys: true,
        mouse: true,
        items,
        style: {
          selected: { bg: 'blue', fg: 'white' },
        },
      });
      list.focus();
      list.key(['escape', 'q'], () => {
        list.destroy();
        input.focus();
        screen.render();
      });
      list.on('select', async (item, index) => {
        const session = sessions[index];
        const loaded = await sessionManager.loadSession(session.id);
        if (loaded) {
          currentSession = loaded;
          agent.setMessages(loaded.messages || []);
          lines.length = 0;
          pushLine({ role: 'system', text: `Switched to session: ${loaded.title}` });
          renderMessages();
        } else {
          pushLine({ role: 'system', text: `Failed to load session ${session.id}` });
        }
        list.destroy();
        input.focus();
        screen.render();
      });
      screen.render();
      return;
    }

    if (trimmed === '/models') {
      const current = model;
      const candidates = [
        current,
        'claude-sonnet-4-5-20250929',
        'claude-opus-4-5-20251101',
        'claude-haiku-4-5-20251015',
      ];
      const unique = Array.from(new Set(candidates));
      const list = blessed.list({
        parent: screen,
        top: 'center',
        left: 'center',
        width: '60%',
        height: '50%',
        border: 'line',
        label: ' Models ',
        keys: true,
        mouse: true,
        items: unique.map(m => (m === current ? `${m} (current)` : m)),
        style: {
          selected: { bg: 'blue', fg: 'white' },
        },
      });
      list.focus();
      list.key(['escape', 'q'], () => {
        list.destroy();
        input.focus();
        screen.render();
      });
      list.on('select', async item => {
        const text = (item.getText() as string).replace(' (current)', '');
        config.set('model', text);
        pushLine({ role: 'system', text: `Model set to ${text}. Restart chat to apply.` });
        list.destroy();
        input.focus();
        screen.render();
      });
      screen.render();
      return;
    }

    if (trimmed === '/themes') {
      const current = themeName;
      const list = blessed.list({
        parent: screen,
        top: 'center',
        left: 'center',
        width: '60%',
        height: '50%',
        border: 'line',
        label: ' Themes ',
        keys: true,
        mouse: true,
        items: THEME_NAMES.map((name: ThemeName) => (name === current ? `${name} (current)` : name)),
        style: {
          selected: { bg: 'blue', fg: 'white' },
        },
      });
      list.focus();
      list.key(['escape', 'q'], () => {
        list.destroy();
        input.focus();
        screen.render();
      });
      list.on('select', item => {
        const text = (item.getText() as string).replace(' (current)', '');
        config.set('theme', text);
        pushLine({ role: 'system', text: `Theme set to ${text}. Restart chat to apply.` });
        list.destroy();
        input.focus();
        screen.render();
      });
      screen.render();
      return;
    }

    if (trimmed === '/export') {
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
      pushLine({ role: 'system', text: `Session exported to ${fullPath}` });
      return;
    }

    if (trimmed === '/compact') {
      const messages = agent.getMessages();
      if (messages.length <= 10) {
        pushLine({ role: 'system', text: 'Conversation is short; no compaction needed.' });
        return;
      }
      const preserved = messages.slice(-6);
      const summaryMessage: any = {
        role: 'assistant',
        content:
          'Earlier conversation has been compacted to save context. Key details from the last messages are preserved.',
      };
      const compacted = [summaryMessage, ...preserved];
      agent.setMessages(compacted);
      await sessionManager.saveMessagesAndStats({
        id: currentSession.id,
        messages: compacted,
        stats: agent.getStats(),
      });
      lines.length = 0;
      pushLine({ role: 'system', text: 'Conversation compacted.' });
      renderMessages();
      return;
    }

    if (trimmed === '/details') {
      showDetails = !showDetails;
      config.set('showDetails', showDetails);
      pushLine({ role: 'system', text: `Details ${showDetails ? 'enabled' : 'disabled'}.` });
      return;
    }

    if (trimmed === '/thinking') {
      showThinking = !showThinking;
      config.set('showThinking', showThinking);
      pushLine({ role: 'system', text: `Thinking display ${showThinking ? 'enabled' : 'disabled'}.` });
      return;
    }

    if (trimmed === '/mcp') {
      const connectedServers = mcpClientManager.getConnectedServers();
      if (!connectedServers.length) {
        pushLine({
          role: 'system',
          text: 'No MCP servers connected. Configure with: xibecode config --add-mcp-server or xibecode mcp add',
        });
        return;
      }
      const serverLines: string[] = [];
      for (const serverName of connectedServers) {
        const serverTools = mcpClientManager.getAvailableTools().filter(t => t.serverName === serverName);
        const serverResources = mcpClientManager.getAvailableResources().filter(r => r.serverName === serverName);
        const serverPrompts = mcpClientManager.getAvailablePrompts().filter(p => p.serverName === serverName);
        serverLines.push(
          `${serverName} — tools: ${serverTools.length}, resources: ${serverResources.length}, prompts: ${serverPrompts.length}`,
        );
      }
      pushLine({ role: 'system', text: serverLines.join('\n') });
      return;
    }

    if (trimmed.startsWith('@')) {
      await handleAtPathFuzzy(trimmed);
      return;
    }

    if (trimmed.startsWith('!')) {
      await handleShellBang(trimmed);
      return;
    }

    // Regular user message
    lines.push({ role: 'user', text: trimmed });
    renderMessages();

    try {
      const tools = enableTools ? toolExecutor.getTools() : [];
      await agent.run(trimmed, tools, toolExecutor);
      const stats = agent.getStats();
      await sessionManager.saveMessagesAndStats({
        id: currentSession.id,
        messages: agent.getMessages(),
        stats,
      });
    } catch (error: any) {
      pushLine({ role: 'system', text: `Error: ${error.message || String(error)}` });
    }
  }

  async function handleShellBang(inputText: string) {
    const cmd = inputText.slice(1).trim();
    if (!cmd) {
      pushLine({ role: 'system', text: 'No command provided after \"!\". Example: !ls -la' });
      return;
    }
    pushLine({ role: 'system', text: `Running shell command: ${cmd}` });
    const result = await toolExecutor.execute('run_command', { command: cmd, cwd: process.cwd(), timeout: 300 });
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    if (stdout) {
      pushLine({ role: 'system', text: stdout });
    }
    if (stderr) {
      pushLine({ role: 'system', text: `STDERR:\n${stderr}` });
    }
  }

  async function handleAtPathFuzzy(raw: string) {
    const inputText = raw.trim().slice(1).trim();
    const pattern = inputText ? `**/*${inputText}*` : '**/*';
    try {
      const files = await contextManager.searchFiles(pattern, { maxResults: 100 });
      if (!files.length) {
        pushLine({ role: 'system', text: `No matches for pattern ${pattern}` });
        return;
      }
      const text = files.map(f => `- ${f}`).join('\n');
      pushLine({ role: 'system', text: `Matches for ${pattern}:\n${text}` });
    } catch (error: any) {
      pushLine({ role: 'system', text: `Failed to search files: ${error.message || String(error)}` });
    }
  }

  function setupInput() {
    input.on('submit', async (value: string) => {
      input.clearValue();
      screen.render();
      await runUserMessage(value);
      input.focus();
    });

    input.key(['C-c', 'escape'], () => {
      shutdown();
    });

    screen.key(['tab'], () => {
      cycleMode();
    });

    screen.key(['C-n'], async () => {
      await runUserMessage('/new');
    });

    screen.key(['q', 'C-c'], () => {
      shutdown();
    });
  }

  async function shutdown() {
    try {
      if (serverNames.length > 0) {
        await mcpClientManager.disconnectAll();
      }
    } finally {
      screen.destroy();
      process.exit(0);
    }
  }

  function setupAgentHandlers() {
    agent.removeAllListeners('event');
    agent.on('event', (event: any) => {
      switch (event.type) {
        case 'thinking':
          break;
        case 'stream_start':
          lines.push({ role: 'assistant', text: '' });
          break;
        case 'stream_text': {
          const last = lines[lines.length - 1];
          if (last && last.role === 'assistant') {
            last.text += event.data.text;
            renderMessages();
          }
          break;
        }
        case 'stream_end':
          renderMessages();
          break;
        case 'response':
          lines.push({ role: 'assistant', text: event.data.text });
          renderMessages();
          break;
        case 'tool_call':
          if (enableTools) {
            const text = formatToolCall(event.data.name, event.data.input);
            lines.push({ role: 'tool', text });
            renderMessages();
          }
          break;
        case 'tool_result':
          if (enableTools) {
            const text = formatToolResult(
              event.data.name,
              event.data.result,
              event.data.success !== false,
            );
            lines.push({ role: 'tool', text });
            renderMessages();
          }
          break;
        case 'mode_changed':
          currentMode = event.data.to as AgentMode;
          pushLine({ role: 'system', text: `Mode changed to ${currentMode}` });
          break;
        case 'error':
          pushLine({ role: 'system', text: `Error: ${event.data.message || event.data.error}` });
          break;
        case 'warning':
          pushLine({ role: 'system', text: `Warning: ${event.data.message}` });
          break;
      }
    });
  }

  setupAgentHandlers();
  setupInput();

  input.focus();
  updateStatus();
  screen.render();
}

