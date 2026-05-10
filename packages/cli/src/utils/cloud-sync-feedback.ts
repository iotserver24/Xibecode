import chalk from 'chalk';
import ora from 'ora';

/** Short tips while uploading the workspace to E2B (sandbox_full). */
export const CLOUD_SYNC_FACTS: string[] = [
  // XibeCode product
  'XibeCode is an autonomous coding CLI: chat, run tasks, and run-pr with tests and PR flow.',
  'Source and issues: https://github.com/iotserver24/xibecode — npm package name is `xibecode`.',
  'The stack is a pnpm monorepo: xibecode-core (agent + tools), xibecode CLI (Ink UI), desktop and VS Code ext.',
  'Use `xc` as a short alias for `xibecode`; `xc` / `xibecode` with no args opens local chat; `xc cloud` uses E2B.',
  // Sessions & files
  'Sessions for this project folder live under ~/.xibecode/sessions/ — resume with `xibecode resume`.',
  'File undo checkpoints use ~/.xibecode/file-history/; set XIBECODE_DISABLE_FILE_CHECKPOINTING=1 to turn that off.',
  // Sandbox & cloud
  'With sandbox_full, your repo is packed and uploaded to the team gateway, then extracted in the VM workspace.',
  'Set gateway URL with xibecode config --set-sandbox-gateway-url or XIBECODE_SANDBOX_GATEWAY_URL.',
  'Session strategy host_only runs shell in E2B but keeps file tools on your machine; sandbox_full syncs the tree.',
  'Sandbox tarball can honor .gitignore via config or XIBECODE_SANDBOX_SYNC_RESPECT_GITIGNORE.',
  // Config & providers
  'Multiple API keys and base URLs are supported — see `xibecode config` and provider-specific env vars.',
  'Profiles let you switch keys and models: use --profile <name> across chat, run, and run-pr.',
  // Features
  'Agent modes (agent, plan, review, and more) control which tool categories are allowed.',
  'Wire MCP servers in config so the agent can call your external tools alongside built-in ones.',
  '`xibecode skills` manages skills; built-ins ship with the CLI and extend the system prompt.',
  'Hooks and auto-memory integrate with ~/.xibecode — see hooks and memory commands.',
  '`xibecode diagnostics` builds a redacted Markdown bundle useful for debugging setup.',
  '`xibecode run` supports --plan-first and --mindset-adaptive for planner- and reasoning-style runs.',
  '`xibecode run-pr` runs tests (unless --skip-tests), retries up to twice, and runs pnpm audit at high severity.',
];

export function pickRandomCloudSyncFact(): string {
  if (CLOUD_SYNC_FACTS.length === 0) return '';
  const i = Math.floor(Math.random() * CLOUD_SYNC_FACTS.length);
  return CLOUD_SYNC_FACTS[i] ?? '';
}

/** Visible width for tip text so ora stays on one line (avoid multiline — often only the first line shows). */
function maxTipChars(): number {
  const cols = process.stdout.columns;
  if (!cols || cols < 56) return 34;
  return Math.min(96, Math.max(40, cols - 38));
}

function clipTip(raw: string): string {
  const t = raw.trim();
  const max = maxTipChars();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function spinnerLine(base: string, fact: string): string {
  const tip = clipTip(fact);
  return `${base}…  ${chalk.cyan('XibeCode')}${chalk.dim(` — ${tip}`)}`;
}

/** Spinner + rotating tips while the workspace tarball is built and uploaded. */
export async function withCloudWorkspaceSyncSpinner<T>(run: () => Promise<T>): Promise<T> {
  const base = 'Syncing workspace to cloud sandbox';
  const spinner = ora({
    text: spinnerLine(base, pickRandomCloudSyncFact()),
    spinner: 'dots',
  }).start();

  const interval = setInterval(() => {
    spinner.text = spinnerLine(base, pickRandomCloudSyncFact());
  }, 3200);

  try {
    const result = await run();
    spinner.succeed(chalk.green('Workspace synced to cloud sandbox'));
    return result;
  } catch (err) {
    spinner.fail(chalk.red('Workspace sync failed'));
    throw err;
  } finally {
    clearInterval(interval);
  }
}
