import { ConfigManager } from '../utils/config.js';
import { EnhancedUI } from '../ui/enhanced-tui.js';
import inquirer from 'inquirer';
import chalk from 'chalk';

interface ConfigOptions {
  setKey?: string;
  setUrl?: string;
  setModel?: string;
  show?: boolean;
  reset?: boolean;
}

export async function configCommand(options: ConfigOptions) {
  const ui = new EnhancedUI(false);
  const config = new ConfigManager();

  // Quick set operations
  if (options.setKey) {
    config.set('apiKey', options.setKey);
    ui.success('API key saved!');
    return;
  }

  if (options.setUrl) {
    if (!options.setUrl.startsWith('http')) {
      ui.error('Base URL must start with http:// or https://');
      process.exit(1);
    }
    config.set('baseUrl', options.setUrl);
    ui.success(`Base URL set to: ${options.setUrl}`);
    return;
  }

  if (options.setModel) {
    config.set('model', options.setModel);
    ui.success(`Default model set to: ${options.setModel}`);
    return;
  }

  if (options.reset) {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to reset all configuration?',
        default: false,
      },
    ]);

    if (confirm) {
      config.clear();
      ui.success('Configuration reset!');
    }
    return;
  }

  if (options.show) {
    ui.header('1.0.0');
    console.log(chalk.bold.white('⚙️  Current Configuration\n'));
    
    const displayConfig = config.getDisplayConfig();
    Object.entries(displayConfig).forEach(([key, value]) => {
      const keyFormatted = chalk.gray(key.padEnd(20));
      console.log(`${keyFormatted}: ${chalk.white(value)}`);
    });
    
    console.log('');
    ui.divider();
    console.log('');
    
    // Validate config
    const validation = config.validate();
    if (!validation.valid) {
      console.log(chalk.yellow('⚠️  Configuration Issues:\n'));
      validation.errors.forEach(error => {
        console.log(chalk.yellow('  • ' + error));
      });
      console.log('');
    } else {
      console.log(chalk.green('✓ Configuration is valid\n'));
    }
    
    return;
  }

  // Interactive configuration
  ui.header('1.0.0');
  console.log(chalk.bold.white('⚙️  Configuration Setup\n'));

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to configure?',
      choices: [
        { name: '🔑 Set API Key', value: 'set_key' },
        { name: '🌐 Set Base URL (for custom endpoints)', value: 'set_url' },
        { name: '🤖 Set Default Model', value: 'set_model' },
        { name: '👀 View Current Config', value: 'view' },
        { name: '🗑️  Clear API Key', value: 'clear_key' },
        { name: '↩️  Reset All Settings', value: 'reset' },
        { name: '❌ Exit', value: 'exit' },
      ],
    },
  ]);

  console.log('');

  switch (action) {
    case 'set_key':
      const { apiKey } = await inquirer.prompt([
        {
          type: 'password',
          name: 'apiKey',
          message: 'Enter your Anthropic API key:',
          mask: '*',
          validate: (input) => {
            if (!input) return 'API key cannot be empty';
            if (input.length < 20) return 'API key seems too short';
            return true;
          },
        },
      ]);
      config.set('apiKey', apiKey);
      ui.success('API key saved!');
      break;

    case 'set_url':
      const { baseUrl } = await inquirer.prompt([
        {
          type: 'input',
          name: 'baseUrl',
          message: 'Enter custom base URL:',
          default: 'https://api.anthropic.com',
          validate: (input) => {
            if (!input.startsWith('http')) {
              return 'URL must start with http:// or https://';
            }
            return true;
          },
        },
      ]);
      config.set('baseUrl', baseUrl);
      ui.success(`Base URL set to: ${baseUrl}`);
      break;

    case 'set_model':
      const { model } = await inquirer.prompt([
        {
          type: 'list',
          name: 'model',
          message: 'Select default model:',
          choices: [
            { name: 'Claude Sonnet 4.5 (Recommended)', value: 'claude-sonnet-4-5-20250929' },
            { name: 'Claude Opus 4.5 (Most Capable)', value: 'claude-opus-4-5-20251101' },
            { name: 'Claude Haiku 4.5 (Fastest)', value: 'claude-haiku-4-5-20251001' },
            { name: 'Custom', value: 'custom' },
          ],
        },
      ]);

      if (model === 'custom') {
        const { customModel } = await inquirer.prompt([
          {
            type: 'input',
            name: 'customModel',
            message: 'Enter custom model ID:',
          },
        ]);
        config.set('model', customModel);
        ui.success(`Default model set to: ${customModel}`);
      } else {
        config.set('model', model);
        ui.success(`Default model set to: ${model}`);
      }
      break;

    case 'view':
      const displayConfig = config.getDisplayConfig();
      console.log(chalk.bold.white('Current Configuration:\n'));
      Object.entries(displayConfig).forEach(([key, value]) => {
        console.log(chalk.gray(`  ${key.padEnd(20)}: `) + chalk.white(value));
      });
      console.log('');
      break;

    case 'clear_key':
      const { confirmClear } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmClear',
          message: 'Clear API key?',
          default: false,
        },
      ]);
      if (confirmClear) {
        config.delete('apiKey');
        ui.success('API key cleared!');
      }
      break;

    case 'reset':
      const { confirmReset } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmReset',
          message: 'Reset all configuration?',
          default: false,
        },
      ]);
      if (confirmReset) {
        config.clear();
        ui.success('Configuration reset!');
      }
      break;

    case 'exit':
      break;
  }
}
