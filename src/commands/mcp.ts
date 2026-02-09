import { ConfigManager, MCPServerConfig } from '../utils/config.js';
import { EnhancedUI } from '../ui/enhanced-tui.js';
import chalk from 'chalk';
import inquirer from 'inquirer';

interface MCPAddOptions {
  command: string;
  args?: string;
  env?: string;
}

interface MCPCommandOptions {
  add?: MCPAddOptions;
}

export async function mcpCommand(
  action: 'add' | 'list' | 'remove' | 'file' | 'edit' | 'init' | 'reload',
  nameOrOptions?: string | MCPCommandOptions,
  options?: MCPAddOptions
): Promise<void> {
  const ui = new EnhancedUI(false);
  const config = new ConfigManager();

  if (action === 'add') {
    const serverName = nameOrOptions as string;
    const addOptions = options as MCPAddOptions;

    if (!serverName) {
      ui.error('Server name is required');
      console.log(chalk.white('\n  Usage: xibecode mcp add <name> --command <command> [--args <args>] [--env <env>]\n'));
      process.exit(1);
    }

    if (!addOptions?.command) {
      ui.error('--command flag is required');
      console.log(chalk.white('\n  Usage: xibecode mcp add <name> --command <command> [--args <args>] [--env <env>]\n'));
      process.exit(1);
    }

    // Check if server already exists
    const existing = config.getMCPServer(serverName);
    if (existing) {
      ui.error(`MCP server "${serverName}" already exists`);
      console.log(chalk.gray(`  Use "xibecode mcp remove ${serverName}" to remove it first\n`));
      process.exit(1);
    }

    // Validate command exists (check if it's in PATH)
    try {
      // Try to resolve the command
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      // Check if command exists by trying to get its version or help
      await execAsync(`which ${addOptions.command.split(' ')[0]}`, { timeout: 2000 });
    } catch (error) {
      ui.warning(`Command "${addOptions.command}" may not be in PATH`);
      console.log(chalk.gray('  Make sure the command is installed and accessible\n'));
    }

    // Parse arguments
    let args: string[] | undefined;
    if (addOptions.args) {
      // Handle both space-separated and quoted strings
      args = addOptions.args.trim().split(/\s+/).filter(arg => arg.length > 0);
    }

    // Parse environment variables
    let env: Record<string, string> | undefined;
    if (addOptions.env) {
      env = {};
      const pairs = addOptions.env.split(',').map(pair => pair.trim());
      for (const pair of pairs) {
        const [key, ...valueParts] = pair.split('=');
        if (key && valueParts.length > 0) {
          env[key.trim()] = valueParts.join('=').trim();
        }
      }
      if (Object.keys(env).length === 0) {
        env = undefined;
      }
    }

    // Create server configuration
    const serverConfig: MCPServerConfig = {
      name: serverName,
      transport: 'stdio',
      command: addOptions.command,
      ...(args && args.length > 0 && { args }),
      ...(env && Object.keys(env).length > 0 && { env }),
    };

    try {
      config.addMCPServer(serverConfig);
      ui.success(`MCP server "${serverName}" added successfully!`);
      console.log(chalk.gray(`  Command: ${addOptions.command}`));
      if (args && args.length > 0) {
        console.log(chalk.gray(`  Args: ${args.join(' ')}`));
      }
      if (env && Object.keys(env).length > 0) {
        console.log(chalk.gray(`  Env: ${Object.keys(env).join(', ')}`));
      }
      console.log('');
    } catch (error: any) {
      ui.error(`Failed to add MCP server: ${error.message}`);
      process.exit(1);
    }

  } else if (action === 'list') {
    const servers = await config.getMCPServers();
    
    if (servers.length === 0) {
      console.log(chalk.yellow('No MCP servers configured\n'));
      console.log(chalk.white('  Add a server with: xibecode mcp add <name> --command <command>\n'));
      return;
    }

    console.log(chalk.bold.white('\n📡 Configured MCP Servers\n'));
    servers.forEach((server, index) => {
      console.log(chalk.cyan(`  ${index + 1}. ${server.name}`));
      console.log(chalk.gray(`     Transport: ${server.transport}`));
      console.log(chalk.gray(`     Command: ${server.command}`));
      if (server.args && server.args.length > 0) {
        console.log(chalk.gray(`     Args: ${server.args.join(' ')}`));
      }
      if (server.env && Object.keys(server.env).length > 0) {
        const envKeys = Object.keys(server.env);
        console.log(chalk.gray(`     Env: ${envKeys.join(', ')}`));
      }
      console.log('');
    });

  } else if (action === 'remove') {
    const serverName = nameOrOptions as string;

    if (!serverName) {
      ui.error('Server name is required');
      console.log(chalk.white('\n  Usage: xibecode mcp remove <name>\n'));
      process.exit(1);
    }

    const removed = config.removeMCPServer(serverName);
    
    if (removed) {
      ui.success(`MCP server "${serverName}" removed successfully!`);
    } else {
      ui.error(`MCP server "${serverName}" not found`);
      console.log(chalk.gray(`  Use "xibecode mcp list" to see configured servers\n`));
      process.exit(1);
    }
  } else if (action === 'file') {
    const fileManager = config.getMCPServersFileManager();
    const filePath = fileManager.getFilePath();
    const exists = await fileManager.fileExists();
    
    console.log(chalk.bold.white('\n📄 MCP Servers Configuration File\n'));
    console.log(chalk.cyan(`  Path: ${filePath}`));
    console.log(chalk.gray(`  Status: ${exists ? chalk.green('exists') : chalk.yellow('does not exist')}\n`));
    
    if (exists) {
      const validation = await fileManager.validateFile();
      if (validation.valid) {
        const servers = await fileManager.loadMCPServers();
        console.log(chalk.green(`  ✓ Valid configuration (${servers.length} server(s))\n`));
      } else {
        console.log(chalk.yellow('  ⚠ Configuration has errors:\n'));
        validation.errors.forEach(error => {
          console.log(chalk.yellow(`    • ${error}`));
        });
        console.log('');
      }
    } else {
      console.log(chalk.white('  Create it with: xibecode mcp init\n'));
    }

  } else if (action === 'edit') {
    const fileManager = config.getMCPServersFileManager();
    const filePath = fileManager.getFilePath();
    
    // Create file if it doesn't exist
    if (!(await fileManager.fileExists())) {
      await fileManager.createDefaultFile();
      ui.success('Created default MCP servers file');
    }

    // Open in default editor
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const editor = process.env.EDITOR || process.env.VISUAL || (process.platform === 'win32' ? 'notepad' : 'nano');
    
    try {
      console.log(chalk.cyan(`Opening ${filePath} in ${editor}...\n`));
      await execAsync(`${editor} "${filePath}"`);
      ui.success('File saved. Run "xibecode mcp reload" to reload servers.');
    } catch (error: any) {
      ui.error(`Failed to open editor: ${error.message}`);
      console.log(chalk.white(`\n  Edit the file manually: ${filePath}\n`));
      process.exit(1);
    }

  } else if (action === 'init') {
    const fileManager = config.getMCPServersFileManager();
    
    if (await fileManager.fileExists()) {
      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: 'File already exists. Overwrite with default template?',
          default: false,
        },
      ]);

      if (!overwrite) {
        console.log(chalk.gray('Cancelled.\n'));
        return;
      }
    }

    await fileManager.createDefaultFile();
    ui.success('Created default MCP servers configuration file!');
    console.log(chalk.gray(`  File: ${fileManager.getFilePath()}\n`));
    console.log(chalk.white('  Edit it with: xibecode mcp edit\n'));

  } else if (action === 'reload') {
    const fileManager = config.getMCPServersFileManager();
    
    if (!(await fileManager.fileExists())) {
      ui.error('MCP servers file does not exist');
      console.log(chalk.white('  Create it with: xibecode mcp init\n'));
      process.exit(1);
    }

    const validation = await fileManager.validateFile();
    if (!validation.valid) {
      ui.error('File has validation errors:');
      validation.errors.forEach(error => {
        console.log(chalk.red(`  • ${error}`));
      });
      console.log('');
      process.exit(1);
    }

    const servers = await fileManager.loadMCPServers();
    ui.success(`Reloaded ${servers.length} MCP server(s) from file`);
    console.log(chalk.gray('  Restart xibecode chat/run to use updated servers\n'));
  }
}
