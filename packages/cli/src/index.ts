#!/usr/bin/env node

import { Command } from 'commander';
import { runCommand } from './commands/run.js';
import { runPrCommand } from './commands/run-pr.js';
import { chatCommand } from './commands/chat.js';
import { cloudPullCommand } from './commands/cloud-pull.js';
import { resumeCommand } from './commands/resume.js';
import { configCommand } from './commands/config.js';
import { mcpCommand } from './commands/mcp.js';
import { diagnosticsCommand } from './commands/diagnostics.js';
import { skillsCommand } from './commands/skills.js';
import { settingsCommand } from './commands/settings.js';
import { hooksCommand } from './commands/hooks.js';
import { memoryCommand } from './commands/memory.js';
import { whatsNewCommand } from './commands/whats-new.js';
import { resolveSessionBySandboxId } from './utils/cloud-gateway.js';
import { ConfigManager } from './utils/config.js';
import { resolveRemoteExecutionConfig } from './utils/remote-execution.js';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

dotenv.config();

type ChatCliOptions = Parameters<typeof chatCommand>[0];

/** Attach to an existing E2B sandbox by id (gateway resolves gateway session). */
async function runCloudChatResumeBySandboxId(sandboxId: string, options: ChatCliOptions): Promise<void> {
  process.env.XIBECODE_SANDBOX_MODE = 'e2b';
  const config = new ConfigManager(options.profile);
  const remote = resolveRemoteExecutionConfig(config, process.cwd());
  if (!remote) {
    throw new Error('Cloud runtime is not configured. Set sandbox gateway and token first.');
  }
  const resolved = await resolveSessionBySandboxId(remote, sandboxId);
  process.env.XIBECODE_SANDBOX_SESSION_ID = resolved.sessionId;
  process.env.XIBECODE_SANDBOX_SKIP_SYNC = '1';
  await chatCommand(options);
}

const program = new Command();

program
  .name('xibecode')
  .description('XibeCode - AI-powered autonomous coding assistant')
  .version(pkg.version, '-v, --version');

// Main run command
program
  .command('run')
  .description('Start an autonomous coding session')
  .argument('[prompt]', 'Task for the AI to accomplish')
  .option('-f, --file <path>', 'Read prompt from file')
  .option('-m, --model <model>', 'AI model to use')
  .option('--profile <name>', 'Config profile to use (default: configured default profile)')
  .option('--mode <mode>', 'Initial agent mode (agent, plan, debugger, etc.)')
  .option('-b, --base-url <url>', 'Custom API base URL')
  .option('-k, --api-key <key>', 'API key (overrides config)')
  .option('--provider <provider>', 'Model API format: anthropic or openai')
  .option('-d, --max-iterations <number>', 'Maximum iterations (0 = unlimited, default 150)', '150')
  .option('-v, --verbose', 'Show detailed logs', false)
  .option('--cost-mode <mode>', 'Cost mode: normal or economy (cheaper model, lower iteration/token caps)', 'normal')
  .option('--plan-first', 'Force a strategic plan (one-shot, no tools) before execution (AX-lite)', false)
  .option('--mindset-adaptive', 'Enable CoM-style reasoning mindsets (convergent/divergent/algorithmic)', false)
  .option('--dry-run', 'Preview changes without making them', false)
  .option('--changed-only', 'Focus only on git-changed files', false)
  .option('--non-interactive', 'Run in non-interactive mode (for background tasks)', false)
  .action(runCommand);

