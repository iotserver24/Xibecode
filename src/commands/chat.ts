import inquirer from 'inquirer';
import { EnhancedAgent } from '../core/agent.js';
import { CodingToolExecutor } from '../core/tools.js';
import { EnhancedUI } from '../ui/enhanced-tui.js';
import { ConfigManager } from '../utils/config.js';
import chalk from 'chalk';

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

  // Show model info
  ui.modelInfo(model, baseUrl);
  ui.chatBanner();

  let enableTools = true;
  const toolExecutor = new CodingToolExecutor(process.cwd());

  while (true) {
    // Get user input
    const { message } = await inquirer.prompt([
      {
        type: 'input',
        name: 'message',
        message: chalk.green.bold('❯ You '),
        prefix: '',
      },
    ]);

    if (!message.trim()) continue;

    const lowerMessage = message.toLowerCase().trim();
    
    if (lowerMessage === 'exit' || lowerMessage === 'quit') {
      console.log(chalk.cyan('\n  👋 Goodbye!\n'));
      break;
    }

    if (lowerMessage === 'clear') {
      ui.clear();
      ui.header('1.0.0');
      ui.modelInfo(model, baseUrl);
      ui.chatBanner();
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

    // Create agent for this message
    const agent = new EnhancedAgent({
      apiKey,
      baseUrl,
      model,
      maxIterations: 15,
      verbose: false,
    });

    let hasResponse = false;

    // Set up event handlers
    agent.on('event', (event: any) => {
      switch (event.type) {
        case 'thinking':
          if (!hasResponse) {
            // Show a very visible, animated \"AI is working\" indicator.
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
          }
          break;

        // ── Iteration ──
        case 'iteration':
          // Update spinner text so it feels alive while iterating
          if (!hasResponse && event.data?.current && event.data?.total) {
            ui.updateThinking(`Thinking... step ${event.data.current}/${event.data.total}`);
          }
          // Reset response flag for each iteration so new text shows
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

    try {
      const tools = enableTools ? toolExecutor.getTools() : [];
      await agent.run(message, tools, toolExecutor);
    } catch (error: any) {
      ui.error('Failed to process message', error);
    }

    console.log(''); // spacing before next prompt
  }
}
