import React from 'react';
import { render } from 'ink';
import { EnhancedAgent } from '../core/agent.js';
import { CodingToolExecutor } from '../core/tools.js';
import { MCPClientManager } from '../core/mcp-client.js';
import { ConfigManager } from '../utils/config.js';
import { SessionManager, type ChatSession } from '../core/session-manager.js';
import { ContextManager } from '../core/context.js';
import { getAllModes, type AgentMode } from '../core/modes.js';
import { isThemeName, type ThemeName } from '../ui/themes.js';
import InkApp from '../ui/ink/App.js';

export interface TuiOptions {
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

  const apiKey = options.apiKey || config.getApiKey();
  if (!apiKey) {
    // Defer to existing config messaging rather than re‑implementing UI here.
    // The Ink app expects a working agent.
    // eslint-disable-next-line no-console
    console.error('No API key found. Set it via "xibecode config --set-key YOUR_KEY".');
    process.exit(1);
  }

  const model = options.model || config.getModel();
  const baseUrl = options.baseUrl || config.getBaseUrl();

  const mcpClientManager = new MCPClientManager();
  const mcpServers = await config.getMCPServers();
  const serverNames = Object.keys(mcpServers);
  for (const serverName of serverNames) {
    const serverConfig = mcpServers[serverName];
    try {
      // Fire and forget – errors are handled by the classic UI already.
      // eslint-disable-next-line no-await-in-loop
      await mcpClientManager.connect(serverName, serverConfig);
    } catch {
      // Ignore connection errors here; the Ink UI can surface get_mcp_status.
    }
  }

  const sessionManager = new SessionManager(config.getSessionDirectory());
  const contextManager = new ContextManager(process.cwd());

  // Create agent and tool executor
  const agent = new EnhancedAgent({
    apiKey: apiKey as string,
    baseUrl,
    model,
    maxIterations: 150,
    verbose: false,
  });

  const toolExecutor = new CodingToolExecutor(process.cwd(), { mcpClientManager });

  // Bootstrap session
  let initialSession: ChatSession;
  if (options.session) {
    const loaded = await sessionManager.loadSession(options.session);
    if (loaded) {
      initialSession = loaded;
      agent.setMessages(loaded.messages || []);
    } else {
      initialSession = await sessionManager.createSession({ model, cwd: process.cwd() });
    }
  } else {
    initialSession = await sessionManager.createSession({ model, cwd: process.cwd() });
  }

  const allModes = getAllModes();
  const initialMode: AgentMode = agent.getMode();

  render(
    React.createElement(InkApp, {
      agent,
      toolExecutor,
      sessionManager,
      initialSession,
      config,
      mcpClientManager,
      contextManager,
      initialThemeName: themeName,
      initialMode,
      allModes,
      model,
      cwd: process.cwd(),
    })
  );
}