// Run task + auto branch + PR
program
  .command('run-pr')
  .description('Run an autonomous coding task, then create a branch and open a GitHub PR automatically')
  .argument('[prompt]', 'Task for the AI to accomplish')
  .option('-f, --file <path>', 'Read prompt from file')
  .option('-m, --model <model>', 'AI model to use')
  .option('--profile <name>', 'Config profile to use (default: configured default profile)')
  .option('-b, --base-url <url>', 'Custom API base URL')
  .option('-k, --api-key <key>', 'API key (overrides config)')
  .option('--provider <provider>', 'Model API format: anthropic or openai')
  .option('-d, --max-iterations <number>', 'Maximum iterations (0 = unlimited, default 150)', '150')
  .option('-v, --verbose', 'Show detailed logs', false)
  .option('--cost-mode <mode>', 'Cost mode: normal or economy (cheaper model, lower caps)', 'normal')
  .option('--plan-first', 'Force a strategic plan before execution (AX-lite)', false)
  .option('--mindset-adaptive', 'Enable CoM-style reasoning mindsets', false)
  .option('--branch <name>', 'Override branch name (default: auto-generated xibecode/<slug>-<timestamp>)')
  .option('--title <title>', 'Override PR title (default: derived from prompt)')
  .option('--draft', 'Open PR as draft', false)
  .option('--skip-tests', 'Skip test verification before creating PR', false)
  .action(runPrCommand);

// Interactive chat
program
  .command('chat')
  .description('Start an interactive chat session')
  .option('-m, --model <model>', 'AI model to use')
  .option('-b, --base-url <url>', 'Custom API base URL')
  .option('-k, --api-key <key>', 'API key (overrides config)')
  .option('--profile <name>', 'Config profile to use (default: configured default profile)')
  .option('--provider <provider>', 'Model API format: anthropic or openai')
  .option('--cost-mode <mode>', 'Cost mode: normal or economy', 'normal')
  .option('--theme <theme>', 'UI theme to use')
  .option('--session <id>', 'Resume a specific chat session by id')
  .option('--plain', 'Disable Ink UI; print line-by-line output (best for copying)', false)
  .action(chatCommand);

const cloudCmd = program
  .command('cloud')
  .description(
    'Interactive chat with E2B cloud execution (forces e2b for this process). With sandbox_full, uploads a tarball of your project first.',
  )
  .option('-m, --model <model>', 'AI model to use')
  .option('-b, --base-url <url>', 'Custom API base URL')
  .option('-k, --api-key <key>', 'API key (overrides config)')
  .option('--profile <name>', 'Config profile to use (default: configured default profile)')
  .option('--provider <provider>', 'Model API format: anthropic or openai')
  .option('--cost-mode <mode>', 'Cost mode: normal or economy', 'normal')
  .option('--theme <theme>', 'UI theme to use')
  .option('--session <id>', 'Resume a specific chat session by id')
  .option('--plain', 'Disable Ink UI; print line-by-line output (best for copying)', false)
  .action(async (options: Parameters<typeof chatCommand>[0]) => {
    process.env.XIBECODE_SANDBOX_MODE = 'e2b';
    await chatCommand(options);
  });

cloudCmd
  .command('resume')
  .description(
    'Resume chat on an existing cloud sandbox by E2B sandbox ID (same as `xibecode resume cloud <sandbox-id>`). Requires gateway and token in config.',
  )
  .argument('<sandbox-id>', 'E2B sandbox ID to resume')
  .option('-m, --model <model>', 'AI model to use')
  .option('-b, --base-url <url>', 'Custom API base URL')
  .option('-k, --api-key <key>', 'API key (overrides config)')
  .option('--profile <name>', 'Config profile to use (default: configured default profile)')
  .option('--provider <provider>', 'Model API format: anthropic or openai')
  .option('--cost-mode <mode>', 'Cost mode: normal or economy', 'normal')
  .option('--theme <theme>', 'UI theme to use')
  .option('--plain', 'Disable Ink UI; print line-by-line output (best for copying)', false)
  .action(async (sandboxId: string, options: ChatCliOptions) => {
    await runCloudChatResumeBySandboxId(sandboxId, options);
  });

