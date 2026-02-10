import { render } from 'ink';
import React from 'react';
import InkApp from '../tui/InkApp.js';
import { EnhancedAgent } from '../core/agent.js';
import { CodingToolExecutor } from '../core/tools.js';
import { MCPClientManager } from '../core/mcp-client.js';
import { ConfigManager } from '../utils/config.js';
import { SessionManager } from '../core/session-manager.js';
import { ContextManager } from '../core/context.js';
import { isThemeName, type ThemeName } from '../ui/themes.js';
import chalk from 'chalk';

interface TuiOptions {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  theme?: string;
  session?: string;
}

export async function tuiCommand(options: TuiOptions) {
  const config = new ConfigManager();
  const preferredTheme = (options.theme || config.getTheme()) as string;
  const themeName: ThemeName = isThemeName(preferredTheme) ? preferredTheme : 'default';

  const cwd = process.cwd();

  const apiKey = options.apiKey || config.getApiKey();
  if (!apiKey) {
    console.log(chalk.red('✘ No API key found.'));
    console.log(chalk.white('  Set your API key:\n'));
    console.log(chalk.cyan('    xibecode config --set-key YOUR_KEY\n'));
    process.exit(1);
  }

  const model = options.model || config.getModel();
  const baseUrl = options.baseUrl || config.getBaseUrl();

  const mcpClientManager = new MCPClientManager();
  const mcpServers = await config.getMCPServers();
  const serverNames = Object.keys(mcpServers);
  if (serverNames.length > 0) {
    console.log(chalk.blue(`  ℹ Connecting to ${serverNames.length} MCP server(s)...\n`));
    for (const serverName of serverNames) {
      const serverConfig = mcpServers[serverName];
      try {
        await mcpClientManager.connect(serverName, serverConfig);
        const tools = mcpClientManager.getAvailableTools().filter(t => t.serverName === serverName);
        console.log(chalk.green(`  ✓ Connected to ${serverName} (${tools.length} tool(s))`));
      } catch (error: any) {
        console.log(chalk.yellow(`  ✗ Failed to connect to ${serverName}: ${error.message}`));
      }
    }
    console.log('');
  }

  const sessionManager = new SessionManager(config.getSessionDirectory());
  const contextManager = new ContextManager(cwd);

  const agent = new EnhancedAgent({
    apiKey,
    baseUrl,
    model,
    maxIterations: config.get('maxIterations') || 150,
    verbose: false,
  });

  const toolExecutor = new CodingToolExecutor(cwd, {
    mcpClientManager,
    dryRun: config.get('enableDryRunByDefault') ?? false,
    testCommandOverride: config.get('testCommandOverride'),
  });

  // Prepare initial session (load or create)
  const currentSession = await (async () => {
    if (options.session) {
      const existing = await sessionManager.loadSession(options.session);
      if (existing) {
        agent.setMessages(existing.messages || []);
        return existing;
      }
    }
    return sessionManager.createSession({ model, cwd });
  })();

  const { waitUntilExit } = render(
    React.createElement(InkApp, {
      agent,
      sessionManager,
      initialSession: currentSession,
      config,
      mcpClientManager,
      toolExecutor,
      model,
      themeName,
      cwd,
      enableToolsByDefault: true,
    })
  );
  await waitUntilExit();

  if (serverNames.length > 0) {
    await mcpClientManager.disconnectAll();
  }
}

