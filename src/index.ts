#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { runCommand } from './commands/run.js';
import { chatCommand } from './commands/chat.js';
import { configCommand } from './commands/config.js';
import dotenv from 'dotenv';

dotenv.config();

const program = new Command();

program
  .name('xibecode')
  .description('XibeCode - AI-powered autonomous coding assistant')
  .version('1.0.0');

// Main run command
program
  .command('run')
  .description('Start an autonomous coding session')
  .argument('[prompt]', 'Task for the AI to accomplish')
  .option('-f, --file <path>', 'Read prompt from file')
  .option('-m, --model <model>', 'AI model to use')
  .option('-b, --base-url <url>', 'Custom API base URL')
  .option('-k, --api-key <key>', 'API key (overrides config)')
  .option('-d, --max-iterations <number>', 'Maximum iterations', '50')
  .option('-v, --verbose', 'Show detailed logs', false)
  .action(runCommand);

// Interactive chat
program
  .command('chat')
  .description('Start an interactive chat session')
  .option('-m, --model <model>', 'AI model to use')
  .option('-b, --base-url <url>', 'Custom API base URL')
  .option('-k, --api-key <key>', 'API key (overrides config)')
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
  .action(configCommand);

// Show help if no command
if (!process.argv.slice(2).length) {
  console.log(chalk.cyan.bold('\n╔════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║') + chalk.white.bold('            XibeCode AI Agent                     ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('║') + chalk.gray('        Autonomous Coding Assistant               ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════╝\n'));
  
  console.log(chalk.white('Quick Start:\n'));
  console.log(chalk.cyan('  xibecode run') + chalk.gray(' "Create a hello world script"'));
  console.log(chalk.cyan('  xibecode chat') + chalk.gray(' - Start interactive chat'));
  console.log(chalk.cyan('  xibecode config --show') + chalk.gray(' - View configuration\n'));
  
  console.log(chalk.white('Examples:\n'));
  console.log(chalk.gray('  xibecode run "Build a REST API with Express"'));
  console.log(chalk.gray('  xibecode run "Fix the bug in app.js" --verbose'));
  console.log(chalk.gray('  xibecode run --file task.txt\n'));
  
  console.log(chalk.white('For more help:\n'));
  console.log(chalk.gray('  xibecode --help'));
  console.log(chalk.gray('  xibecode <command> --help\n'));
  
  process.exit(0);
}

program.parse();
