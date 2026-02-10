import { ConfigManager, MCPServerConfig } from '../utils/config.js';
import { EnhancedUI } from '../ui/enhanced-tui.js';
import chalk from 'chalk';
import inquirer from 'inquirer';

/**
 * Helper function to open a file in the default editor
 */
async function openFileInEditor(filePath: string, ui: EnhancedUI): Promise<void> {
  console.log(chalk.bold.white('\n📝 MCP Servers Configuration File\n'));
  console.log(chalk.cyan(`  File: ${filePath}\n`));
  
  // Check if we're in an interactive terminal
  const isInteractive = process.stdin.isTTY && process.stdout.isTTY;
  
  if (!isInteractive) {
    // Non-interactive terminal - just show the path
    console.log(chalk.white('  Edit this file manually:\n'));
    console.log(chalk.cyan(`    ${filePath}\n`));
    console.log(chalk.gray('  After editing, run: xibecode mcp reload\n'));
    return;
  }
  
  // Try to open in editor
  const editor = process.env.EDITOR || process.env.VISUAL;
  
  if (editor) {
    console.log(chalk.gray(`  Opening in ${editor}...\n`));
    
    try {
      const { spawn } = await import('child_process');
      const editorProcess = spawn(editor, [filePath], {
        stdio: 'inherit',
        detached: false,
      });
      
      editorProcess.on('error', (error: Error) => {
        console.log(chalk.yellow(`\n⚠ Could not open ${editor}: ${error.message}\n`));
        console.log(chalk.white('  Edit the file manually:\n'));
        console.log(chalk.cyan(`    ${filePath}\n`));
      });
      
      editorProcess.on('exit', (code) => {
        if (code === 0 || code === null) {
          console.log(chalk.green('\n✓ File saved. Run "xibecode mcp reload" to reload servers.\n'));
        }
      });
    } catch (error: any) {
      console.log(chalk.yellow(`\n⚠ Could not open editor: ${error.message}\n`));
      console.log(chalk.white('  Edit the file manually:\n'));
      console.log(chalk.cyan(`    ${filePath}\n`));
    }
  } else {
    // No editor set, show instructions
    console.log(chalk.white('  To edit this file:\n'));
    console.log(chalk.cyan(`    1. Open: ${filePath}\n`));
    console.log(chalk.gray('    2. Or set EDITOR environment variable:\n'));
    console.log(chalk.cyan(`       export EDITOR=code  # VS Code`));
    console.log(chalk.cyan(`       export EDITOR=nano   # Nano`));
    console.log(chalk.cyan(`       export EDITOR=vim    # Vim\n`));
    console.log(chalk.gray('    3. After editing, run: xibecode mcp reload\n'));
  }
}

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
  nameOrOptions?: string
): Promise<void> {
  const ui = new EnhancedUI(false);
  const config = new ConfigManager();

  if (action === 'add') {
    // Same as edit - just open the file for editing
    const fileManager = config.getMCPServersFileManager();
    const filePath = fileManager.getFilePath();
    
    // Create file if it doesn't exist
    if (!(await fileManager.fileExists())) {
      await fileManager.createDefaultFile();
      ui.success('Created default MCP servers file');
    }

    // Open in editor
    await openFileInEditor(filePath, ui);

  } else if (action === 'list') {
    const servers = await config.getMCPServers();

    if (Object.keys(servers).length === 0) {
      console.log(chalk.yellow('No MCP servers configured\n'));
      console.log(chalk.white('  Add a server by editing the config file: xibecode mcp edit\n'));
      return;
    }

    console.log(chalk.bold.white('\n📡 Configured MCP Servers\n'));
    let index = 1;
    for (const [serverName, serverConfig] of Object.entries(servers)) {
      console.log(chalk.cyan(`  ${index}. ${serverName}`));
      console.log(chalk.gray(`     Command: ${serverConfig.command}`));
      if (serverConfig.args && serverConfig.args.length > 0) {
        console.log(chalk.gray(`     Args: ${serverConfig.args.join(' ')}`));
      }
      if (serverConfig.env && Object.keys(serverConfig.env).length > 0) {
        const envKeys = Object.keys(serverConfig.env);
        console.log(chalk.gray(`     Env: ${envKeys.join(', ')}`));
      }
      console.log('');
      index++;
    }

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

    // Open in editor
    await openFileInEditor(filePath, ui);

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
