/**
 * Interactive setup wizard.
 *
 * Sections:
 *   setup              full wizard
 *   setup model        API key / provider / model
 *   setup gateway      24/7 messaging (Telegram first; Discord/Slack optional)
 *   setup agent        workdir defaults, iterations, cost mode
 *   setup --quick      model + Telegram only
 */

import { createRequire } from 'module';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { ConfigManager, PROVIDER_CONFIGS, listSetupProviders } from '../utils/config.js';
import { installSystemdUserService } from '../gateway/runner.js';
import { primarySecretEnvPath } from '../utils/xibecode-home.js';

const pkg = createRequire(import.meta.url)('../../package.json');

export interface SetupOptions {
  profile?: string;
  quick?: boolean;
  nonInteractive?: boolean;
  reset?: boolean;
  /** Section name when using: xibecode setup model|gateway|agent */
  section?: string;
}

type SectionKey = 'model' | 'gateway' | 'agent';

const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: 'model', label: 'Model & Provider' },
  { key: 'gateway', label: 'Xibe Daemon 24/7 (Telegram / Discord / Slack)' },
  { key: 'agent', label: 'Agent defaults' },
];

function isInteractive(): boolean {
  return (
    Boolean(process.stdin.isTTY) &&
    Boolean(process.stdout.isTTY) &&
    !process.env.CI &&
    process.env.XIBECODE_NONINTERACTIVE !== '1' &&
    process.env.TERM !== 'dumb'
  );
}

function printBanner(subtitle?: string): void {
  console.log('');
  console.log(chalk.magenta('┌─────────────────────────────────────────────────────────┐'));
  console.log(
    chalk.magenta(
      subtitle
        ? `│     XibeCode Setup — ${subtitle.padEnd(34).slice(0, 34)} │`
        : '│             XibeCode Setup Wizard                       │',
    ),
  );
  console.log(chalk.magenta('└─────────────────────────────────────────────────────────┘'));
  console.log('');
}

function printNonInteractiveGuidance(reason?: string): void {
  printBanner('Non-interactive');
  if (reason) console.log(chalk.yellow(reason));
  console.log(chalk.dim('Interactive wizard needs a TTY. Use flags instead:\n'));
  console.log(chalk.cyan('  xibecode config --set-key YOUR_API_KEY'));
  console.log(chalk.cyan('  xibecode config --set-provider anthropic'));
  console.log(chalk.cyan('  xibecode config --set-model claude-sonnet-4-5-20250929'));
  console.log(chalk.cyan('  xibecode config --show'));
  console.log('');
  console.log(chalk.white(`Telegram 24/7 (edit ~/.xibecode/daemon.env or gateway.env):`));
  console.log(chalk.dim('  TELEGRAM_BOT_TOKEN=...'));
  console.log(chalk.dim('  TELEGRAM_ALLOWED_USERS=your_user_id'));
  console.log(chalk.dim('  ANTHROPIC_API_KEY=...   # if not in profile'));
  console.log('');
  console.log(chalk.cyan('  xibecode daemon --install --workdir /path/to/repo'));
  console.log(chalk.cyan('  systemctl --user enable --now xibecode-gateway'));
  console.log('');
  console.log(chalk.dim("Run 'xibecode setup' in an interactive terminal for the full wizard."));
  console.log('');
}

function gatewayEnvPath(): string {
  return primarySecretEnvPath();
}

async function readGatewayEnv(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(gatewayEnvPath(), 'utf-8');
    const out: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

async function writeGatewayEnv(patch: Record<string, string | undefined>): Promise<void> {
  const existing = await readGatewayEnv();
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === '') delete existing[k];
    else existing[k] = v;
  }
  const preferredOrder = [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'OPENROUTER_API_KEY',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_ALLOWED_USERS',
    'TELEGRAM_HOME_CHANNEL',
    'DISCORD_BOT_TOKEN',
    'DISCORD_ALLOWED_USERS',
    'SLACK_BOT_TOKEN',
    'SLACK_APP_TOKEN',
    'SLACK_ALLOWED_USERS',
    'XIBECODE_GATEWAY_WORKDIR',
    'XIBECODE_FALLBACK_PROVIDERS',
    'GATEWAY_ALLOW_ALL_USERS',
  ];
  const keys = [
    ...preferredOrder.filter((k) => k in existing),
    ...Object.keys(existing).filter((k) => !preferredOrder.includes(k)).sort(),
  ];
  const body =
    `# XibeCode gateway env — managed by \`xibecode setup\`\n` +
    `# Loaded by systemd unit (EnvironmentFile) and optional shell source.\n\n` +
    keys.map((k) => `${k}=${existing[k]}`).join('\n') +
    '\n';
  const dir = path.dirname(gatewayEnvPath());
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(gatewayEnvPath(), body, { mode: 0o600 });
  try {
    await fs.chmod(gatewayEnvPath(), 0o600);
  } catch {
    /* windows */
  }
}

