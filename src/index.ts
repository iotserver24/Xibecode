#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { runCommand } from './commands/run.js';
import { chatCommand } from './commands/chat.js';
import { configCommand } from './commands/config.js';
import { mcpCommand } from './commands/mcp.js';
import dotenv from 'dotenv';

dotenv.config();

const program = new Command();

program
  .name('xibecode')
  .description('XibeCode - AI-powered autonomous coding assistant')
  .version('0.1.4');

// Main run command
program
  .command('run')
  .description('Start an autonomous coding session')
  .argument('[prompt]', 'Task for the AI to accomplish')
  .option('-f, --file <path>', 'Read prompt from file')
  .option('-m, --model <model>', 'AI model to use')
  .option('-b, --base-url <url>', 'Custom API base URL')
  .option('-k, --api-key <key>', 'API key (overrides config)')
  .option('--provider <provider>', 'Model API format: anthropic or openai')
  .option('-d, --max-iterations <number>', 'Maximum iterations (0 = unlimited, default 150)', '150')
  .option('-v, --verbose', 'Show detailed logs', false)
  .option('--dry-run', 'Preview changes without making them', false)
  .option('--changed-only', 'Focus only on git-changed files', false)
  .action(runCommand);

// Interactive chat
program
  .command('chat')
  .description('Start an interactive chat session')
  .option('-m, --model <model>', 'AI model to use')
  .option('-b, --base-url <url>', 'Custom API base URL')
  .option('-k, --api-key <key>', 'API key (overrides config)')
  .option('--provider <provider>', 'Model API format: anthropic or openai')
  .option('--theme <theme>', 'UI theme to use')
  .option('--session <id>', 'Resume a specific chat session by id')
  .action(chatCommand);

// Configuration
program
  .command('config')
  .description('Manage configuration')
  .option('--set-key <key>', 'Set API key')
  .option('--set-url <url>', 'Set custom base URL')
  .option('--set-model <model>', 'Set default model')
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
  .action(() => mcpCommand('add'));

mcpCmd
  .command('list')
  .description('List all configured MCP servers')
  .action(() => mcpCommand('list'));

mcpCmd
  .command('remove')
  .description('Remove an MCP server')
  .argument('<name>', 'Server name')
  .action((name) => mcpCommand('remove', name));

mcpCmd
  .command('file')
  .description('Show path to MCP servers configuration file')
  .action(() => mcpCommand('file'));

mcpCmd
  .command('edit')
  .description('Open MCP servers configuration file in editor')
  .action(() => mcpCommand('edit'));

mcpCmd
  .command('init')
  .description('Create default MCP servers configuration file')
  .action(() => mcpCommand('init'));

mcpCmd
  .command('reload')
  .description('Reload MCP servers from configuration file')
  .action(() => mcpCommand('reload'));

// Show help if no command
if (!process.argv.slice(2).length) {
  const B  = chalk.hex('#3A3A4A');  // border
  const C  = chalk.hex('#00D4FF');  // brand cyan
  const Cb = chalk.hex('#00D4FF').bold;
  const W  = chalk.white;
  const Wb = chalk.bold.white;
  const D  = chalk.hex('#6B6B7B');  // dim
  const M  = chalk.hex('#4A4A5A');  // muted

  console.log('');
  console.log('  ' + B('╭──────────────────────────────────────────────────────────────╮'));
  console.log('  ' + B('│') + '                                                              ' + B('│'));
  console.log('  ' + B('│') + '   ' + Cb('⚡ XibeCode') + '                                                ' + B('│'));
  console.log('  ' + B('│') + '   ' + D('AI-Powered Autonomous Coding Assistant') + '                      ' + B('│'));
  console.log('  ' + B('│') + '   ' + M('v0.0.5 - File-Based MCP Config') + '                          ' + B('│'));
  console.log('  ' + B('│') + '                                                              ' + B('│'));
  console.log('  ' + B('╰──────────────────────────────────────────────────────────────╯'));
  console.log('');
  console.log('  ' + Wb('Quick Start'));
  console.log('');
  console.log('  ' + C('  xibecode chat') + D('                  start interactive chat'));
  console.log('  ' + C('  xibecode run') + D(' "Build an API"    run autonomous task'));
  console.log('  ' + C('  xibecode config --show') + D('        view configuration'));
  console.log('');
  console.log('  ' + Wb('Examples'));
  console.log('');
  console.log('  ' + D('  xibecode run "Build a REST API with Express"'));
  console.log('  ' + D('  xibecode run "Fix the bug in app.js" --verbose'));
  console.log('  ' + D('  xibecode run --file task.txt'));
  console.log('');
  console.log('  ' + D('  xibecode --help       full command reference'));
  console.log('  ' + D('  xibecode <cmd> --help  command-specific help'));
  console.log('');

  process.exit(0);
}

program.parse();
