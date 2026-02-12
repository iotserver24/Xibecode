import { ConfigManager } from '../utils/config.js';
import { EnhancedUI } from '../ui/enhanced-tui.js';
import { SmitheryClient } from '../utils/smithery.js';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function mcpCommand(action: string, args: string[]) {
  const config = new ConfigManager();
  const ui = new EnhancedUI(false, config.getTheme() as any);

  if (!action) {
    ui.info('Usage: xibecode mcp <install|search|list|login> [args]');
    return;
  }

  switch (action) {
    case 'list':
      await handleList(ui, config);
      break;
    case 'search':
      const query = args.join(' ');
      if (!query) {
        ui.error('Please provide a search query');
        return;
      }
      await handleSearch(ui, query);
      break;
    case 'install':
    case 'add':
      if (args.length === 0) {
        // Interactive add mode if no args
        await handleAddInteractive(ui, config);
      } else {
        await handleInstall(ui, config, args[0]);
      }
      break;

    case 'remove':
      if (args.length === 0) {
        ui.error('Please provide a server name to remove');
        return;
      }
      await handleRemove(ui, config, args[0]);
      break;

    case 'login':
      await handleLogin(ui);
      break;

    case 'file':
      console.log(config.getMCPServersFileManager().getFilePath());
      break;

    case 'edit':
      // Open in default editor
      const editor = process.env.EDITOR || 'vim';
      const file = config.getMCPServersFileManager().getFilePath();
      ui.info(`Opening ${file} in ${editor}...`);
      try {
        const proc = exec(`${editor} "${file}"`);
        proc.unref(); // Detach
      } catch (e) {
        ui.error(`Failed to open editor: ${e}`);
      }
      break;

    case 'init':
      await config.getMCPServersFileManager().createDefaultFile();
      ui.success('Created default mcp-servers.json');
      break;

    case 'reload':
      // Just reload config to verify
      await config.getMCPServers();
      ui.success('Reloaded configuration');
      break;

    default:
      ui.error(`Unknown action: ${action}`);
      ui.info('Usage: xibecode mcp <install|search|list|login> [args]');
  }
}

async function handleList(ui: EnhancedUI, config: ConfigManager) {
  const servers = await config.getMCPServers();
  const fileParams = config.getMCPServersFileManager();

  if (Object.keys(servers).length === 0) {
    ui.info('No MCP servers installed.');
    return;
  }

  console.log('');
  console.log(chalk.bold('  Installed MCP Servers'));
  console.log('  ' + chalk.hex('#6B6B7B')('──────────────────────'));

  for (const [name, cfg] of Object.entries(servers)) {
    console.log('  ' + chalk.hex('#00D4FF')(name));
    console.log('    ' + chalk.hex('#6B6B7B')(`Command: ${cfg.command} ${(cfg.args || []).join(' ')}`));
    if (cfg.env && Object.keys(cfg.env).length > 0) {
      console.log('    ' + chalk.dim(`Env: ${Object.keys(cfg.env).join(', ')}`));
    }
    console.log('');
  }

  console.log('  ' + chalk.dim(`Config file: ${fileParams.getFilePath()}`));
  console.log('');
}

async function handleSearch(ui: EnhancedUI, query: string) {
  const client = new SmitheryClient();
  ui.thinking(`Searching for "${query}" on Smithery...`);

  const results = await client.search(query);
  ui.stopSpinner();

  if (results.length === 0) {
    ui.info(`No results found for "${query}"`);
    return;
  }

  console.log('');
  console.log(chalk.bold(`  Search Results for "${query}"`));
  console.log('  ' + chalk.hex('#6B6B7B')('────────────────────────────────────────'));

  results.slice(0, 10).forEach(server => {
    console.log('  ' + chalk.hex('#00D4FF')(server.qualifiedName));
    if (server.displayName) console.log('    ' + chalk.white(server.displayName));
    if (server.description) console.log('    ' + chalk.dim(server.description.split('\n')[0].slice(0, 100) + '...'));
    console.log('    ' + chalk.hex('#6B6B7B')(`Downloads: ${server.useCount || 0}`));
    console.log('');
  });

  ui.info(`To install: xibecode mcp install <qualifiedName>`);
}