function mask(s?: string): string {
  if (!s) return chalk.dim('(not set)');
  if (s.length <= 8) return '••••';
  return s.slice(0, 4) + '…' + s.slice(-4);
}

/**
 * Plain numbered menu — no inquirer list/rawlist (broken as "??" in some terminals).
 * Prints options, then asks for a number via simple text input.
 */
async function askNumbered<T extends string>(
  title: string,
  choices: Array<{ name: string; value: T }>,
  defaultValue?: T,
): Promise<T> {
  console.log(chalk.white(title));
  console.log('');
  const defaultIdx = defaultValue
    ? Math.max(
        0,
        choices.findIndex((c) => c.value === defaultValue),
      )
    : 0;
  choices.forEach((c, i) => {
    const mark = i === defaultIdx ? chalk.green(` ${i + 1})`) : chalk.cyan(` ${i + 1})`);
    console.log(`${mark} ${c.name}${i === defaultIdx ? chalk.dim('  [default]') : ''}`);
  });
  console.log('');

  const { n } = await inquirer.prompt([
    {
      type: 'input',
      name: 'n',
      message: `Enter number 1-${choices.length}`,
      default: String(defaultIdx + 1),
      validate: (v: string) => {
        const num = Number(String(v).trim());
        if (!Number.isInteger(num) || num < 1 || num > choices.length) {
          return `Type a number from 1 to ${choices.length}`;
        }
        return true;
      },
    },
  ]);
  const idx = Number(String(n).trim()) - 1;
  return choices[idx]!.value;
}

async function askYesNo(message: string, defaultYes = false): Promise<boolean> {
  const def = defaultYes ? 'Y/n' : 'y/N';
  const { a } = await inquirer.prompt([
    {
      type: 'input',
      name: 'a',
      message: `${message} (${def})`,
      default: defaultYes ? 'y' : 'n',
    },
  ]);
  const v = String(a || '')
    .trim()
    .toLowerCase();
  if (!v) return defaultYes;
  return v === 'y' || v === 'yes' || v === '1';
}

