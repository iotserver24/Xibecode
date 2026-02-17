import { ConfigManager, MCPServerConfig, PROVIDER_CONFIGS } from '../utils/config.js';
import { EnhancedUI } from '../ui/enhanced-tui.js';
import { mcpCommand } from './mcp.js';
import inquirer from 'inquirer';
import chalk from 'chalk';

interface ConfigOptions {
  setKey?: string;
  setUrl?: string;
  setModel?: string;
  show?: boolean;
  reset?: boolean;
  listMcpServers?: boolean;
  addMcpServer?: string;
  removeMcpServer?: string;
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

  if (options.listMcpServers) {
    const servers = await config.getMCPServers();
    const serverNames = Object.keys(servers);
    if (serverNames.length === 0) {
      console.log(chalk.yellow('No MCP servers configured'));
      return;
    }

    console.log(chalk.bold.white('\n📡 Configured MCP Servers\n'));
    for (const serverName of serverNames) {
      const server = servers[serverName];
      console.log(chalk.cyan(`  ${serverName}`));
      console.log(chalk.gray(`    Command: ${server.command}`));
      if (server.args) console.log(chalk.gray(`    Args: ${server.args.join(' ')}`));
      console.log('');
    }
    return;
  }

  if (options.addMcpServer) {
    const name = options.addMcpServer;

    const { command, args } = await inquirer.prompt([
      {
        type: 'input',
        name: 'command',
        message: 'Command to execute:',
        validate: (input) => input ? true : 'Command cannot be empty',
      },
      {
        type: 'input',
        name: 'args',
        message: 'Arguments (space-separated, or leave empty):',
      },
    ]);

    const serverConfig: MCPServerConfig = {
      command,
    };

    if (args.trim()) {
      serverConfig.args = args.trim().split(/\s+/);
    }

    try {
      config.addMCPServer(name, serverConfig);
      ui.success(`MCP server "${name}" added successfully!`);
    } catch (error: any) {
      ui.error(`Failed to add MCP server: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  if (options.removeMcpServer) {
    const name = options.removeMcpServer;
    const removed = config.removeMCPServer(name);

    if (removed) {
      ui.success(`MCP server "${name}" removed successfully!`);
    } else {
      ui.error(`MCP server "${name}" not found`);
      process.exit(1);
    }
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

  // Interactive configuration (loop until user chooses Exit)
  ui.header('1.0.0');
  console.log(chalk.bold.white('⚙️  Configuration Setup\n'));

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to configure?',
        choices: [
          { name: '🔑 Set API Key', value: 'set_key' },
          { name: '🌐 Set Base URL', value: 'set_url' },
          { name: '🤖 Set Default Model (Anthropic & OpenAI)', value: 'set_model' },
          { name: '📡 Manage MCP Servers', value: 'mcp_servers' },
          { name: '👀 View Current Config', value: 'view' },
          { name: '🗑️  Clear API Key', value: 'clear_key' },
          { name: '↩️  Reset All Settings', value: 'reset' },
          { name: '❌ Exit', value: 'exit' },
        ],
      },
    ]);

    console.log('');

    if (action === 'exit') {
      break;
    }

    switch (action) {
      case 'set_key': {
        const { apiKey } = await inquirer.prompt([
          {
            type: 'password',
            name: 'apiKey',
            message: 'Enter your API key (Anthropic or OpenAI):',
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
      }

      case 'set_url': {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'baseUrl',
            message: 'Base URL (leave empty to reset):',
            default: config.get('baseUrl') || '',
          }
        ]);

        if (answers.baseUrl.trim()) {
          config.set('baseUrl', answers.baseUrl.trim());
        } else {
          config.set('baseUrl', '');
        }

        ui.success('Base URLs updated!');
        break;
      }

      case 'set_model': {
        const fixedAnthropicModels = [
          'claude-sonnet-4-5-20250929',
          'claude-opus-4-5-20251101',
          'claude-haiku-4-5-20251001',
        ];
        const fixedOpenAIModels = [
          'gpt-4.1-mini',
          'gpt-4.1',
          'gpt-4o',
          'o3-mini',
        ];
        const customModels = (config.get('customModels') || []) as { id: string; provider: 'anthropic' | 'openai' }[];

        const { model } = await inquirer.prompt([
          {
            type: 'list',
            name: 'model',
            message: 'Select default model:',
            choices: [
              new inquirer.Separator('── Anthropic (Claude) ──'),
              { name: 'Claude Sonnet 4.5 (Recommended)', value: fixedAnthropicModels[0] },
              { name: 'Claude Opus 4.5 (Most Capable)', value: fixedAnthropicModels[1] },
              { name: 'Claude Haiku 4.5 (Fastest)', value: fixedAnthropicModels[2] },
              new inquirer.Separator('── OpenAI ──'),
              { name: 'GPT-4.1', value: fixedOpenAIModels[1] },
              { name: 'GPT-4o', value: fixedOpenAIModels[2] },
              new inquirer.Separator('── DeepSeek ──'),
              { name: 'DeepSeek Chat (V3)', value: PROVIDER_CONFIGS.deepseek.defaultModel },
              new inquirer.Separator('── Z.ai (GLM) ──'),
              { name: 'GLM-4 Flash (Fast & Free-tier)', value: PROVIDER_CONFIGS.zai.defaultModel },
              new inquirer.Separator('── Kimi (Moonshot) ──'),
              { name: 'Moonshot v1 8k', value: PROVIDER_CONFIGS.kimi.defaultModel },
              new inquirer.Separator('── Grok (xAI) ──'),
              { name: 'Grok Beta', value: PROVIDER_CONFIGS.grok.defaultModel },
              new inquirer.Separator('── OpenRouter ──'),
              { name: 'Claude 3.5 Sonnet (via OpenRouter)', value: PROVIDER_CONFIGS.openrouter.defaultModel },
              ...(customModels.length
                ? [
                  new inquirer.Separator('── Saved custom models ──'),
                  ...customModels.map(cm => ({
                    name: `${cm.id} (${cm.provider})`,
                    value: cm.id,
                  })),
                ]
                : []),
              new inquirer.Separator('──────────────────────────────'),
              { name: 'Add new custom model', value: 'custom_new' },
            ],
          },
        ]);

        let chosenModelId = model;

        if (model === 'custom_new') {
          const { customModel } = await inquirer.prompt([
            {
              type: 'input',
              name: 'customModel',
              message: 'Enter custom model ID:',
            },
          ]);
          chosenModelId = customModel;
        }

        config.set('model', chosenModelId);
        ui.success(`Default model set to: ${chosenModelId}`);

        // Ask which API format this model uses
        const { provider } = await inquirer.prompt([
          {
            type: 'list',
            name: 'provider',
            message: 'Select Provider / API Format:',
            choices: [
              { name: 'Auto-detect (Recommended)', value: 'auto' },
              { name: 'Anthropic (Claude)', value: 'anthropic' },
              { name: 'OpenAI', value: 'openai' },
              { name: 'DeepSeek', value: 'deepseek' },
              { name: 'Z.ai (GLM)', value: 'zai' },
              { name: 'Kimi (Moonshot)', value: 'kimi' },
              { name: 'Grok (xAI)', value: 'grok' },
              { name: 'OpenRouter', value: 'openrouter' },
            ],
          },
        ]);

        if (provider === 'auto') {
          config.delete('provider');
          ui.success('Provider set to: auto-detect.');
        } else {
          config.set('provider', provider);
          ui.success(`Provider set to: ${provider}`);
        }

        // Persist custom model entry (upsert) when it's not one of the fixed built-ins
        const isFixed =
          fixedAnthropicModels.includes(chosenModelId) || fixedOpenAIModels.includes(chosenModelId);
        if (!isFixed) {
          let updatedCustomModels = (config.get('customModels') || []) as {
            id: string;
            provider: 'anthropic' | 'openai';
          }[];
          // Remove any existing entry with same id
          updatedCustomModels = updatedCustomModels.filter(m => m.id !== chosenModelId);
          // Add new / updated entry (when provider is explicit; skip for auto)
          if (provider !== 'auto') {
            updatedCustomModels.push({ id: chosenModelId, provider });
          }
          config.set('customModels', updatedCustomModels);
          ui.success(`Custom model saved: ${chosenModelId} (${provider})`);
        }

        break;
      }

      case 'mcp_servers': {
        const { mcpAction } = await inquirer.prompt([
          {
            type: 'list',
            name: 'mcpAction',
            message: 'MCP Server Management:',
            choices: [
              { name: '➕ Add / Edit MCP Servers (open config file)', value: 'add' },
              { name: '📋 List MCP Servers', value: 'list' },
              { name: '🗑️  Remove MCP Server', value: 'remove' },
              { name: '↩️  Back', value: 'back' },
            ],
          },
        ]);

        if (mcpAction === 'add') {
          // Delegate to the dedicated MCP command, which opens
          // ~/.xibecode/mcp-servers.json in the user's editor.
          await mcpCommand('add', []);
        } else if (mcpAction === 'list') {
          const servers = await config.getMCPServers();
          const serverNames = Object.keys(servers);
          if (serverNames.length === 0) {
            console.log(chalk.yellow('No MCP servers configured\n'));
          } else {
            console.log(chalk.bold.white('\n📡 Configured MCP Servers\n'));
            for (const serverName of serverNames) {
              const server = servers[serverName];
              console.log(chalk.cyan(`  ${serverName}`));
              console.log(chalk.gray(`    Command: ${server.command}`));
              if (server.args) console.log(chalk.gray(`    Args: ${server.args.join(' ')}`));
              console.log('');
            }
          }
        } else if (mcpAction === 'remove') {
          const servers = await config.getMCPServers();
          const serverNames = Object.keys(servers);
          if (serverNames.length === 0) {
            console.log(chalk.yellow('No MCP servers configured\n'));
          } else {
            const { serverName } = await inquirer.prompt([
              {
                type: 'list',
                name: 'serverName',
                message: 'Select server to remove:',
                choices: serverNames,
              },
            ]);

            const { confirmRemove } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'confirmRemove',
                message: `Remove MCP server "${serverName}"?`,
                default: false,
              },
            ]);

            if (confirmRemove) {
              config.removeMCPServer(serverName);
              ui.success(`MCP server "${serverName}" removed!`);
            }
          }
        }
        // mcpAction === 'back' just returns to main config menu
        break;
      }

      case 'view': {
        const displayConfig = config.getDisplayConfig();
        console.log(chalk.bold.white('Current Configuration:\n'));
        Object.entries(displayConfig).forEach(([key, value]) => {
          console.log(chalk.gray(`  ${key.padEnd(20)}: `) + chalk.white(value));
        });
        console.log('');
        break;
      }

      case 'clear_key': {
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
      }

      case 'reset': {
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
      }
    }

    console.log('');
  }
}
