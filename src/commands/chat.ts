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
    console.log(chalk.white('Set your API key:\n'));
    console.log(chalk.cyan('  xibecode config --set-key YOUR_KEY\n'));
    process.exit(1);
  }

  const model = options.model || config.getModel();
  const baseUrl = options.baseUrl || config.getBaseUrl();

  console.log(chalk.white('💬 Interactive Chat Mode\n'));
  console.log(chalk.gray('Commands:'));
  console.log(chalk.gray('  exit, quit - Exit chat'));
  console.log(chalk.gray('  clear - Clear screen'));
  console.log(chalk.gray('  tools on/off - Enable/disable tool execution\n'));
  ui.divider();
  console.log('');

  let enableTools = true;
  const toolExecutor = new CodingToolExecutor(process.cwd());

  while (true) {
    // Get user input
    const { message } = await inquirer.prompt([
      {
        type: 'input',
        name: 'message',
        message: chalk.green('You:'),
        prefix: '',
      },
    ]);

    if (!message.trim()) continue;

    const lowerMessage = message.toLowerCase().trim();
    
    if (lowerMessage === 'exit' || lowerMessage === 'quit') {
      console.log(chalk.cyan('\n👋 Goodbye!\n'));
      break;
    }

    if (lowerMessage === 'clear') {
      ui.clear();
      ui.header('1.0.0');
      console.log(chalk.white('💬 Interactive Chat Mode\n'));
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
      maxIterations: 10,
      verbose: false,
    });

    let hasResponse = false;

    // Set up event handlers
    agent.on('event', (event) => {
      switch (event.type) {
        case 'thinking':
          ui.thinking(event.data.message);
          break;

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

        case 'response':
          ui.stopSpinner();
          if (!hasResponse) {
            console.log('\n' + chalk.cyan('Assistant:'));
            console.log(chalk.white('  ' + event.data.text) + '\n');
            hasResponse = true;
          }
          break;

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
  }
}
