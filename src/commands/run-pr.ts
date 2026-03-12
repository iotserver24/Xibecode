import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { EnhancedAgent } from '../core/agent.js';
import { CodingToolExecutor } from '../core/tools.js';
import { PluginManager } from '../core/plugins.js';
import { MCPClientManager } from '../core/mcp-client.js';
import { EnhancedUI } from '../ui/enhanced-tui.js';
import { ConfigManager } from '../utils/config.js';
import { NeuralMemory } from '../core/memory.js';
import { SkillManager } from '../core/skills.js';
import chalk from 'chalk';

const execAsync = promisify(exec);

interface RunPrOptions {
  file?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  provider?: string;
  maxIterations: string;
  verbose: boolean;
  branch?: string;
  title?: string;
  draft?: boolean;
  skipTests?: boolean;
}

// ── Git / GitHub helpers ─────────────────────────────────────────────────────

async function exec$(cmd: string, cwd: string): Promise<string> {
  const { stdout } = await execAsync(cmd, { cwd, timeout: 60_000 });
  return stdout.trim();
}

async function assertGitRepo(cwd: string): Promise<void> {
  try {
    await exec$('git rev-parse --git-dir', cwd);
  } catch {
    throw new Error('Not inside a git repository. `run-pr` requires a git repo.');
  }
}

async function assertGhInstalled(): Promise<void> {
  try {
    await execAsync('gh --version', { timeout: 5_000 });
  } catch {
    throw new Error(
      '`gh` (GitHub CLI) is not installed or not on PATH.\n' +
      '  Install it: https://cli.github.com/\n' +
      '  Then authenticate: gh auth login'
    );
  }
}

async function assertGhAuth(): Promise<void> {
  try {
    const { stdout, stderr } = await execAsync('gh auth status', { timeout: 10_000 });
    const combined = stdout + stderr;
    if (combined.includes('not logged in') || combined.includes('not authenticated')) {
      throw new Error('gh not authenticated');
    }
  } catch (err: any) {
    if (err.message?.includes('not authenticated') || err.message?.includes('gh not authenticated')) {
      throw new Error(
        '`gh` is not authenticated with GitHub.\n' +
        '  Run: gh auth login'
      );
    }
    if (err.stderr?.includes('not logged in')) {
      throw new Error('`gh` is not authenticated with GitHub.\n  Run: gh auth login');
    }
    // auth status exits non-zero when not logged in; any other error we surface
    if (!err.message?.includes('Not authenticated') && err.code !== undefined) {
      throw new Error(`gh auth check failed: ${err.message || err.stderr}`);
    }
  }
}

/**
 * Detect the default remote base branch via `origin/HEAD`.
 * Falls back to `main` if unresolvable.
 */
async function detectDefaultBase(cwd: string): Promise<string> {
  try {
    // Try to resolve via symbolic-ref (works if remote HEAD is set)
    const ref = await exec$('git symbolic-ref refs/remotes/origin/HEAD', cwd);
    // refs/remotes/origin/main  →  main
    return ref.replace('refs/remotes/origin/', '').trim() || 'main';
  } catch {
    // remote HEAD not set — try fetching it
    try {
      await exec$('git remote set-head origin --auto', cwd);
      const ref = await exec$('git symbolic-ref refs/remotes/origin/HEAD', cwd);
      return ref.replace('refs/remotes/origin/', '').trim() || 'main';
    } catch {
      // Last resort
      return 'main';
    }
  }
}

/**
 * Create a timestamped branch name derived from the task prompt.
 */
function buildBranchName(prompt: string, overrideBranch?: string): string {
  if (overrideBranch) return overrideBranch;
  const now = new Date();
  const ts =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    '-' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join('-');
  return `xibecode/${slug ? slug + '-' : ''}${ts}`;
}

/**
 * Get list of changed/untracked files in working tree.
 */