cloudCmd
  .command('pull')
  .description('Download a sandbox workspace back to local disk')
  .option('--profile <name>', 'Config profile to use (default: configured default profile)')
  .option('--session <id>', 'Sandbox session ID to pull from')
  .option('--output <path>', 'Destination directory (default: .xibecode/sandbox-pull-<timestamp>)')
  .option('--apply', 'Merge sandbox files into current working directory', false)
  .option(
    '--full',
    'With --apply, extract the full archive over cwd (all files). Default --apply only writes new/changed files.',
    false,
  )
  .option('--force', 'Allow extracting into a non-empty destination directory', false)
  .action(async (options: Parameters<typeof cloudPullCommand>[0]) => {
    await cloudPullCommand(options);
  });

// Resume a host-stored session locally; `resume cloud <id>` attaches to an existing sandbox
const resumeCmd = program.command('resume');

resumeCmd
  .command('cloud')
  .description(
    'Resume chat on an existing cloud sandbox by E2B sandbox ID (alias of `xibecode cloud resume`). Requires gateway and token in config.',
  )
  .argument('<sandbox-id>', 'E2B sandbox ID to resume')
  .option('-m, --model <model>', 'AI model to use')
  .option('-b, --base-url <url>', 'Custom API base URL')
  .option('-k, --api-key <key>', 'API key (overrides config)')
  .option('--profile <name>', 'Config profile to use (default: configured default profile)')
  .option('--provider <provider>', 'Model API format: anthropic or openai')
  .option('--cost-mode <mode>', 'Cost mode: normal or economy', 'normal')
  .option('--theme <theme>', 'UI theme to use')
  .option('--plain', 'Disable Ink UI; print line-by-line output (best for copying)', false)
  .action(async (sandboxId: string, options: ChatCliOptions) => {
    await runCloudChatResumeBySandboxId(sandboxId, options);
  });

resumeCmd
  .description(
    'Resume a host-stored chat session locally (ignores global e2b for this run). To continue in an existing cloud sandbox, use: xibecode resume cloud <sandbox-id> or xibecode cloud resume <sandbox-id>.',
  )
  .argument('[session-id]', 'Session ID to resume (optional - shows picker if not provided)')
  .option('--profile <name>', 'Config profile to use (default: configured default profile)')
  .option('--all', 'Show sessions from all projects, not just the current directory')
  .action((sessionId: string | undefined, options: { profile?: string; all?: boolean }) => {
    resumeCommand({ session: sessionId, profile: options.profile, all: options.all });
  });

// Configuration
program
  .command('config')
  .description('Manage configuration')
  .option('--profile <name>', 'Config profile to use (default: configured default profile)')
  .option('--set-key <key>', 'Set API key')
  .option('--set-url <url>', 'Set custom base URL')
  .option('--set-model <model>', 'Set default model')
   .option('--set-provider <provider>', 'Set default provider/API format (anthropic, openai, deepseek, zai, kimi, grok, openrouter, google, auto)')
  .option('--set-cost-mode <mode>', 'Set cost mode: normal or economy (use cheaper model and lower caps)')
  .option('--set-economy-model <model>', 'Set model to use when cost mode is economy')
  .option('--set-sandbox-mode <mode>', 'Set command execution mode: local or e2b')
  .option('--set-sandbox-gateway-url <url>', 'Set team gateway URL used for E2B-backed command execution')
  .option('--set-sandbox-auth-token <token>', 'Set optional team gateway bearer token (not E2B API key)')
  .option('--set-sandbox-session-strategy <strategy>', 'Set sandbox session strategy: host_only or sandbox_full')
  .option('--set-sandbox-sync-max-mb <number>', 'Set max compressed workspace size for sandbox_full sync (MB)')
  .option('--set-sandbox-sync-exclude <csv>', 'Set comma-separated exclude globs for sandbox_full sync tarball')
  .option(
    '--set-sandbox-sync-respect-gitignore <bool>',
    'When true, tarball uses git ls-files (honors .gitignore); when false, tar cwd only',
  )
  .option('--show', 'Show current configuration')
  .option('--list-profiles', 'List available config profiles')
  .option('--set-default-profile <name>', 'Set the default config profile')
  .option('--reset', 'Reset all configuration')
  .option('--list-mcp-servers', 'List configured MCP servers')
  .option('--add-mcp-server <name>', 'Add an MCP server (interactive)')
  .option('--remove-mcp-server <name>', 'Remove an MCP server')
  .action(configCommand);

