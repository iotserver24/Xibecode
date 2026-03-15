#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { runCommand } from './commands/run.js';
import { runPrCommand } from './commands/run-pr.js';
import { chatCommand } from './commands/chat.js';
import { configCommand } from './commands/config.js';
import { mcpCommand } from './commands/mcp.js';
import { startWebUI } from './webui/server.js';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

dotenv.config();

const program = new Command();

program
  .name('xibecode')
  .description('XibeCode - AI-powered autonomous coding assistant')
  .version(pkg.version, '-v, --version');

// Main run command
program
  .command('run')
  .description('Start an autonomous coding session')
  .argument('[prompt]', 'Task for the AI to accomplish')
  .option('-f, --file <path>', 'Read prompt from file')
  .option('-m, --model <model>', 'AI model to use')
  .option('--mode <mode>', 'Initial agent mode (agent, plan, debugger, etc.)')
  .option('-b, --base-url <url>', 'Custom API base URL')
  .option('-k, --api-key <key>', 'API key (overrides config)')
  .option('--provider <provider>', 'Model API format: anthropic or openai')
  .option('-d, --max-iterations <number>', 'Maximum iterations (0 = unlimited, default 150)', '150')
  .option('-v, --verbose', 'Show detailed logs', false)
  .option('--cost-mode <mode>', 'Cost mode: normal or economy (cheaper model, lower iteration/token caps)', 'normal')
  .option('--plan-first', 'Force a strategic plan (one-shot, no tools) before execution (AX-lite)', false)
  .option('--mindset-adaptive', 'Enable CoM-style reasoning mindsets (convergent/divergent/algorithmic)', false)
  .option('--dry-run', 'Preview changes without making them', false)
  .option('--changed-only', 'Focus only on git-changed files', false)
  .option('--non-interactive', 'Run in non-interactive mode (for background tasks)', false)
  .action(runCommand);

// Run task + auto branch + PR
program
  .command('run-pr')
  .description('Run an autonomous coding task, then create a branch and open a GitHub PR automatically')
  .argument('[prompt]', 'Task for the AI to accomplish')
  .option('-f, --file <path>', 'Read prompt from file')
  .option('-m, --model <model>', 'AI model to use')
  .option('-b, --base-url <url>', 'Custom API base URL')
  .option('-k, --api-key <key>', 'API key (overrides config)')
  .option('--provider <provider>', 'Model API format: anthropic or openai')
  .option('-d, --max-iterations <number>', 'Maximum iterations (0 = unlimited, default 150)', '150')
  .option('-v, --verbose', 'Show detailed logs', false)
  .option('--cost-mode <mode>', 'Cost mode: normal or economy (cheaper model, lower caps)', 'normal')
  .option('--plan-first', 'Force a strategic plan before execution (AX-lite)', false)
  .option('--mindset-adaptive', 'Enable CoM-style reasoning mindsets', false)
  .option('--branch <name>', 'Override branch name (default: auto-generated xibecode/<slug>-<timestamp>)')
  .option('--title <title>', 'Override PR title (default: derived from prompt)')
  .option('--draft', 'Open PR as draft', false)
  .option('--skip-tests', 'Skip test verification before creating PR', false)
  .action(runPrCommand);

// Interactive chat
program
  .command('chat')
  .description('Start an interactive chat session with WebUI')
  .option('-m, --model <model>', 'AI model to use')
  .option('-b, --base-url <url>', 'Custom API base URL')
  .option('-k, --api-key <key>', 'API key (overrides config)')
  .option('--provider <provider>', 'Model API format: anthropic or openai')
  .option('--cost-mode <mode>', 'Cost mode: normal or economy', 'normal')
  .option('--theme <theme>', 'UI theme to use')
  .option('--session <id>', 'Resume a specific chat session by id')
  .option('--no-webui', 'Disable WebUI server (TUI only)')
  .action(chatCommand);