async function getChangedFiles(cwd: string): Promise<string[]> {
  try {
    const status = await exec$('git status --short', cwd);
    if (!status) return [];
    return status
      .split('\n')
      .map(l => l.slice(3).trim().split(' -> ').pop()!)
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Stage all changes, create a commit, push branch to origin, and open a PR.
 * Returns the PR URL.
 */
async function createBranchAndPR(opts: {
  cwd: string;
  branch: string;
  baseBranch: string;
  commitMessage: string;
  prTitle: string;
  prBody: string;
  draft: boolean;
  verbose: boolean;
}): Promise<string> {
  const { cwd, branch, baseBranch, commitMessage, prTitle, prBody, draft, verbose } = opts;

  const log = (msg: string) => {
    if (verbose) console.log(chalk.dim(`  [git] ${msg}`));
  };

  // Create + checkout new branch
  log(`Creating branch: ${branch}`);
  await exec$(`git checkout -b "${branch}"`, cwd);

  // Stage everything
  log('Staging all changes...');
  await exec$('git add -A', cwd);

  // Commit
  log('Committing...');
  const escapedMsg = commitMessage.replace(/"/g, '\\"');
  await exec$(`git commit -m "${escapedMsg}"`, cwd);

  // Push
  log(`Pushing branch ${branch} to origin...`);
  await exec$(`git push -u origin "${branch}"`, cwd);

  // Build gh pr create args
  const escapedTitle = prTitle.replace(/"/g, '\\"');
  const escapedBody = prBody.replace(/"/g, '\\"');
  const draftFlag = draft ? '--draft' : '';
  const ghCmd = `gh pr create --base "${baseBranch}" --head "${branch}" --title "${escapedTitle}" --body "${escapedBody}" ${draftFlag}`.trim();

  log('Creating PR...');
  const prOutput = await exec$(ghCmd, cwd);

  // gh pr create prints the URL as its last line
  const lines = prOutput.split('\n').filter(Boolean);
  const prUrl = lines[lines.length - 1];
  if (!prUrl?.startsWith('http')) {
    throw new Error(`Could not extract PR URL from gh output:\n${prOutput}`);
  }
  return prUrl;
}

// ── Main command ─────────────────────────────────────────────────────────────

export async function runPrCommand(prompt: string | undefined, options: RunPrOptions) {
  const ui = new EnhancedUI(options.verbose);
  const config = new ConfigManager();
  const cwd = process.cwd();

  ui.header('0.6.3');

  // ── Pre-flight checks ────────────────────────────────────────────────────
  try {
    await assertGitRepo(cwd);
    await assertGhInstalled();
    await assertGhAuth();
  } catch (err: any) {
    ui.error(err.message);
    process.exit(1);
  }

  // ── API key ──────────────────────────────────────────────────────────────
  const apiKey = options.apiKey || config.getApiKey();
  if (!apiKey) {
    ui.error('No API key found!');
    console.log(chalk.white('  Set your API key using one of these methods:\n'));
    console.log(chalk.cyan('    1. xibecode config --set-key YOUR_KEY'));
    console.log(chalk.cyan('    2. export ANTHROPIC_API_KEY=your_key'));
    console.log(chalk.cyan('    3. xibecode run-pr --api-key YOUR_KEY "task"\n'));
    process.exit(1);
  }

  // ── Prompt ───────────────────────────────────────────────────────────────
  let finalPrompt = prompt;
  if (options.file) {
    try {
      finalPrompt = await fs.readFile(options.file, 'utf-8');
      ui.info(`Loaded prompt from: ${options.file}`);
    } catch (err: any) {
      ui.error(`Failed to read file: ${options.file}`);
      process.exit(1);
    }
  }
  if (!finalPrompt) {
    ui.error('No prompt provided!');
    console.log(chalk.white('\n  Usage:\n'));
    console.log(chalk.cyan('    xibecode run-pr "your task"'));
    console.log(chalk.cyan('    xibecode run-pr --file prompt.txt\n'));
    process.exit(1);
  }

  // ── Config ───────────────────────────────────────────────────────────────
  const model = options.model || config.getModel();
  const baseUrl = options.baseUrl || config.getBaseUrl();
  const provider = (options.provider as 'anthropic' | 'openai' | undefined) || config.get('provider');
  const parsedIterations = parseInt(options.maxIterations);
  const maxIterations = parsedIterations > 0 ? parsedIterations : 150;
  const testCommandOverride = config.get('testCommandOverride');

  // Diagnostic — always print resolved config so misconfiguration is obvious
  const maskedKey = apiKey
    ? apiKey.slice(0, 8) + '...' + apiKey.slice(-4)
    : 'NOT SET';
  console.log(chalk.dim('  provider  ') + chalk.cyan(provider ?? 'auto-detect'));
  console.log(chalk.dim('  model     ') + chalk.cyan(model));
  console.log(chalk.dim('  base url  ') + chalk.cyan(baseUrl ?? 'provider default'));
  console.log(chalk.dim('  api key   ') + chalk.cyan(maskedKey));
  console.log('');

  // ── Connect MCP servers ───────────────────────────────────────────────────
  const mcpClientManager = new MCPClientManager();
  const mcpServers = await config.getMCPServers();
  const serverNames = Object.keys(mcpServers);
  if (serverNames.length > 0) {
    ui.info(`Connecting to ${serverNames.length} MCP server(s)...`);
    for (const serverName of serverNames) {
      try {
        await mcpClientManager.connect(serverName, mcpServers[serverName]);
        const tools = mcpClientManager.getAvailableTools().filter(t => t.serverName === serverName);
        ui.info(`  ✓ Connected to ${serverName} (${tools.length} tool(s))`);
      } catch (err: any) {
        ui.warning(`  ✗ Failed to connect to ${serverName}: ${err.message}`);
      }
    }
  }

  // ── Start session display ─────────────────────────────────────────────────
  ui.startSession(finalPrompt, { model, maxIterations, dryRun: false });

  // ── Load plugins + memory + skills ───────────────────────────────────────
  const pluginManager = new PluginManager();
  const pluginPaths = config.get('plugins') || [];
  if (pluginPaths.length > 0) {
    try {
      await pluginManager.loadPlugins(pluginPaths);
    } catch (err: any) {
      ui.warning(`Failed to load some plugins: ${err.message}`);
    }
  }
  const memory = new NeuralMemory();
  await memory.init().catch(() => {});
  const skillManager = new SkillManager(cwd, apiKey, baseUrl, model, provider);
  await skillManager.loadSkills();

  // ── Build tool executor + agent ───────────────────────────────────────────
  const toolExecutor = new CodingToolExecutor(cwd, {
    dryRun: false,
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
      mode: 'agent',
      provider: provider as any,
      customProviderFormat: config.get('customProviderFormat'),
    },
    provider as any
  );
  (agent as any).memory = memory;

  const startTime = Date.now();
  let currentIteration = 0;

  agent.on('event', (event: any) => {
    switch (event.type) {
      case 'iteration':
        currentIteration = event.data.current;
        ui.iteration(event.data.current, event.data.total);
        break;
      case 'thinking':
        ui.thinking(event.data.message);
        break;
      case 'stream_start':
        ui.startAssistantResponse();
        break;
      case 'stream_text':
        ui.streamText(event.data.text);
        break;
      case 'stream_end':
        ui.endAssistantResponse();
        break;
      case 'response':
        ui.response(event.data.text);
        break;
      case 'tool_call':
        ui.toolCall(event.data.name, event.data.input, event.data.index);
        break;
      case 'tool_result':
        ui.toolResult(event.data.name, event.data.result, event.data.success);
        if (event.data.result?.diff) {
          ui.showDiff(event.data.result.diff, event.data.result.path || 'file');
        }
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
    }
  });

  // ── Run the agent ─────────────────────────────────────────────────────────
  try {
    await agent.run(finalPrompt, toolExecutor.getTools(), toolExecutor);

    const stats = agent.getStats();
    const duration = Date.now() - startTime;

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

    // ── Check for actual git changes ─────────────────────────────────────
    const changedFiles = await getChangedFiles(cwd);
    if (changedFiles.length === 0) {
      ui.warning('No git changes detected after the agent run. Skipping branch/PR creation.');
      process.exit(0);
    }

    // ── Run tests / verification ─────────────────────────────────────────
    if (!options.skipTests) {
      const testCmd = testCommandOverride || await detectTestCommand(cwd);
      if (testCmd) {
        console.log(chalk.cyan(`\n  Running verification: ${testCmd}\n`));
        try {
          const { stdout: testOut, stderr: testErr } = await execAsync(testCmd, {
            cwd,
            timeout: 300_000,
          });
          if (options.verbose) {
            if (testOut) console.log(chalk.dim(testOut));
            if (testErr) console.log(chalk.dim(testErr));
          }
          ui.info('Verification passed.');
        } catch (err: any) {
          ui.error(`Verification failed — tests did not pass. Aborting PR creation.\n  ${err.message}`);
          if (options.verbose && err.stdout) console.log(chalk.dim(err.stdout));
          if (options.verbose && err.stderr) console.log(chalk.dim(err.stderr));
          process.exit(1);
        }
      } else {
        ui.info('No test command detected, skipping verification.');
      }
    } else {
      ui.info('Test verification skipped (--skip-tests).');
    }

    // ── Detect base branch ───────────────────────────────────────────────
    const baseBranch = await detectDefaultBase(cwd);
    ui.info(`Base branch: ${baseBranch}`);

    // ── Build branch, commit, PR metadata ────────────────────────────────
    const branch = buildBranchName(finalPrompt, options.branch);
    const prTitle = options.title || buildPrTitle(finalPrompt, stats);
    const prBody = buildPrBody(finalPrompt, stats, changedFiles, duration);
    const commitMessage = prTitle;

    console.log('');
    ui.info(`Creating branch: ${chalk.cyan(branch)}`);
    ui.info(`PR title: ${chalk.white(prTitle)}`);

    // ── Create branch, commit, push, PR ──────────────────────────────────
    const prUrl = await createBranchAndPR({
      cwd,
      branch,
      baseBranch,
      commitMessage,
      prTitle,
      prBody,
      draft: options.draft ?? false,
      verbose: options.verbose,
    });

    // ── Final output ─────────────────────────────────────────────────────
    console.log('');
    console.log(chalk.green('  ✅ Pull Request created successfully!\n'));
    console.log(chalk.white('  PR URL: ') + chalk.cyan(prUrl));
    console.log('');

  } catch (err: any) {
    const duration = Date.now() - startTime;
    ui.failureSummary(err.message, { iterations: currentIteration, duration });
    if (options.verbose) {
      console.log(chalk.red('\n  Stack trace:'));
      console.log(chalk.gray('  ' + err.stack));
      console.log('');
    }
    process.exit(1);
  } finally {
    if (serverNames.length > 0) {
      await mcpClientManager.disconnectAll();
    }
    process.exit(0);
  }
}

// ── Metadata helpers ──────────────────────────────────────────────────────────

/**
 * Detect which test command to run (pnpm test > npm test > none).
 */
async function detectTestCommand(cwd: string): Promise<string | null> {
  try {
    const pkgRaw = await fs.readFile(`${cwd}/package.json`, 'utf-8');
    const pkg = JSON.parse(pkgRaw);
    if (!pkg.scripts?.test) return null;
    // Avoid running commands that just echo "no tests"
    const testScript: string = pkg.scripts.test || '';
    if (testScript.includes('echo') || testScript.includes('exit 0')) return null;
    // Use pnpm if pnpm-lock.yaml exists, else npm
    try {
      await fs.access(`${cwd}/pnpm-lock.yaml`);
      return 'pnpm test';
    } catch {
      return 'npm test';
    }
  } catch {
    return null;
  }
}

function buildPrTitle(prompt: string, stats: { iterations: number; toolCalls: number }): string {
  // Keep it short: first 70 chars of the prompt
  const shortened = prompt.trim().replace(/\s+/g, ' ');
  if (shortened.length <= 70) return shortened;
  return shortened.slice(0, 67) + '...';
}

function buildPrBody(
  prompt: string,
  stats: { iterations: number; toolCalls: number; filesChanged: number },
  changedFiles: string[],
  durationMs: number
): string {
  const seconds = (durationMs / 1000).toFixed(1);
  const fileList = changedFiles.map(f => `- \`${f}\``).join('\n');

  return [
    '## Summary',
    '',
    `> Task: ${prompt.trim()}`,
    '',
    '## Changes',
    '',
    fileList || '_No files detected_',
    '',
    '## Run stats',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Iterations | ${stats.iterations} |`,
    `| Tool calls | ${stats.toolCalls} |`,
    `| Files changed | ${stats.filesChanged} |`,
    `| Duration | ${seconds}s |`,
    '',
    '---',
    '_Generated automatically by [XibeCode](https://github.com/iotserver24/xibecode) `run-pr`_',
  ].join('\n');
}
