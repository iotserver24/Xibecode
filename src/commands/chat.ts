import inquirer from 'inquirer';
import { EnhancedAgent } from '../core/agent.js';
import { CodingToolExecutor } from '../core/tools.js';
import { MCPClientManager } from '../core/mcp-client.js';
import { EnhancedUI } from '../ui/enhanced-tui.js';
import { ConfigManager } from '../utils/config.js';
import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ChatOptions {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

export async function chatCommand(options: ChatOptions) {
  const ui = new EnhancedUI(false);
  const config = new ConfigManager();
  
  ui.clear();
  ui.header('1.0.0');

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

  // Load and connect to MCP servers
  const mcpClientManager = new MCPClientManager();
  const mcpServers = await config.getMCPServers();
  if (mcpServers.length > 0) {
    console.log(chalk.blue(`  ℹ Connecting to ${mcpServers.length} MCP server(s)...\n`));
    for (const serverConfig of mcpServers) {
      try {
        await mcpClientManager.connect(serverConfig);
        const tools = mcpClientManager.getAvailableTools().filter(t => t.serverName === serverConfig.name);
        console.log(chalk.green(`  ✓ Connected to ${serverConfig.name} (${tools.length} tool(s))`));
      } catch (error: any) {
        console.log(chalk.yellow(`  ✗ Failed to connect to ${serverConfig.name}: ${error.message}`));
      }
    }
    console.log('');
  }

  // Gemini‑style intro screen
  ui.chatBanner(process.cwd(), model, baseUrl);

  let enableTools = true;
  const toolExecutor = new CodingToolExecutor(process.cwd(), { mcpClientManager });

  // ── Create ONE agent for the entire chat session ──
  // This keeps conversation history (messages) across all turns,
  // so the AI remembers everything you talked about.
  const agent = new EnhancedAgent({
    apiKey,
    baseUrl,
    model,
    maxIterations: 150,
    verbose: false,
  });

  let hasResponse = false;

  // Set up event handlers ONCE (agent is reused across turns)
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
    }
  });

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
    console.log('  ' + chalk.hex('#00D4FF')('/help') + chalk.hex('#6B6B7B')('      show this help, not an AI reply'));
    console.log('  ' + chalk.hex('#00D4FF')('/mcp') + chalk.hex('#6B6B7B')('       show connected MCP servers and tools'));
    console.log('  ' + chalk.hex('#00D4FF')('@path') + chalk.hex('#6B6B7B')('      list files/folders under path (or cwd if just "@")'));
    console.log('  ' + chalk.hex('#00D4FF')('clear') + chalk.hex('#6B6B7B')('     clear screen and redraw header'));
    console.log('  ' + chalk.hex('#00D4FF')('tools on') + chalk.hex('#6B6B7B')('  enable editor & filesystem tools'));
    console.log('  ' + chalk.hex('#00D4FF')('tools off') + chalk.hex('#6B6B7B')(' disable tools (chat only)'));
    console.log('  ' + chalk.hex('#00D4FF')('exit / quit') + chalk.hex('#6B6B7B')(' end the chat session'));
    console.log('');
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

    if (lowerMessage === '/mcp') {
      console.log('');
      console.log(chalk.bold('  MCP Servers'));
      console.log('  ' + chalk.hex('#6B6B7B')('────────────────────────────'));
      
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
      console.log('');
      continue;
    }

    if (trimmed.startsWith('@')) {
      await showPathSuggestions(trimmed);
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
      break;
    }

    if (lowerMessage === 'clear') {
      ui.clear();
      ui.header('1.0.0');
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
      // agent.run() resets its iteration/tool counters but KEEPS
      // the conversation history (this.messages), so the AI has
      // full context of everything discussed in this session.
      await agent.run(message, tools, toolExecutor);
    } catch (error: any) {
      ui.error('Failed to process message', error);
    }

    console.log('');
  }

  // Cleanup: disconnect from all MCP servers
  if (mcpServers.length > 0) {
    await mcpClientManager.disconnectAll();
  }
}