// WebUI - Browser-based interface
program
  .command('ui')
  .description('Start the WebUI - browser-based interface with dashboard, visual diff, and more')
  .option('-p, --port <port>', 'Port to run on (default: 3847)', '3847')
  .option('-h, --host <host>', 'Host to bind to (default: localhost)', 'localhost')
  .option('--open', 'Open browser automatically', false)
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    const host = options.host;

    console.log(chalk.hex('#00D4FF').bold('\n  ⚡ XibeCode WebUI\n'));
    console.log(chalk.dim(`  Starting server on ${host}:${port}...\n`));

    try {
      const server = await startWebUI({ port, host, workingDir: process.cwd() });

      const url = `http://${host}:${port}`;
      console.log(chalk.green('  ✓ Server running at: ') + chalk.hex('#00D4FF')(url));
      console.log(chalk.dim('\n  Press Ctrl+C to stop\n'));

      if (options.open) {
        const open = (await import('open')).default;
        await open(url);
      }

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log(chalk.dim('\n  Shutting down...'));
        await server.stop();
        process.exit(0);
      });
    } catch (error: any) {
      console.error(chalk.red('  ✗ Failed to start: ') + error.message);
      process.exit(1);
    }
  });

// Configuration
program
  .command('config')
  .description('Manage configuration')
  .option('--set-key <key>', 'Set API key')
  .option('--set-url <url>', 'Set custom base URL')
  .option('--set-model <model>', 'Set default model')
   .option('--set-provider <provider>', 'Set default provider/API format (anthropic, openai, deepseek, zai, kimi, grok, openrouter, google, auto)')
  .option('--set-cost-mode <mode>', 'Set cost mode: normal or economy (use cheaper model and lower caps)')
  .option('--set-economy-model <model>', 'Set model to use when cost mode is economy')
  .option('--show', 'Show current configuration')
  .option('--reset', 'Reset all configuration')
  .option('--list-mcp-servers', 'List configured MCP servers')
  .option('--add-mcp-server <name>', 'Add an MCP server (interactive)')
  .option('--remove-mcp-server <name>', 'Remove an MCP server')
  .action(configCommand);

// MCP Server Management
const mcpCmd = program
  .command('mcp')
  .description('Manage MCP servers (easier method)');

mcpCmd
  .command('add')
  .description('Open MCP servers configuration file to add servers')
  .action(() => mcpCommand('add', []));

mcpCmd
  .command('list')
  .description('List all configured MCP servers')
  .action(() => mcpCommand('list', []));

mcpCmd
  .command('remove')
  .description('Remove an MCP server')
  .argument('<name>', 'Server name')
  .action((name) => mcpCommand('remove', [name]));

mcpCmd
  .command('file')
  .description('Show path to MCP servers configuration file')
  .action(() => mcpCommand('file', []));

mcpCmd
  .command('edit')
  .description('Open MCP servers configuration file in editor')
  .action(() => mcpCommand('edit', []));

mcpCmd
  .command('init')
  .description('Create default MCP servers configuration file')
  .action(() => mcpCommand('init', []));

mcpCmd
  .command('reload')
  .description('Reload MCP servers from configuration file')
  .action(() => mcpCommand('reload', []));

mcpCmd
  .command('search')
  .description('Search for MCP servers on Smithery')
  .argument('<query...>', 'Search query')
  .action((query) => mcpCommand('search', query));

mcpCmd
  .command('install')
  .description('Install an MCP server')
  .argument('<name>', 'Server name (e.g. @smithery/mcp-postgres)')
  .action((name) => mcpCommand('install', [name]));

mcpCmd
  .command('login')
  .description('Authenticate with Smithery')
  .action(() => mcpCommand('login', []));

// Launch chat with WebUI if no command provided
if (!process.argv.slice(2).length) {
  // Default action: start interactive chat with WebUI
  chatCommand({});
} else {
  program.parse();
}