// Diagnostics bundle for bug reports
program
  .command('diagnostics')
  .description('Generate a diagnostics bundle for bug reports (secrets are redacted)')
  .option('-o, --output <path>', 'Output file path (default: tmp/xibecode-diagnostics-<timestamp>.md)')
  .option('--profile <name>', 'Config profile to use (default: configured default profile)')
  .option('--include-diff', 'Include full unified git diff (redacted, may be truncated)', false)
  .option('--diff-target <ref>', 'Diff target ref (default: HEAD)', 'HEAD')
  .option('-v, --verbose', 'Show detailed logs', false)
  .action(diagnosticsCommand);

// Skills management (OpenClaude-style playbooks)
program
  .command('skills [action] [args...]')
  .description('List/search/show skills (built-in + .xibecode/skills)')
  .action((action: string | undefined, args: string[], options: any) => skillsCommand(action, args, options));

// Settings management
program
  .command('settings [action] [args...]')
  .description('Manage multi-source settings (list, get, set, sources, paths)')
  .option('--profile <name>', 'Config profile to use')
  .action((action: string | undefined, args: string[], options: any) => settingsCommand(action, args, options));

// Hooks management
program
  .command('hooks [action] [args...]')
  .description('Manage lifecycle hooks (list, add, remove, events)')
  .option('--profile <name>', 'Config profile to use')
  .action((action: string | undefined, args: string[], options: any) => hooksCommand(action, args, options));

// Memory management
program
  .command('memory [action] [args...]')
  .description('Manage project auto-memories (list, search, dream, path)')
  .option('--profile <name>', 'Config profile to use')
  .action((action: string | undefined, args: string[], options: any) => memoryCommand(action, args, options));

program
  .command('whats-new')
  .alias('changelog')
  .description('Compare your CLI version to npm and show the changelog link')
  .action(async () => {
    await whatsNewCommand();
  });

// MCP Server Management
const mcpCmd = program
  .command('mcp')
  .description('Manage MCP servers (easier method)');

mcpCmd
  .command('add')
  .description('Open MCP servers configuration file to add servers')
  .action(() => mcpCommand('add', []));

mcpCmd
  .command('list')
  .description('List all configured MCP servers')
  .action(() => mcpCommand('list', []));

mcpCmd
  .command('remove')
  .description('Remove an MCP server')
  .argument('<name>', 'Server name')
  .action((name) => mcpCommand('remove', [name]));

mcpCmd
  .command('file')
  .description('Show path to MCP servers configuration file')
  .action(() => mcpCommand('file', []));

mcpCmd
  .command('edit')
  .description('Open MCP servers configuration file in editor')
  .action(() => mcpCommand('edit', []));

mcpCmd
  .command('init')
  .description('Create default MCP servers configuration file')
  .action(() => mcpCommand('init', []));

mcpCmd
  .command('reload')
  .description('Reload MCP servers from configuration file')
  .action(() => mcpCommand('reload', []));

mcpCmd
  .command('search')
  .description('Search for MCP servers on Smithery')
  .argument('<query...>', 'Search query')
  .action((query) => mcpCommand('search', query));

mcpCmd
  .command('install')
  .description('Install an MCP server')
  .argument('<name>', 'Server name (e.g. @smithery/mcp-postgres)')
  .action((name) => mcpCommand('install', [name]));

mcpCmd
  .command('login')
  .description('Authenticate with Smithery')
  .action(() => mcpCommand('login', []));

// Launch chat if no command provided (stay local unless user set a subcommand like `cloud`)
if (!process.argv.slice(2).length) {
  process.env.XIBECODE_SANDBOX_MODE = 'local';
  chatCommand({});
} else {
  program.parse();
}
