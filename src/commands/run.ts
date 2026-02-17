import * as fs from 'fs/promises';
import { EnhancedAgent } from '../core/agent.js';
import { CodingToolExecutor } from '../core/tools.js';
import { PluginManager } from '../core/plugins.js';
import { MCPClientManager } from '../core/mcp-client.js';
import { EnhancedUI } from '../ui/enhanced-tui.js';
import { ConfigManager } from '../utils/config.js';
import { PlanMode } from '../core/planMode.js';
import { TodoManager } from '../utils/todoManager.js';
import { NeuralMemory } from '../core/memory.js';
import { SkillManager } from '../core/skills.js';
import chalk from 'chalk';

interface RunOptions {
  file?: string;
  model?: string;
  mode?: string;
  baseUrl?: string;
  apiKey?: string;
  provider?: string;
  maxIterations: string;
  verbose: boolean;
  dryRun?: boolean;
  changedOnly?: boolean;
  nonInteractive?: boolean;
}

export async function runCommand(prompt: string | undefined, options: RunOptions) {
  const ui = new EnhancedUI(options.verbose);
  const config = new ConfigManager();

  ui.header('0.2.7');

  // Get API key
  const apiKey = options.apiKey || config.getApiKey();
  if (!apiKey) {
    ui.error('No API key found!');
    console.log(chalk.white('  Set your API key using one of these methods:\n'));
    console.log(chalk.cyan('    1. xibecode config --set-key YOUR_KEY'));
    console.log(chalk.cyan('    2. export ANTHROPIC_API_KEY=your_key'));
    console.log(chalk.cyan('    3. xibecode run --api-key YOUR_KEY "task"\n'));
    process.exit(1);
  }

  // Get prompt
  let finalPrompt = prompt;
  if (options.file) {
    try {
      finalPrompt = await fs.readFile(options.file, 'utf-8');
      ui.info(`Loaded prompt from: ${options.file}`);
    } catch (error: any) {
      ui.error(`Failed to read file: ${options.file}`, error);
      process.exit(1);
    }
  }

  if (!finalPrompt) {
    ui.error('No prompt provided!');
    console.log(chalk.white('\n  Usage:\n'));
    console.log(chalk.cyan('    xibecode run "your task"'));
    console.log(chalk.cyan('    xibecode run --file prompt.txt\n'));
    process.exit(1);
  }

  // Get model and base URL
  const model = options.model || config.getModel();
  const baseUrl = options.baseUrl || config.getBaseUrl();
  const provider = (options.provider as 'anthropic' | 'openai' | undefined) || config.get('provider');
  const parsedIterations = parseInt(options.maxIterations);
  const maxIterations = parsedIterations > 0 ? parsedIterations : 150;

  // Get dry-run setting
  const dryRun = options.dryRun ?? config.get('enableDryRunByDefault') ?? false;
  const testCommandOverride = config.get('testCommandOverride');

  // Plan mode: decide if this is a large/complex task and, if so,
  // create/extend todo.md before starting the agent.
  const planMode = new PlanMode(
    process.cwd(),
    {
      apiKey,
      baseUrl,
      model,
      maxIterations: 10, // Not used by PlanMode directly anymore, but kept for type compatibility if needed
      verbose: options.verbose
    },
    provider as 'anthropic' | 'openai'
  );
  const isLarge = planMode.isLargeTask(finalPrompt);
  let effectivePrompt = finalPrompt;
  let activeTodoId: string | undefined;

  if (isLarge) {
    const plan = await planMode.buildPlan(finalPrompt);
    const todoManager = new TodoManager(process.cwd());
    const next = todoManager.getNextPending(plan.doc);

    ui.info(`Created/updated todo.md with ${plan.tasks.length} task(s).`);
    if (next) {
      activeTodoId = next.id;
      ui.info(`Focusing on TODO [id:${next.id}]: ${next.title}`);
      effectivePrompt = [
        'High-level request:',
        finalPrompt,
        '',
        `Current TODO from todo.md [id:${next.id}]:`,
        next.title,
        '',
        'Focus on completing this TODO first. When it is complete, suggest next steps.',
      ].join('\n');
    }
  }

  // Load plugins
  const pluginManager = new PluginManager();
  const pluginPaths = config.get('plugins') || [];
  if (pluginPaths.length > 0) {
    try {
      await pluginManager.loadPlugins(pluginPaths);
      const loadedPlugins = pluginManager.getPlugins();
      if (loadedPlugins.length > 0) {
        ui.info(`Loaded ${loadedPlugins.length} plugin(s): ${loadedPlugins.map(p => p.name).join(', ')}`);
      }
    } catch (error: any) {
      ui.warning(`Failed to load some plugins: ${error.message}`);
    }
  }

  // Load and connect to MCP servers
  const mcpClientManager = new MCPClientManager();
  const mcpServers = await config.getMCPServers();
  const serverNames = Object.keys(mcpServers);
  if (serverNames.length > 0) {
    ui.info(`Connecting to ${serverNames.length} MCP server(s)...`);
    for (const serverName of serverNames) {
      const serverConfig = mcpServers[serverName];
      try {
        await mcpClientManager.connect(serverName, serverConfig);
        const tools = mcpClientManager.getAvailableTools().filter(t => t.serverName === serverName);
        ui.info(`  ✓ Connected to ${serverName} (${tools.length} tool(s))`);
      } catch (error: any) {
        ui.warning(`  ✗ Failed to connect to ${serverName}: ${error.message}`);
      }
    }
  }

  // Show session info
  ui.startSession(effectivePrompt, { model, maxIterations, dryRun });

  // Initialize components
  const memory = new NeuralMemory();
  await memory.init().catch(() => { });

  const skillManager = new SkillManager(process.cwd(), apiKey, baseUrl, model, provider);
  await skillManager.loadSkills();

  const toolExecutor = new CodingToolExecutor(process.cwd(), {
    dryRun,
    testCommandOverride,
    pluginManager,
    mcpClientManager,
    memory,
    skillManager,
  });
  const agent = new EnhancedAgent(
    {
      apiKey,
      baseUrl,
      model,
      maxIterations,
      verbose: options.verbose,
      mode: (options.mode as any) || 'agent',
      provider: provider as any,
      customProviderFormat: config.get('customProviderFormat'),
    },
    provider as any);
  // Inject memory into agent (we'll need to update Agent to accept it or just let it use its own? Better to share same instance)
  (agent as any).memory = memory;

  const startTime = Date.now();
  let currentIteration = 0;

  // Set up event handlers
  agent.on('event', (event: any) => {
    switch (event.type) {
      case 'iteration':
        currentIteration = event.data.current;
        ui.iteration(event.data.current, event.data.total);
        break;

      case 'thinking':
        ui.thinking(event.data.message);
        break;

      // ── Streaming ──
      case 'stream_start':
        ui.startAssistantResponse();
        break;

      case 'stream_text':
        ui.streamText(event.data.text);
        break;

      case 'stream_end':
        ui.endAssistantResponse();
        break;

      // ── Non-streaming fallback ──
      case 'response':
        ui.response(event.data.text);
        break;

      // ── Tools ──
      case 'tool_call':
        ui.toolCall(event.data.name, event.data.input, event.data.index);
        break;

      case 'tool_result':
        ui.toolResult(event.data.name, event.data.result, event.data.success);

        // Show diff for file edits (verbose only, handled inside showDiff)
        if (event.data.result?.diff) {
          ui.showDiff(event.data.result.diff, event.data.result.path || 'file');
        }

        // Show file changes
        if (event.data.result?.success && event.data.name === 'write_file') {
          ui.fileChanged('created', event.data.result.path, `${event.data.result.lines} lines`);
        } else if (event.data.result?.success && event.data.name === 'edit_file') {
          ui.fileChanged('modified', event.data.result.path || '',
            event.data.result.linesChanged ? `${event.data.result.linesChanged} lines` : '');
        }
        break;

      case 'error':
        ui.error(event.data.message || event.data.error || 'An error occurred');
        break;

      case 'warning':
        ui.warning(event.data.message);
        break;

      case 'complete':
        break;
    }
  });

  // Run the agent
  try {
    await agent.run(effectivePrompt, toolExecutor.getTools(), toolExecutor);

    const stats = agent.getStats();
    const duration = Date.now() - startTime;

    // If we were working on a specific TODO, mark it as done now.
    if (activeTodoId) {
      const todoManager = new TodoManager(process.cwd());
      await todoManager.updateStatus(activeTodoId, 'done');
    }

    ui.completionSummary({
      iterations: stats.iterations,
      duration,
      filesChanged: stats.filesChanged,
      toolCalls: stats.toolCalls,
    });

    if (stats.changedFiles.length > 0) {
      console.log(chalk.white('  📝 Files modified:\n'));
      stats.changedFiles.forEach(file => {
        console.log(chalk.gray('    • ') + chalk.white(file));
      });
      console.log('');
    }

  } catch (error: any) {
    const duration = Date.now() - startTime;

    ui.failureSummary(error.message, {
      iterations: currentIteration,
      duration,
    });

    if (options.verbose) {
      console.log(chalk.red('\n  Stack trace:'));
      console.log(chalk.gray('  ' + error.stack));
      console.log('');
    }

    process.exit(1);
  } finally {
    // Cleanup: disconnect from all MCP servers
    if (serverNames.length > 0) {
      await mcpClientManager.disconnectAll();
    }
  }
}
