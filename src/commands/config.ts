import { ConfigManager, MCPServerConfig } from '../utils/config.js';
import { EnhancedUI } from '../ui/enhanced-tui.js';
import { mcpCommand } from './mcp.js';
import inquirer from 'inquirer';
import chalk from 'chalk';

async function fetchModelsFromEndpoint(opts: {
  baseUrl: string;
  apiKey: string;
}): Promise<string[]> {
  const normalizedBase = opts.baseUrl.replace(/\/+$/, '');

  const res = await fetch(`${normalizedBase}/models`, {
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`GET /models failed (${res.status})`);
  const payload = (await res.json()) as { data?: Array<{ id?: string }> };
  const models = (payload.data ?? []).map((m) => m.id ?? '').filter(Boolean);
  const unique = Array.from(new Set(models)).filter(Boolean).sort((a, b) => a.localeCompare(b));
  if (!unique.length) throw new Error('No models returned from /models');
  return unique;
}

interface ConfigOptions {
  setKey?: string;
  setUrl?: string;
  setModel?: string;
  setProvider?: string;
  setCostMode?: string;
  setEconomyModel?: string;
  show?: boolean;
  reset?: boolean;
  listMcpServers?: boolean;
  addMcpServer?: string;
  removeMcpServer?: string;
  profile?: string;
  listProfiles?: boolean;
  setDefaultProfile?: string;
}

export async function configCommand(options: ConfigOptions) {
  const ui = new EnhancedUI(false);
  const config = new ConfigManager(options.profile);

  const canRenderInteractiveLists =
    Boolean(process.stdin.isTTY) &&
    Boolean(process.stdout.isTTY) &&
    !process.env.CI &&
    process.env.TERM !== 'dumb';

  const printNonInteractiveMenu = () => {
    ui.header('1.0.0');
    console.log(chalk.bold.white('⚙️  Configuration (non-interactive)\n'));
    console.log(chalk.dim('Interactive menu could not be rendered.\n'));
    console.log(chalk.bold('Available options:\n'));
    console.log(chalk.cyan('  xibecode config --show'));
    console.log(chalk.cyan('  xibecode config --set-key <key>'));
    console.log(chalk.cyan('  xibecode config --set-url <url>'));
    console.log(chalk.cyan('  xibecode config --set-model <model>'));
    console.log(chalk.cyan('  xibecode config --set-provider <provider>'));
    console.log(chalk.cyan('  xibecode config --set-cost-mode <normal|economy>'));
    console.log(chalk.cyan('  xibecode config --set-economy-model <model>'));
    console.log(chalk.cyan('  xibecode config --list-mcp-servers'));
    console.log(chalk.cyan('  xibecode config --list-profiles'));
    console.log(chalk.cyan('  xibecode config --set-default-profile <name>'));
    console.log(chalk.cyan('  xibecode config --reset'));
    console.log('');
    console.log(chalk.dim('Tip: add `--profile <name>` to target a specific profile.'));
    console.log('');
  };

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

  if (options.setProvider) {
    const provider = options.setProvider.toLowerCase();
    const allowed = ['anthropic', 'openai', 'deepseek', 'zai', 'kimi', 'grok', 'openrouter', 'google', 'auto'];

    if (!allowed.includes(provider)) {
      ui.error(
        `Invalid provider "${options.setProvider}". Valid values: ${allowed.join(
          ', ',
        )}`,
      );
      process.exit(1);
    }

    if (provider === 'auto') {
      config.delete('provider');
      ui.success('Provider reset to auto-detect.');
    } else {
      config.set('provider', provider as any);
      ui.success(`Provider set to: ${provider}`);
    }
    return;
  }

  if (options.setCostMode) {
    const mode = options.setCostMode.toLowerCase();
    if (mode !== 'normal' && mode !== 'economy') {
      ui.error(`Invalid cost mode "${options.setCostMode}". Use: normal or economy`);
      process.exit(1);
    }
    config.set('costMode', mode as 'normal' | 'economy');
    ui.success(`Cost mode set to: ${mode}`);
    return;
  }

  if (options.setEconomyModel) {
    config.set('economyModel', options.setEconomyModel);
    ui.success(`Economy model set to: ${options.setEconomyModel}`);
    return;
  }

  if (options.listProfiles) {
    const profiles = await config.listProfiles();
    console.log(chalk.bold.white('\n👤 Config Profiles\n'));
    const defaultProfile = config.getDefaultProfile();
    for (const name of profiles) {
      const isDefault = name === defaultProfile;
      console.log(chalk.cyan(`  ${name}`) + (isDefault ? chalk.dim(' (default)') : ''));
    }
    console.log('');
    return;
  }

  if (options.setDefaultProfile) {
    try {
      config.setDefaultProfile(options.setDefaultProfile);
      ui.success(`Default profile set to: ${options.setDefaultProfile}`);
    } catch (error: any) {
      ui.error(`Failed to set default profile: ${error.message}`);
      process.exit(1);
    }
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

  if (!canRenderInteractiveLists) {
    printNonInteractiveMenu();
    return;
  }

  // Interactive configuration (loop until user chooses Exit)
  ui.header('1.0.0');
  console.log(chalk.bold.white('⚙️  Configuration Setup\n'));

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let action: string;
    try {
      const answer = await inquirer.prompt([
        {
          // Use rawlist so options always render as plain text.
          // Some terminals show the prompt but fail to render interactive lists.
          type: 'rawlist',
          name: 'action',
          message: 'What would you like to configure?',
          choices: [
            { name: '🔑 Set API Key', value: 'set_key' },
            { name: '🌐 Set Base URL', value: 'set_url' },
            { name: '🤖 Set Default Model (from /models)', value: 'set_model' },
            { name: '📡 Manage MCP Servers', value: 'mcp_servers' },
            { name: '👀 View Current Config', value: 'view' },
            { name: '🗑️  Clear API Key', value: 'clear_key' },
            { name: '↩️  Reset All Settings', value: 'reset' },
            { name: '❌ Exit', value: 'exit' },
          ],
        },
      ]);
      action = answer.action;
    } catch (error: any) {
      // Some terminals report TTY=true but cannot render inquirer lists.
      ui.warning(`Interactive menu failed: ${error?.name || 'Error'}`);
      printNonInteractiveMenu();
      return;
    }

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
            message: 'Enter your API key (Bearer token):',
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
        const apiKey = config.getApiKey();
        const baseUrl = config.getBaseUrl();

        if (!apiKey || !baseUrl) {
          ui.error('Missing API key or Base URL. Set them first (Set API Key + Set Base URL).');
          break;
        }

        let fetchedModels: string[] = [];
        try {
          fetchedModels = await fetchModelsFromEndpoint({ apiKey, baseUrl });
        } catch (error: any) {
          ui.warning(`Failed to fetch /models: ${error?.message || String(error)}`);
        }

        if (fetchedModels.length === 0) {
          const { customModel } = await inquirer.prompt([
            {
              type: 'input',
              name: 'customModel',
              message: 'Enter model ID:',
              validate: (input) => input?.trim() ? true : 'Model ID cannot be empty',
            },
          ]);
          const chosenModelId = String(customModel).trim();
          config.set('model', chosenModelId);
          ui.success(`Default model set to: ${chosenModelId}`);
          break;
        }

        const { filter } = await inquirer.prompt([
          {
            type: 'input',
            name: 'filter',
            message: 'Filter models (press Enter to show all):',
            default: '',
          },
        ]);
        const needle = String(filter || '').trim().toLowerCase();
        const filtered = needle
          ? fetchedModels.filter((m) => m.toLowerCase().includes(needle))
          : fetchedModels;
        const list = filtered.slice(0, 80);

        const { model } = await inquirer.prompt([
          {
            type: 'rawlist',
            name: 'model',
            message: `Select default model (${list.length}${filtered.length > list.length ? ` of ${filtered.length}` : ''}):`,
            choices: [
              ...list.map((m) => ({ name: m, value: m })),
              ...(filtered.length > list.length ? [{ name: 'Too many results — refine filter', value: '__refine__' }] : []),
              { name: 'Enter model ID manually', value: '__manual__' },
            ],
          },
        ]);

        if (model === '__refine__') {
          ui.warning('Refine your filter and try again.');
          break;
        }

        if (model === '__manual__') {
          const { customModel } = await inquirer.prompt([
            {
              type: 'input',
              name: 'customModel',
              message: 'Enter model ID:',
              validate: (input) => input?.trim() ? true : 'Model ID cannot be empty',
            },
          ]);
          const chosenModelId = String(customModel).trim();
          config.set('model', chosenModelId);
          ui.success(`Default model set to: ${chosenModelId}`);
          break;
        }

        const chosenModelId = String(model).trim();

        config.set('model', chosenModelId);
        ui.success(`Default model set to: ${chosenModelId}`);

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