async function setupModel(config: ConfigManager): Promise<void> {
  console.log(chalk.bold.white('\n═══ Model & Provider ═══\n'));
  console.log(
    chalk.dim(
      'XibeCode provider catalog (including zenllm.org and routing.run).\n' +
        'Type the number of your choice (options are printed below).\n',
    ),
  );

  const setupList = listSetupProviders();
  const providers: Array<{ name: string; value: string }> = [
    ...setupList.map((p) => ({
      name: p.description ? `${p.name} — ${p.description}` : p.name,
      value: p.id,
    })),
    { name: 'Custom / auto-detect (paste base URL later)', value: 'auto' },
  ];

  const currentProvider = (config.get('provider') as string) || 'auto';
  const defaultProv = providers.some((p) => p.value === currentProvider)
    ? currentProvider
    : 'routingrun';
  const provider = await askNumbered(
    'Choose your LLM provider:',
    providers,
    defaultProv,
  );

  if (provider === 'auto') {
    config.delete('provider');
  } else {
    config.set('provider', provider as any);
    const picked = setupList.find((p) => p.id === provider);
    if (picked?.baseUrl) {
      config.set('baseUrl', picked.baseUrl);
    }
    if (picked?.format) {
      config.set('requestFormat', picked.format as any);
    }
  }
  console.log(chalk.dim(`  → provider: ${provider}\n`));

  const pcfg =
    provider !== 'auto'
      ? PROVIDER_CONFIGS[provider as keyof typeof PROVIDER_CONFIGS]
      : undefined;
  const hint = pcfg?.apiKeyUrl ? `Get a key: ${pcfg.apiKeyUrl}` : 'Paste your API key';

  const existingKey = config.getApiKey();
  let enterNew = true;
  if (existingKey) {
    const action = await askNumbered<'keep' | 'new'>(
      `API key currently ${mask(existingKey)}:`,
      [
        { name: 'Keep current key', value: 'keep' },
        { name: 'Enter a new key', value: 'new' },
      ],
      'keep',
    );
    enterNew = action === 'new';
  }

  if (enterNew) {
    console.log(chalk.dim(`  ${hint}\n`));
    const { apiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'API key',
        mask: '*',
        validate: (v: string) => (v.trim() ? true : 'Key is required'),
      },
    ]);
    config.set('apiKey', apiKey.trim());
  }

  const defaultModel =
    config.get('model') ||
    pcfg?.defaultModel ||
    'claude-sonnet-4-5-20250929';

  // Offer common models as numbered shortcuts when we know the provider
  const modelPresets: Array<{ name: string; value: string }> = [];
  if (provider === 'anthropic') {
    modelPresets.push(
      { name: 'claude-sonnet-4-5-20250929 (recommended)', value: 'claude-sonnet-4-5-20250929' },
      { name: 'claude-opus-4-5-20251101', value: 'claude-opus-4-5-20251101' },
      { name: 'claude-haiku-4-5-20251015', value: 'claude-haiku-4-5-20251015' },
      { name: 'Type a custom model id…', value: '__custom__' },
    );
  } else if (provider === 'openai') {
    modelPresets.push(
      { name: 'gpt-4o', value: 'gpt-4o' },
      { name: 'gpt-4o-mini', value: 'gpt-4o-mini' },
      { name: 'o3-mini', value: 'o3-mini' },
      { name: 'Type a custom model id…', value: '__custom__' },
    );
  } else if (provider === 'openrouter') {
    modelPresets.push(
      { name: 'anthropic/claude-sonnet-4', value: 'anthropic/claude-sonnet-4' },
      { name: 'openai/gpt-4o', value: 'openai/gpt-4o' },
      { name: 'google/gemini-2.5-pro', value: 'google/gemini-2.5-pro' },
      { name: 'Type a custom model id…', value: '__custom__' },
    );
  } else if (pcfg?.defaultModel) {
    modelPresets.push(
      { name: `${pcfg.defaultModel} (default)`, value: pcfg.defaultModel },
      { name: 'Type a custom model id…', value: '__custom__' },
    );
  }

  let model = defaultModel;
  if (modelPresets.length) {
    const picked = await askNumbered(
      'Choose default model:',
      modelPresets,
      modelPresets.some((m) => m.value === defaultModel) ? defaultModel : modelPresets[0]!.value,
    );
    if (picked === '__custom__') {
      const ans = await inquirer.prompt([
        {
          type: 'input',
          name: 'model',
          message: 'Model id',
          default: defaultModel,
        },
      ]);
      model = ans.model?.trim() || defaultModel;
    } else {
      model = picked;
    }
  } else {
    const ans = await inquirer.prompt([
      {
        type: 'input',
        name: 'model',
        message: 'Default model id',
        default: defaultModel,
      },
    ]);
    model = ans.model?.trim() || defaultModel;
  }
  config.set('model', model);
  console.log(chalk.dim(`  → model: ${model}\n`));

  if (await askYesNo('Set a custom base URL? (proxies / OpenAI-compatible)', Boolean(config.get('baseUrl')))) {
    const { baseUrl } = await inquirer.prompt([
      {
        type: 'input',
        name: 'baseUrl',
        message: 'Base URL (https://...)',
        default: config.get('baseUrl') || config.getBaseUrl() || '',
        validate: (v: string) =>
          !v || v.startsWith('http') ? true : 'Must start with http:// or https://',
      },
    ]);
    if (baseUrl?.trim()) config.set('baseUrl', baseUrl.trim());
    else config.delete('baseUrl');
  }

  // Mirror key into gateway.env for systemd service
  const key = config.getApiKey();
  if (key) {
    const envPatch: Record<string, string> = {};
    if (pcfg?.envKey) envPatch[pcfg.envKey] = key;
    // Keep ANTHROPIC_API_KEY as a common fallback many gateway samples use
    if (!envPatch.ANTHROPIC_API_KEY && provider === 'anthropic') {
      envPatch.ANTHROPIC_API_KEY = key;
    }
    envPatch.XIBECODE_API_KEY = key;
    await writeGatewayEnv(envPatch);
  }

  // Azure Foundry needs a user endpoint
  if (provider === 'azure-foundry' && !config.get('baseUrl')) {
    const { baseUrl } = await inquirer.prompt([
      {
        type: 'input',
        name: 'baseUrl',
        message: 'Azure Foundry base URL (https://…)',
        validate: (v: string) =>
          v.trim().startsWith('http') ? true : 'Must start with http:// or https://',
      },
    ]);
    if (baseUrl?.trim()) config.set('baseUrl', baseUrl.trim());
  }

  console.log(chalk.green('\n✓ Model configuration saved.\n'));
}

