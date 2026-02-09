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
  .version('0.0.1');

// Main run command
program
  .command('run')
  .description('Start an autonomous coding session')
  .argument('[prompt]', 'Task for the AI to accomplish')
  .option('-f, --file <path>', 'Read prompt from file')
  .option('-m, --model <model>', 'AI model to use')
  .option('-b, --base-url <url>', 'Custom API base URL')
  .option('-k, --api-key <key>', 'API key (overrides config)')
  .option('-d, --max-iterations <number>', 'Maximum iterations (0 = unlimited, default 150)', '150')
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
  console.log('  ' + B('│') + '   ' + M('v0.0.1') + '                                                      ' + B('│'));
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
