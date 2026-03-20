import * as fs from 'fs/promises';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { EnhancedAgent } from '../core/agent.js';
import { CodingToolExecutor } from '../core/tools.js';
import { PluginManager } from '../core/plugins.js';
import { MCPClientManager } from '../core/mcp-client.js';
import { EnhancedUI } from '../ui/enhanced-tui.js';
import { ConfigManager, PROVIDER_CONFIGS } from '../utils/config.js';
import { NeuralMemory } from '../core/memory.js';
import { SessionMemory } from '../core/session-memory.js';
import { pruneContext } from '../core/context-pruner.js';
import { SkillManager } from '../core/skills.js';
import chalk from 'chalk';
import fetch from 'node-fetch';
import Anthropic from '@anthropic-ai/sdk';

const execAsync = promisify(exec);

interface RunPrOptions {
  file?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  provider?: string;
  maxIterations: string;
  verbose: boolean;
  costMode?: string;
  planFirst?: boolean;
  mindsetAdaptive?: boolean;
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

async function spawnCapture(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number = 120_000,
  allowedExitCodes: number[] = [0]
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const combined = (stdout + stderr).trim();
      if (code !== null && code !== undefined && !allowedExitCodes.includes(code)) {
        reject(new Error(`${cmd} exited with code ${code}: ${combined}`));
      } else {
        resolve(combined);
      }
    });
  });
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
  log('Creating PR...');
  const ghArgs = [
    'pr',
    'create',
    '--base',
    baseBranch,
    '--head',
    branch,
    '--title',
    prTitle,
    '--body',
    prBody,
    ...(draft ? ['--draft'] : []),
  ];
  const prOutput = await spawnCapture('gh', ghArgs, cwd, 120_000);

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
  const costMode = (options.costMode || config.getCostMode()) as 'normal' | 'economy';
  const useEconomy = costMode === 'economy';
  const model = options.model || config.getModel(useEconomy);
  const baseUrl = options.baseUrl || config.getBaseUrl();
  const provider = (options.provider as 'anthropic' | 'openai' | undefined) || config.get('provider');
  let parsedIterations = parseInt(options.maxIterations);
  if (parsedIterations <= 0) parsedIterations = 150;
  const maxIterations = useEconomy
    ? Math.min(parsedIterations, config.getEconomyMaxIterations())
    : parsedIterations;
  const testCommandOverride = config.get('testCommandOverride');

  // Diagnostic — always print resolved config so misconfiguration is obvious
  const maskedKey = apiKey
    ? apiKey.slice(0, 8) + '...' + apiKey.slice(-4)
    : 'NOT SET';
  console.log(chalk.dim('  cost mode ') + chalk.cyan(useEconomy ? 'economy' : 'normal'));
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
  const sessionMemory = new SessionMemory(cwd);
  await sessionMemory.loadPreviousLearnings().catch(() => {});

  const maxContextFiles = config.getMaxContextFiles();
  const contextHintFiles = maxContextFiles > 0
    ? await pruneContext(cwd, finalPrompt, { maxFiles: maxContextFiles, usePkgStyleContext: config.getUsePkgStyleContext() }).catch(() => [])
    : [];

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
      planFirst: options.planFirst ?? false,
      mindsetAdaptive: options.mindsetAdaptive ?? false,
      sessionMemory,
      contextHintFiles,
      planningModel: config.getPlanningModel(),
      executionModel: config.getExecutionModel(),
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

  // ── Self-correction loop: run agent, then verify; on test failure retry up to 2 times ──
  const maxSelfCorrectRetries = 2;
  let attempt = 0;
  let testPassed = false;
  let lastTestError = '';
  let verification: {
    skipped: boolean;
    testCommand: string | null;
    passed: boolean;
    durationMs: number;
    summary: string;
    runs: number;
  } = {
    skipped: false,
    testCommand: null,
    passed: false,
    durationMs: 0,
    summary: '',
    runs: 0,
  };
  let stats = { iterations: 0, filesChanged: 0, toolCalls: 0, changedFiles: [] as string[] };
  let currentAgent = agent;

  try {
    while (attempt <= maxSelfCorrectRetries) {
      const isRetry = attempt > 0;
      const prompt = isRetry
        ? `[Self-correction] The previous run's test suite failed. Fix the failures and ensure tests pass.\n\nTest output:\n${lastTestError.slice(0, 2000)}\n\nOriginal task: ${finalPrompt}`
        : finalPrompt;

      if (isRetry) {
        sessionMemory.recordLearning(`Tests failed (attempt ${attempt}): ${lastTestError.slice(0, 200)}`);
        const retryContextHintFiles = maxContextFiles > 0
          ? await pruneContext(cwd, 'fix failing tests ' + finalPrompt, { maxFiles: maxContextFiles, usePkgStyleContext: config.getUsePkgStyleContext() }).catch(() => [])
          : [];
        currentAgent = new EnhancedAgent(
          {
            apiKey,
            baseUrl,
            model,
            maxIterations,
            verbose: options.verbose,
            mode: 'agent',
            provider: provider as any,
            customProviderFormat: config.get('customProviderFormat'),
            planFirst: false,
            mindsetAdaptive: options.mindsetAdaptive ?? false,
            sessionMemory,
            contextHintFiles: retryContextHintFiles,
            planningModel: config.getPlanningModel(),
            executionModel: config.getExecutionModel(),
          },
          provider as any
        );
        (currentAgent as any).memory = memory;
        ui.warning(`Self-correction retry ${attempt}/${maxSelfCorrectRetries} — re-running agent with test failure context.`);
      }

      await currentAgent.run(prompt, toolExecutor.getTools(), toolExecutor);
      await sessionMemory.persist();

      stats = currentAgent.getStats();
      const duration = Date.now() - startTime;

      ui.completionSummary({
        iterations: stats.iterations,
        duration,
        filesChanged: stats.filesChanged,
        toolCalls: stats.toolCalls,
      });

      if (stats.changedFiles.length > 0) {
        console.log(chalk.white('  📝 Files modified:\n'));
        stats.changedFiles.forEach((file: string) => {
          console.log(chalk.gray('    • ') + chalk.white(file));
        });
        console.log('');
      }

      // ── Check for actual git changes ─────────────────────────────────────
      const changedFiles = await getChangedFiles(cwd);
      if (changedFiles.length === 0 && !isRetry) {
        ui.warning('No git changes detected after the agent run. Skipping branch/PR creation.');
        process.exit(0);
      }
      if (changedFiles.length === 0 && isRetry) {
        ui.warning('No git changes on retry. Aborting.');
        process.exit(1);
      }

      // ── Run tests / verification ─────────────────────────────────────────
      if (options.skipTests) {
        testPassed = true;
        verification.skipped = true;
        verification.passed = true;
        break;
      }
      const testCmd = testCommandOverride || await detectTestCommand(cwd);
      if (!testCmd) {
        ui.info('No test command detected, skipping verification.');
        testPassed = true;
        verification.skipped = true;
        verification.passed = true;
        break;
      }
      verification.testCommand = testCmd;
      verification.runs++;
      console.log(chalk.cyan(`\n  Running verification: ${testCmd}\n`));
      try {
        const verificationStart = Date.now();
        const { stdout: testOut, stderr: testErr } = await execAsync(testCmd, {
          cwd,
          timeout: 300_000,
        });
        const verificationDurationMs = Date.now() - verificationStart;
        if (options.verbose) {
          if (testOut) console.log(chalk.dim(testOut));
          if (testErr) console.log(chalk.dim(testErr));
        }
        ui.info('Verification passed.');
        testPassed = true;
        verification.passed = true;
        verification.durationMs = verificationDurationMs;
        verification.summary = 'Tests passed.';
        break;
      } catch (err: any) {
        lastTestError = [err.stdout, err.stderr].filter(Boolean).join('\n') || err.message;
        const errFirstLine = String(lastTestError).split('\n').find(Boolean) || lastTestError;
        verification.passed = false;
        verification.summary = `Tests failed: ${errFirstLine.slice(0, 240)}`;
        if (options.verbose && err.stdout) console.log(chalk.dim(err.stdout));
        if (options.verbose && err.stderr) console.log(chalk.dim(err.stderr));
        attempt++;
        if (attempt > maxSelfCorrectRetries) {
          ui.error(`Verification failed after ${maxSelfCorrectRetries} retry(ies). Aborting PR creation.\n  ${err.message}`);
          process.exit(1);
        }
        ui.warning(`Verification failed. Starting self-correction retry ${attempt}/${maxSelfCorrectRetries}...`);
      }
    }

    const changedFiles = await getChangedFiles(cwd);
    const duration = Date.now() - startTime;

    const baseBranch = await detectDefaultBase(cwd);
    ui.info(`Base branch: ${baseBranch}`);

    // Diff + per-file rationale (optional in economy mode)
    const diffByFile = await getDiffForChangedFiles(cwd, baseBranch, changedFiles, useEconomy).catch(() => ({} as Record<string, string>));
    const changesRationaleMarkdown = await explainDiffsWithModel({
      prompt: finalPrompt,
      diffByFile,
      fileOrder: changedFiles,
      cwd,
      apiKey,
      baseUrl,
      provider: provider as any,
      model,
      useEconomy,
      baseBranch,
    }).catch(() => '');

    // ── Build branch, commit, PR metadata ────────────────────────────────
    const branch = buildBranchName(finalPrompt, options.branch);
    const prTitle = options.title || buildPrTitle(finalPrompt, stats);
    const selfCorrectionRetriesUsed = options.skipTests ? 0 : attempt;
    const prBody = buildPrBody(finalPrompt, stats, changedFiles, duration, {
      verification,
      selfCorrectionRetriesUsed,
      maxSelfCorrectRetries,
      changesRationaleMarkdown,
    });
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
  stats: any,
  changedFiles: string[],
  durationMs: number,
  opts: {
    verification: {
      skipped: boolean;
      testCommand: string | null;
      passed: boolean;
      durationMs: number;
      summary: string;
      runs: number;
    };
    selfCorrectionRetriesUsed: number;
    maxSelfCorrectRetries: number;
    changesRationaleMarkdown: string;
  }
): string {
  const seconds = (durationMs / 1000).toFixed(1);
  const fileList = changedFiles.map(f => `- \`${f}\``).join('\n');

  const inputTokens = stats?.inputTokens;
  const outputTokens = stats?.outputTokens;
  const totalTokens = stats?.totalTokens;
  const costLabel = stats?.costLabel;

  const verificationLines = [
    `- Skipped: ${opts.verification.skipped ? 'yes' : 'no'}`,
    `- Test command: \`${opts.verification.testCommand ?? 'none'}\``,
    `- Result: ${opts.verification.passed ? '✅ Passed' : '❌ Failed'}`,
    `- Duration: ${opts.verification.durationMs ? `${(opts.verification.durationMs / 1000).toFixed(1)}s` : 'n/a'}`,
    `- Runs: ${opts.verification.runs}`,
  ];

  const selfCorrectionLines = [
    `- Retries used: ${opts.selfCorrectionRetriesUsed}/${opts.maxSelfCorrectRetries}`,
    opts.verification.summary ? `- Last verification summary: ${opts.verification.summary}` : '',
  ].filter(Boolean);

  const rationale = opts.changesRationaleMarkdown?.trim()
    ? opts.changesRationaleMarkdown.trim()
    : `- ${changedFiles.length ? 'Updated files:' : 'No files changed.'}\n${fileList || ''}`;

  return [
    '## Summary',
    '',
    `> Task: ${prompt.trim()}`,
    '',
    '## Changes (rationale)',
    '',
    rationale,
    '',
    '## Run stats',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Iterations | ${stats?.iterations ?? 0} |`,
    `| Tool calls | ${stats?.toolCalls ?? 0} |`,
    `| Files changed | ${stats?.filesChanged ?? stats?.changedFiles?.length ?? 0} |`,
    `| Duration | ${seconds}s |`,
    `| Input tokens | ${inputTokens ?? 'n/a'} |`,
    `| Output tokens | ${outputTokens ?? 'n/a'} |`,
    `| Total tokens | ${totalTokens ?? 'n/a'} |`,
    `| Cost | ${costLabel ?? 'n/a'} |`,
    '',
    '## Verification',
    '',
    ...verificationLines,
    '',
    '## Self-correction',
    '',
    ...selfCorrectionLines,
    '',
    '---',
    '_Generated automatically by [XibeCode](https://github.com/iotserver24/xibecode) `run-pr`_',
  ].join('\n');
}

function redactSecrets(input: string): string {
  if (!input) return input;

  // Mask API keys/tokens; this is best-effort and intended to prevent obvious leakage.
  return input
    // Anthropic/OpenAI/others style keys
    .replace(/\b(sk-[A-Za-z0-9]{8,})\b/g, '[REDACTED_API_KEY]')
    .replace(/\b(AAIza|AIza)\w{10,}\b/g, '[REDACTED_GOOGLE_KEY]')
    // Common env var formats
    .replace(/\b(OPENAI_API_KEY|ANTHROPIC_API_KEY|OPENROUTER_API_KEY|GH_TOKEN|XIBECODE_API_KEY)\s*=\s*['"]?[^'"\n\r]+['"]?/gi, '$1=[REDACTED]')
    // Bearer tokens
    .replace(/\bBearer\s+[A-Za-z0-9\-_\.]{20,}\b/g, 'Bearer [REDACTED]')
    // Private key blocks
    .replace(/-----BEGIN [A-Z0-9 _-]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 _-]*PRIVATE KEY-----/g, '[REDACTED_PEM]')
    // Long hex / hashes
    .replace(/\b[0-9a-f]{32,}\b/gi, '[REDACTED_HEX]');
}

async function getDiffForChangedFiles(
  cwd: string,
  baseBranch: string,
  changedFiles: string[],
  useEconomy: boolean
): Promise<Record<string, string>> {
  const perFileMaxChars = useEconomy ? 1800 : 3500;
  const totalMaxChars = useEconomy ? 18_000 : 45_000;

  const diffFiles = changedFiles.slice(0, 200);
  if (diffFiles.length === 0) return {};

  const args = [
    'diff',
    '-U3',
    '--no-color',
    `origin/${baseBranch}...HEAD`,
    '--',
    ...diffFiles,
  ];

  const diffText = await spawnCapture('git', args, cwd, 60_000, [0, 1]).catch(() => '');
  if (!diffText) {
    return Object.fromEntries(diffFiles.map((f) => [f, '']));
  }

  const diffByFile: Record<string, string> = {};
  const parts = diffText.split(/^diff --git /m);

  for (const part of parts) {
    // Skip preamble (before first "diff --git")
    if (!part.trim()) continue;

    const headerMatch = part.match(/^a\/(.+?) b\/(.+?)\n/);
    if (!headerMatch) continue;

    const filePath = headerMatch[2];
    const fullBlock = `diff --git ${part}`.trim();
    const excerpt = fullBlock.slice(0, perFileMaxChars);

    diffByFile[filePath] = excerpt;
  }

  // Ensure all changed files exist in the map (use empty string when no diff block found).
  const ordered: Record<string, string> = {};
  let totalChars = 0;
  for (const f of diffFiles) {
    const excerpt = diffByFile[f] ?? '';
    if (excerpt && totalChars < totalMaxChars) {
      const remaining = totalMaxChars - totalChars;
      const clipped = excerpt.slice(0, remaining);
      ordered[f] = clipped;
      totalChars += clipped.length;
    } else {
      ordered[f] = '';
    }
  }

  return ordered;
}

async function getNumstatForChangedFiles(
  cwd: string,
  baseBranch: string,
  changedFiles: string[],
  useEconomy: boolean
): Promise<Record<string, { ins: number | null; del: number | null }>> {
  const diffFiles = changedFiles.slice(0, useEconomy ? 120 : 260);
  if (diffFiles.length === 0) return {};

  const args = [
    'diff',
    '--numstat',
    `origin/${baseBranch}...HEAD`,
    '--',
    ...diffFiles,
  ];

  const out = await spawnCapture('git', args, cwd, 60_000, [0, 1]).catch(() => '');
  const result: Record<string, { ins: number | null; del: number | null }> = {};
  for (const line of out.split('\n').filter(Boolean)) {
    const cols = line.split('\t');
    if (cols.length < 3) continue;
    const insRaw = cols[0];
    const delRaw = cols[1];
    const file = cols.slice(2).join('\t').trim();
    const ins = insRaw === '-' ? null : Number(insRaw);
    const del = delRaw === '-' ? null : Number(delRaw);
    if (file) result[file] = { ins, del };
  }
  return result;
}

async function explainDiffsWithModel(opts: {
  prompt: string;
  diffByFile: Record<string, string>;
  fileOrder: string[];
  cwd: string;
  apiKey: string;
  baseUrl: string | undefined;
  provider: string;
  model: string;
  useEconomy: boolean;
  baseBranch: string;
}): Promise<string> {
  const {
    prompt,
    diffByFile,
    fileOrder,
    cwd,
    apiKey,
    baseUrl,
    provider,
    model,
    useEconomy,
    baseBranch,
  } = opts;

  const providerKey = provider as keyof typeof PROVIDER_CONFIGS;
  const format = PROVIDER_CONFIGS[providerKey]?.format ?? 'openai';
  if (!baseUrl) throw new Error('Missing baseUrl for LLM explainer.');

  const maxFilesForLLM = useEconomy ? 6 : 10;
  const maxTokens = useEconomy ? 650 : 1150;
  const maxFilesForBudgetFallback = maxFilesForLLM;

  const entries = fileOrder
    .map((f) => ({ file: f, diff: diffByFile[f] ?? '' }))
    .filter((e) => e.diff && e.diff.trim().length > 0);

  if (entries.length === 0) return '';

  // If too many files, fall back to numstat counts to keep PR generation cheap.
  if (entries.length > maxFilesForBudgetFallback) {
    const numstats = await getNumstatForChangedFiles(cwd, baseBranch, fileOrder, useEconomy).catch(
      () => ({} as Record<string, { ins: number | null; del: number | null }>),
    );
    const limited = fileOrder.slice(0, useEconomy ? 120 : 260);
    const lines = limited.map((f) => {
      const s = numstats[f];
      if (!s) return `- \`${f}\``;
      const ins = s.ins === null ? 'n/a' : s.ins;
      const del = s.del === null ? 'n/a' : s.del;
      return `- \`${f}\`: +${ins} -${del}`;
    });
    return [
      `> Rationale omitted (too many files to summarize in ${useEconomy ? 'economy' : 'normal'} mode).`,
      ...lines,
    ].join('\n');
  }

  // Build prompt budget by total excerpt size.
  const totalExcerptChars = entries.reduce((acc, e) => acc + e.diff.length, 0);
  const maxExcerptChars = useEconomy ? 18_000 : 40_000;
  if (totalExcerptChars > maxExcerptChars) {
    const numstats = await getNumstatForChangedFiles(cwd, baseBranch, fileOrder, useEconomy).catch(
      () => ({} as Record<string, { ins: number | null; del: number | null }>),
    );
    const limited = fileOrder.slice(0, useEconomy ? 120 : 260);
    const lines = limited.map((f) => {
      const s = numstats[f];
      if (!s) return `- \`${f}\``;
      const ins = s.ins === null ? 'n/a' : s.ins;
      const del = s.del === null ? 'n/a' : s.del;
      return `- \`${f}\`: +${ins} -${del}`;
    });
    return [
      `> Rationale omitted (diff budget exceeded in ${useEconomy ? 'economy' : 'normal'} mode).`,
      ...lines,
    ].join('\n');
  }

  const redactedFilesText = entries
    .slice(0, maxFilesForLLM)
    .map((e) => {
      const redacted = redactSecrets(e.diff);
      return `File: \`${e.file}\`\n\`\`\`\n${redacted}\n\`\`\``;
    })
    .join('\n\n');

  const systemPrompt =
    'You write PR descriptions. Produce concise per-file rationale based strictly on the diff excerpts. Avoid speculation. Do not include secrets.';
  const userPrompt = [
    `Task: ${prompt.trim()}`,
    '',
    'Diff excerpts (redacted):',
    redactedFilesText,
    '',
    'Write markdown with this format:',
    '- For each file: start with a heading `### path/to/file`',
    '- Under it: 2-4 bullets:',
    '  - What changed (grounded in the excerpt)',
    '  - Why it was needed for the task',
    '  - Any risk/verification notes if evident',
  ].join('\n');

  if (format === 'anthropic') {
    const client = new Anthropic({ apiKey, baseURL: baseUrl });
    const message = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = message.content as any[];
    const text = Array.isArray(content)
      ? content.map((b) => (b?.type === 'text' ? b.text : '')).join('')
      : String((message as any)?.content ?? '');
    return text.trim();
  }

  // OpenAI-compatible path
  const endpoint = baseUrl.endsWith('/v1')
    ? `${baseUrl}/chat/completions`
    : `${baseUrl}/chat/completions`;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`LLM explainer failed: HTTP ${resp.status} ${resp.statusText}. ${t}`.trim());
  }

  const data: any = await resp.json();
  const text = data?.choices?.[0]?.message?.content ?? '';
  return String(text).trim();
}