async function setupGateway(config: ConfigManager): Promise<void> {
  console.log(chalk.bold.white('2) Xibe Daemon — 24/7 messaging\n'));
  console.log(
    chalk.dim(
      'Talk to XibeCode from Telegram while it codes on this machine.\n' +
        'Create a bot via @BotFather → copy token. Get your user id via @userinfobot.\n',
    ),
  );

  const env = await readGatewayEnv();

  const setupTg = await askYesNo('Configure Telegram for 24/7 chat?', true);

  if (setupTg) {
    const { botToken } = await inquirer.prompt([
      {
        type: 'password',
        name: 'botToken',
        message: 'TELEGRAM_BOT_TOKEN',
        mask: '*',
        default: env.TELEGRAM_BOT_TOKEN || '',
      },
    ]);
    const { allowedUsers } = await inquirer.prompt([
      {
        type: 'input',
        name: 'allowedUsers',
        message: 'TELEGRAM_ALLOWED_USERS (your numeric id; comma-separated ok)',
        default: env.TELEGRAM_ALLOWED_USERS || '',
        validate: (v: string) =>
          v.trim() || process.env.GATEWAY_ALLOW_ALL_USERS === 'true'
            ? true
            : 'User id required (or set GATEWAY_ALLOW_ALL_USERS later)',
      },
    ]);
    await writeGatewayEnv({
      TELEGRAM_BOT_TOKEN: botToken?.trim() || undefined,
      TELEGRAM_ALLOWED_USERS: allowedUsers?.trim() || undefined,
    });
    if (botToken?.trim()) {
      config.set('telegramBotToken', botToken.trim());
    }
    console.log(chalk.green(`✓ Telegram written to ${gatewayEnvPath()}\n`));
  }

  const morePlatforms = await askYesNo('Also configure Discord and/or Slack?', false);

  if (morePlatforms) {
    const setupDc = await askYesNo('Configure Discord?', false);
    if (setupDc) {
      const answers = await inquirer.prompt([
        {
          type: 'password',
          name: 'token',
          message: 'DISCORD_BOT_TOKEN',
          mask: '*',
          default: env.DISCORD_BOT_TOKEN || '',
        },
        {
          type: 'input',
          name: 'users',
          message: 'DISCORD_ALLOWED_USERS',
          default: env.DISCORD_ALLOWED_USERS || '',
        },
      ]);
      await writeGatewayEnv({
        DISCORD_BOT_TOKEN: answers.token?.trim() || undefined,
        DISCORD_ALLOWED_USERS: answers.users?.trim() || undefined,
      });
    }

    const setupSl = await askYesNo('Configure Slack (Socket Mode)?', false);
    if (setupSl) {
      const answers = await inquirer.prompt([
        {
          type: 'password',
          name: 'bot',
          message: 'SLACK_BOT_TOKEN (xoxb-...)',
          mask: '*',
          default: env.SLACK_BOT_TOKEN || '',
        },
        {
          type: 'password',
          name: 'app',
          message: 'SLACK_APP_TOKEN (xapp-...)',
          mask: '*',
          default: env.SLACK_APP_TOKEN || '',
        },
        {
          type: 'input',
          name: 'users',
          message: 'SLACK_ALLOWED_USERS',
          default: env.SLACK_ALLOWED_USERS || '',
        },
      ]);
      await writeGatewayEnv({
        SLACK_BOT_TOKEN: answers.bot?.trim() || undefined,
        SLACK_APP_TOKEN: answers.app?.trim() || undefined,
        SLACK_ALLOWED_USERS: answers.users?.trim() || undefined,
      });
    }
  }

  const defaultWd =
    env.XIBECODE_GATEWAY_WORKDIR ||
    config.get('gatewayWorkdir') ||
    process.cwd();

  const { workdir } = await inquirer.prompt([
    {
      type: 'input',
      name: 'workdir',
      message: 'Default project workdir for gateway / cron',
      default: defaultWd,
    },
  ]);
  if (workdir?.trim()) {
    config.set('gatewayWorkdir', workdir.trim());
    await writeGatewayEnv({ XIBECODE_GATEWAY_WORKDIR: workdir.trim() });
  }

  const installService = await askYesNo(
    'Install systemd user service for 24/7 gateway? (Linux)',
    process.platform === 'linux',
  );

  if (installService) {
    try {
      const unit = await installSystemdUserService({
        profile: config.getProfileName(),
        workdir: workdir?.trim() || process.cwd(),
      });
      console.log(chalk.green(`✓ Wrote ${unit}`));
      console.log(chalk.white('\nStart it with:'));
      console.log(chalk.cyan('  systemctl --user daemon-reload'));
      console.log(chalk.cyan('  systemctl --user enable --now xibecode-gateway'));
      console.log(chalk.cyan('  sudo loginctl enable-linger $USER   # optional, boot without login'));
      console.log('');

      const startNow = await askYesNo('Start gateway service now?', true);
      if (startNow) {
        const { execSync } = await import('child_process');
        try {
          execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
          execSync('systemctl --user enable --now xibecode-gateway', {
            stdio: 'inherit',
          });
          console.log(chalk.green('\n✓ Gateway service started.\n'));
        } catch {
          console.log(
            chalk.yellow(
              '\nCould not start via systemctl. Run the commands above manually.\n',
            ),
          );
        }
      }
    } catch (err: any) {
      console.log(chalk.yellow(`Service install skipped: ${err?.message || err}`));
      console.log(chalk.dim('You can still run: xibecode daemon --workdir ...\n'));
    }
  } else {
    console.log(chalk.dim('\nLater: xibecode daemon --install --workdir /path/to/repo\n'));
  }

  console.log(chalk.green('✓ Xibe Daemon section done.\n'));
}

