import * as fs from 'fs/promises';
import { EnhancedAgent } from '../core/agent.js';
import { CodingToolExecutor } from '../core/tools.js';
import { EnhancedUI } from '../ui/enhanced-tui.js';
import { ConfigManager } from '../utils/config.js';
import chalk from 'chalk';

interface RunOptions {
  file?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  maxIterations: string;
  verbose: boolean;
}

export async function runCommand(prompt: string | undefined, options: RunOptions) {
  const ui = new EnhancedUI(options.verbose);
  const config = new ConfigManager();
  
  ui.header('1.0.0');

  // Get API key
  const apiKey = options.apiKey || config.getApiKey();
  if (!apiKey) {
    ui.error('No API key found!');
    console.log(chalk.white('  Set your API key using one of these methods:\n'));
    console.log(chalk.cyan('    1. xibecode config --set-key YOUR_KEY'));
    console.log(chalk.cyan('    2. export ANTHROPIC_API_KEY=your_key'));
    console.log(chalk.cyan('    3. xibecode run --api-key YOUR_KEY "task"\n'));
    process.exit(1);
  }

  // Get prompt
  let finalPrompt = prompt;
  if (options.file) {
    try {
      finalPrompt = await fs.readFile(options.file, 'utf-8');
      ui.info(`Loaded prompt from: ${options.file}`);
    } catch (error: any) {
      ui.error(`Failed to read file: ${options.file}`, error);
      process.exit(1);
    }
  }

  if (!finalPrompt) {
    ui.error('No prompt provided!');
    console.log(chalk.white('\n  Usage:\n'));
    console.log(chalk.cyan('    xibecode run "your task"'));
    console.log(chalk.cyan('    xibecode run --file prompt.txt\n'));
    process.exit(1);
  }

  // Get model and base URL
  const model = options.model || config.getModel();
  const baseUrl = options.baseUrl || config.getBaseUrl();
  const parsedIterations = parseInt(options.maxIterations);
  const maxIterations = parsedIterations > 0 ? parsedIterations : 150;

  // Show session info
  ui.startSession(finalPrompt, { model, maxIterations });

  // Initialize components
  const toolExecutor = new CodingToolExecutor(process.cwd());
  const agent = new EnhancedAgent({
    apiKey,
    baseUrl,
    model,
    maxIterations,
    verbose: options.verbose,
  });

  const startTime = Date.now();
  let currentIteration = 0;

  // Set up event handlers
  agent.on('event', (event: any) => {
    switch (event.type) {
      case 'iteration':
        currentIteration = event.data.current;
        ui.iteration(event.data.current, event.data.total);
        break;

      case 'thinking':
        ui.thinking(event.data.message);
        break;

      // ── Streaming ──
      case 'stream_start':
        ui.startAssistantResponse();
        break;

      case 'stream_text':
        ui.streamText(event.data.text);
        break;

      case 'stream_end':
        ui.endAssistantResponse();
        break;

      // ── Non-streaming fallback ──
      case 'response':
        ui.response(event.data.text);
        break;

      // ── Tools ──
      case 'tool_call':
        ui.toolCall(event.data.name, event.data.input, event.data.index);
        break;

      case 'tool_result':
        ui.toolResult(event.data.name, event.data.result, event.data.success);
        
        // Show diff for file edits (verbose only, handled inside showDiff)
        if (event.data.result?.diff) {
          ui.showDiff(event.data.result.diff, event.data.result.path || 'file');
        }
        
        // Show file changes
        if (event.data.result?.success && event.data.name === 'write_file') {
          ui.fileChanged('created', event.data.result.path, `${event.data.result.lines} lines`);
        } else if (event.data.result?.success && event.data.name === 'edit_file') {
          ui.fileChanged('modified', event.data.result.path || '',
            event.data.result.linesChanged ? `${event.data.result.linesChanged} lines` : '');
        }
        break;

      case 'error':
        ui.error(event.data.message || event.data.error || 'An error occurred');
        break;

      case 'warning':
        ui.warning(event.data.message);
        break;

      case 'complete':
        break;
    }
  });

  // Run the agent
  try {
    await agent.run(finalPrompt, toolExecutor.getTools(), toolExecutor);
    
    const stats = agent.getStats();
    const duration = Date.now() - startTime;
    
    ui.completionSummary({
      iterations: stats.iterations,
      duration,
      filesChanged: stats.filesChanged,
      toolCalls: stats.toolCalls,
    });

    if (stats.changedFiles.length > 0) {
      console.log(chalk.white('  📝 Files modified:\n'));
      stats.changedFiles.forEach(file => {
        console.log(chalk.gray('    • ') + chalk.white(file));
      });
      console.log('');
    }
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    ui.failureSummary(error.message, {
      iterations: currentIteration,
      duration,
    });
    
    if (options.verbose) {
      console.log(chalk.red('\n  Stack trace:'));
      console.log(chalk.gray('  ' + error.stack));
      console.log('');
    }
    
    process.exit(1);
  }
}
