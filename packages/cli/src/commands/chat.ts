import { launchClaudeStyleChat } from '../ui/claude-style-chat.js';
import { createRoot } from '../ink.js';
import { exitWithMessage } from '../interactiveHelpers.js';
import * as readline from 'node:readline';
import { createRequire } from 'module';
import { ConfigManager } from '../utils/config.js';
import { SkillManager } from 'xibecode-core';
import { builtInSkillsDir } from '../utils/built-in-skills-dir.js';
import { MCPClientManager } from 'xibecode-core';
import { CodingToolExecutor, NeuralMemory } from 'xibecode-core';
import { EnhancedAgent, AgentStream } from 'xibecode-core';
import { SessionManager } from 'xibecode-core';

interface ChatOptions {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  provider?: string;
  costMode?: string;
  theme?: string;
  session?: string;
  profile?: string;
  plain?: boolean;
}

async function runPlainChat(options: ChatOptions): Promise<void> {
  const require = createRequire(import.meta.url);
  const pkg = require('../../package.json') as { version?: string };
  const version = pkg.version ?? '';

  const config = new ConfigManager(options.profile);
  const apiKey = options.apiKey || config.getApiKey();
  if (!apiKey) {
    throw new Error('No API key found. Run xibecode config --set-key YOUR_KEY');
  }

  const useEconomy = (options.costMode || config.getCostMode()) === 'economy';
  const model = options.model || config.getModel(useEconomy);
  const baseUrl = options.baseUrl || config.getBaseUrl();
  const provider = (options.provider as any) || config.get('provider');

  const skillManager = new SkillManager(process.cwd(), apiKey, baseUrl, model, provider, builtInSkillsDir);
  await skillManager.loadSkills();

  const mcpClientManager = new MCPClientManager();
  const memory = new NeuralMemory(process.cwd());
  await memory.init().catch(() => { });
  const toolExecutor = new CodingToolExecutor(process.cwd(), { mcpClientManager, skillManager, memory });

  console.log(`xibecode chat (plain) v${version}`.trim());
  console.log(`model: ${model} | provider: ${provider ?? 'auto'} | format: ${config.get('requestFormat') ?? 'auto'}`);
  console.log('Type /exit to quit.');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: '> ',
  });

  const print = (line: string) => {
    process.stdout.write(line.endsWith('\n') ? line : line + '\n');
  };

  rl.prompt();
  for await (const line of rl) {
    const input = String(line ?? '').trim();
    if (!input) {
      rl.prompt();
      continue;
    }
    if (input === '/exit') {
      rl.close();
      break;
    }
    const autoSkillsShEnabled =
      process.env.XIBECODE_AUTO_SKILLS_SH === '1' || process.env.XIBECODE_AUTO_SKILLS_SH === 'true';
    let autoInstalledSkillNames: string[] = [];
    if (autoSkillsShEnabled) {
      const auto = await skillManager.autoInstallFromSkillsShForTask(input, { enabled: true, maxInstalls: 1 });
      autoInstalledSkillNames = auto.installedSkillNames || [];
    }
    let defaultSkillsPrompt = await skillManager.buildDefaultSkillsPromptForTask(input, process.cwd());
    for (const name of autoInstalledSkillNames) {
      const s = skillManager.getSkill(name);
      if (!s?.instructions) continue;
      defaultSkillsPrompt += `\n\n---\n\n## Auto-installed skills.sh skill\n\n### ${s.name}\n*${s.description}*\n\n${s.instructions}`;
      break;
    }

    const agent = new EnhancedAgent(
      {
        apiKey,
        baseUrl,
        model,
        maxIterations: 150,
        verbose: false,
        provider,
        customProviderFormat: config.get('customProviderFormat'),
        requestFormat: config.get('requestFormat') ?? 'auto',
        defaultSkillsPrompt,
      },
      provider,
    );

    const stream = new AgentStream(agent, input, toolExecutor.getTools(), toolExecutor);
    let costLabel = '';
    await stream.onEvent((event) => {
      switch (event.type) {
        case 'thinking':
          print(`[info] ${event.message}`);
          break;
        case 'text_delta':
          process.stdout.write(event.text);
          break;
        case 'tool_call_start':
          print(`[tool] ${event.name}`);
          break;
        case 'tool_call_end':
          print(`[tool_out] ${event.name}: ${event.success ? 'ok' : 'error'}`);
          break;
        case 'warning':
          print(`[warn] ${event.message}`);
          break;
        case 'error':
          print(`[error] ${event.message}`);
          break;
        case 'complete':
          costLabel = event.costLabel ?? '';
          break;
        case 'cancelled':
          print('[cancelled]');
          break;
      }
    });
    process.stdout.write('\n');
    print(`[done]` + (costLabel ? ` cost ${costLabel}` : ''));
    rl.prompt();
  }
}

export async function chatCommand(options: ChatOptions) {
  try {
    if (options.session) {
      const sessionManager = new SessionManager();
      const session = await sessionManager.loadSession(options.session);
      if (!session) {
        console.error(`Session not found: ${options.session}`);
        process.exit(1);
      }
      const initialMessages = session.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
      await launchClaudeStyleChat({
        ...options,
        sessionId: session.id,
        initialMessages,
        model: options.model || session.model,
      });
      return;
    }
    if (options.plain) {
      await runPlainChat(options);
      return;
    }
    await launchClaudeStyleChat(options);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error starting chat session';
    const root = createRoot({ exitOnCtrlC: true });
    await exitWithMessage(root, message, { color: 'error', exitCode: 1 });
  }
}