async function setupAgent(config: ConfigManager): Promise<void> {
  console.log(chalk.bold.white('3) Agent defaults\n'));

  const { maxIterations } = await inquirer.prompt([
    {
      type: 'input',
      name: 'maxIterations',
      message: 'Max agent iterations (0 = unlimited in run)',
      default: String(config.get('maxIterations') ?? 50),
      validate: (v: string) =>
        Number.isFinite(Number(v)) && Number(v) >= 0 ? true : 'Enter a number',
    },
  ]);
  config.set('maxIterations', Number(maxIterations));

  const costMode = await askNumbered<'normal' | 'economy'>(
    'Cost mode:',
    [
      { name: 'normal — full model / higher caps', value: 'normal' },
      { name: 'economy — cheaper model / lower caps', value: 'economy' },
    ],
    (config.get('costMode') as 'normal' | 'economy') || 'normal',
  );
  config.set('costMode', costMode);

  if (costMode === 'economy') {
    const { economyModel } = await inquirer.prompt([
      {
        type: 'input',
        name: 'economyModel',
        message: 'Economy model id (optional)',
        default: config.get('economyModel') || '',
      },
    ]);
    if (economyModel?.trim()) config.set('economyModel', economyModel.trim());
  }

  const memoryApproval = await askYesNo(
    'Require approval before auto-saving memory/skills? (safer)',
    false,
  );
  if (memoryApproval) {
    try {
      const { setWriteApproval } = await import('xibecode-core');
      await setWriteApproval('memory', true);
      await setWriteApproval('skill', true);
      console.log(chalk.dim('  write_approval on — review with: xibecode memory pending'));
    } catch {
      /* optional */
    }
  }

  console.log(chalk.green('\n✓ Agent defaults saved.\n'));
}