async function handleInstall(ui: EnhancedUI, config: ConfigManager, serverName: string) {
  const client = new SmitheryClient();
  let qualifiedName = serverName;

  // Check if it looks like a qualified name (user/repo)
  if (!serverName.includes('/')) {
    ui.thinking(`Resolving "${serverName}"...`);
    const results = await client.search(serverName);
    ui.stopSpinner();

    if (results.length === 0) {
      ui.error(`Could not find server "${serverName}"`);
      return;
    }

    // If exact match found
    const exact = results.find(r => r.qualifiedName === serverName || r.displayName === serverName);
    if (exact) {
      qualifiedName = exact.qualifiedName;
    } else {
      // Ask user to pick
      const { picked } = await inquirer.prompt([{
        type: 'list',
        name: 'picked',
        message: `Multiple matches found for "${serverName}". Select one:`,
        choices: results.map(r => ({
          name: `${r.qualifiedName} (${r.displayName || ''})`,
          value: r.qualifiedName
        }))
      }]);
      qualifiedName = picked;
    }
  }

  ui.thinking(`Configuring ${qualifiedName}...`);

  const runConfig = client.getRunConfig(qualifiedName);
  const fileManager = config.getMCPServersFileManager();
  const existing = await fileManager.loadMCPServers();

  // Determine a local name (last part of qualified name)
  const localName = qualifiedName.split('/').pop() || qualifiedName;

  if (existing[localName]) {
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: `Server "${localName}" already exists. Overwrite?`,
      default: false
    }]);
    if (!overwrite) {
      ui.info('Installation cancelled.');
      return;
    }
  }

  // Add to config
  existing[localName] = runConfig;
  await fileManager.saveMCPServers(existing);

  ui.stopSpinner();
  ui.success(`Installed ${qualifiedName} as "${localName}"`);
  console.log(chalk.dim(`  Command: ${runConfig.command} ${runConfig.args.join(' ')}`));

  ui.info('NOTE: If this server requires authentication, run: xibecode mcp login');
}

async function handleRemove(ui: EnhancedUI, config: ConfigManager, serverName: string) {
  const fileManager = config.getMCPServersFileManager();
  const existing = await fileManager.loadMCPServers();

  if (!existing[serverName]) {
    ui.error(`Server "${serverName}" not found.`);
    return;
  }

  delete existing[serverName];
  await fileManager.saveMCPServers(existing);
  ui.success(`Removed server "${serverName}"`);
}

async function handleAddInteractive(ui: EnhancedUI, config: ConfigManager) {
  const { mode } = await inquirer.prompt([{
    type: 'list',
    name: 'mode',
    message: 'How do you want to add a server?',
    choices: [
      { name: 'Search Smithery Registry', value: 'search' },
      { name: 'Enter Qualified Name (user/repo)', value: 'manual' }
    ]
  }]);

  if (mode === 'search') {
    const { query } = await inquirer.prompt([{
      type: 'input',
      name: 'query',
      message: 'Search query:'
    }]);
    await handleSearch(ui, query);
    // Prompt to install from search results? 
    // For simplicity, just list for now and let user copy command.
  } else {
    const { name } = await inquirer.prompt([{
      type: 'input',
      name: 'name',
      message: 'Enter qualified name (e.g. call518/mcp-mysql-ops):'
    }]);
    if (name) await handleInstall(ui, config, name);
  }
}

async function handleLogin(ui: EnhancedUI) {
  console.log(chalk.cyan('Launching Smithery login...'));
  try {
    // Run interactively
    const proc = exec('npx -y @smithery/cli login');

    proc.stdout?.on('data', (data) => process.stdout.write(data));
    proc.stderr?.on('data', (data) => process.stderr.write(data));

    // We can't really pipe stdin easily in this async wrapper if not in raw mode,
    // but smithery login usually just opens a browser.

    await new Promise((resolve) => {
      proc.on('exit', resolve);
    });
    ui.success('Login command finished.');
  } catch (e: any) {
    ui.error(`Login failed: ${e.message}`);
  }
}