function printDoneSummary(config: ConfigManager): void {
  console.log(chalk.bold.white('Setup complete\n'));
  console.log(chalk.dim(`  profile   ${config.getProfileName()}`));
  console.log(chalk.dim(`  model     ${config.getModel()}`));
  console.log(chalk.dim(`  provider  ${config.get('provider') || 'auto'}`));
  console.log(chalk.dim(`  api key   ${mask(config.getApiKey())}`));
  console.log(chalk.dim(`  config    ${config.getConfigPath()}`));
  console.log(chalk.dim(`  gateway   ${gatewayEnvPath()}`));
  console.log('');
  console.log(chalk.white('Next steps:'));
  console.log(chalk.cyan('  xibecode chat') + chalk.dim('              # local interactive coding'));
  console.log(
    chalk.cyan('  xibecode daemon') + chalk.dim('            # Xibe Daemon 24/7 (Telegram etc.)'),
  );
  console.log(
    chalk.cyan('  xibecode daemon --status') + chalk.dim('   # if you installed the service'),
  );
  console.log(
    chalk.cyan('  xibecode pair list') + chalk.dim('         # approve pairing codes from DMs'),
  );
  console.log('');
  console.log(chalk.dim('Re-run a section anytime:'));
  console.log(chalk.dim('  xibecode setup model | gateway | agent'));
  console.log('');
}

export async function setupCommand(
  sectionArg: string | undefined,
  options: SetupOptions,
): Promise<void> {
  const section = (options.section || sectionArg || '').toLowerCase() || undefined;

  if (options.nonInteractive || !isInteractive()) {
    printNonInteractiveGuidance(
      options.nonInteractive
        ? 'Non-interactive flag set.'
        : 'No interactive TTY detected.',
    );
    return;
  }

  const config = new ConfigManager(options.profile);

  if (options.reset) {
    config.clear();
    console.log(chalk.green('Configuration reset to defaults.\n'));
  }

  // Section-only
  if (section && SECTIONS.some((s) => s.key === section)) {
    const label = SECTIONS.find((s) => s.key === section)!.label;
    printBanner(label);
    if (section === 'model') await setupModel(config);
    else if (section === 'gateway') await setupGateway(config);
    else if (section === 'agent') await setupAgent(config);
    printDoneSummary(config);
    return;
  }

  if (section && section !== 'full') {
    console.error(chalk.red(`Unknown setup section: ${section}`));
    console.error(
      chalk.dim(`Available: ${SECTIONS.map((s) => s.key).join(', ')} (or omit for full wizard)`),
    );
    process.exitCode = 1;
    return;
  }

  printBanner();
  console.log(chalk.dim(`  XibeCode v${pkg.version}  ·  profile: ${config.getProfileName()}`));
  console.log(chalk.dim('  Configure model, 24/7 gateway, and agent defaults.\n'));

  if (options.quick) {
    await setupModel(config);
    await setupGateway(config);
    printDoneSummary(config);
    return;
  }

  // Always show main menu (clear numbered options — no arrow UI)
  const mode = await askNumbered<
    'full' | 'quick' | 'model' | 'gateway' | 'agent' | 'exit'
  >(
    'What do you want to configure?',
    [
      { name: 'Full setup (model + 24/7 gateway + agent)', value: 'full' },
      { name: 'Quick setup (model + Telegram gateway)', value: 'quick' },
      { name: 'Model & LLM provider only', value: 'model' },
      { name: '24/7 gateway only (Telegram / Discord / Slack)', value: 'gateway' },
      { name: 'Agent defaults only', value: 'agent' },
      { name: 'Exit', value: 'exit' },
    ],
    config.getApiKey() ? 'quick' : 'full',
  );

  if (mode === 'exit') {
    console.log(chalk.dim('Bye.\n'));
    return;
  }
  if (mode === 'quick') {
    await setupModel(config);
    await setupGateway(config);
    printDoneSummary(config);
    return;
  }
  if (mode === 'model') {
    await setupModel(config);
    printDoneSummary(config);
    return;
  }
  if (mode === 'gateway') {
    await setupGateway(config);
    printDoneSummary(config);
    return;
  }
  if (mode === 'agent') {
    await setupAgent(config);
    printDoneSummary(config);
    return;
  }

  // full
  await setupModel(config);
  await setupGateway(config);
  await setupAgent(config);
  printDoneSummary(config);
}
