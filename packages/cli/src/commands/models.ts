/**
 * Models command — list providers and live /models catalogs ().
 *
 *   xibecode models
 *   xibecode models --providers
 *   xibecode models --providers --all     # + models.dev (100+)
 *   xibecode models --provider openrouter
 *   xibecode models --provider kilo --json
 *   xibecode models --refresh
 */
import { Command } from 'commander';
import chalk from 'chalk';
import {
  fetchProviderModels,
  listAllProvidersCatalog,
  listSetupProviders,
  PROVIDER_CONFIGS,
  resolveProviderEnvApiKey,
  resolveModelsDevEndpoint,
  fetchModelsDevRegistry,
} from 'xibecode-core';
import { ConfigManager } from '../utils/config.js';

async function resolveEndpoint(opts: {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  profile?: string;
}): Promise<{
  providerId?: string;
  baseUrl: string;
  apiKey?: string;
  format: 'openai' | 'anthropic';
  name?: string;
}> {
  const config = new ConfigManager(opts.profile);
  let providerId =
    opts.provider || (config.get('provider') as string | undefined) || undefined;
  let baseUrl = opts.baseUrl ?? config.getBaseUrl() ?? '';
  let apiKey =
    opts.apiKey ??
    config.getApiKey() ??
    resolveProviderEnvApiKey(providerId) ??
    process.env.ANTHROPIC_API_KEY ??
    process.env.OPENAI_API_KEY ??
    process.env.OPENROUTER_API_KEY;
  let format: 'openai' | 'anthropic' =
    (config.get('customProviderFormat') as 'openai' | 'anthropic' | undefined) ||
    'openai';
  let name: string | undefined;

  if (opts.provider) {
    const id = opts.provider as keyof typeof PROVIDER_CONFIGS;
    const cfg = PROVIDER_CONFIGS[id];
    if (cfg) {
      providerId = opts.provider;
      name = cfg.name;
      if (!opts.baseUrl) baseUrl = cfg.baseUrl;
      format = cfg.format;
      if (!opts.apiKey) {
        apiKey =
          resolveProviderEnvApiKey(opts.provider) ||
          config.getApiKey() ||
          apiKey;
        // multi-env from models.dev style
        if (!apiKey && 'envKeys' in cfg && cfg.envKeys) {
          for (const k of cfg.envKeys) {
            const v = process.env[k]?.trim();
            if (v) {
              apiKey = v;
              break;
            }
          }
        }
      }
    } else {
      // models.dev / unknown id
      const mdev = await resolveModelsDevEndpoint(opts.provider);
      if (mdev) {
        providerId = opts.provider;
        name = mdev.name;
        if (!opts.baseUrl) baseUrl = mdev.baseUrl;
        format = mdev.format;
        if (!opts.apiKey) {
          for (const k of mdev.envKeys) {
            const v = process.env[k]?.trim();
            if (v) {
              apiKey = v;
              break;
            }
          }
          apiKey = apiKey || config.getApiKey() || undefined;
        }
      }
    }
  } else if (
    providerId &&
    providerId !== 'custom' &&
    PROVIDER_CONFIGS[providerId as keyof typeof PROVIDER_CONFIGS]
  ) {
    format =
      PROVIDER_CONFIGS[providerId as keyof typeof PROVIDER_CONFIGS].format;
    name = PROVIDER_CONFIGS[providerId as keyof typeof PROVIDER_CONFIGS].name;
  }

  return { providerId, baseUrl, apiKey: apiKey || undefined, format, name };
}

async function listModelsCommand(options: {
  apiKey?: string;
  baseUrl?: string;
  profile?: string;
  provider?: string;
  providers?: boolean;
  all?: boolean;
  json?: boolean;
  refresh?: boolean;
  includeAllModels?: boolean;
}) {
  const config = new ConfigManager(options.profile);

  if (options.refresh) {
    process.stdout.write(chalk.dim('Refreshing models.dev registry… '));
    const reg = await fetchModelsDevRegistry(true);
    const n = Object.keys(reg).length;
    console.log(chalk.green(`ok (${n} providers)`));
  }

  // ── List providers ────────────────────────────────────────────────────
  if (options.providers) {
    const catalog = await listAllProvidersCatalog({
      includeModelsDev: !!options.all,
      forceRefresh: !!options.refresh,
    });
    if (options.json) {
      console.log(JSON.stringify(catalog, null, 2));
      return;
    }
    const builtin = catalog.filter((p) => p.source === 'builtin');
    const mdev = catalog.filter((p) => p.source === 'models.dev');
    console.log(
      chalk.hex('#00D4FF').bold(
        `\nProviders — built-in ${builtin.length}` +
          (options.all ? ` + models.dev ${mdev.length}` : '') +
          `\n`,
      ),
    );

    const printList = (
      items: typeof catalog,
      title: string,
    ) => {
      if (!items.length) return;
      console.log(chalk.white.bold(title));
      for (const p of items) {
        const envSet = p.envKey ? !!process.env[p.envKey]?.trim() : false;
        const mark = envSet ? chalk.green('●') : chalk.dim('○');
        const count =
          p.modelCount != null ? chalk.dim(` · ${p.modelCount} models`) : '';
        console.log(
          `${mark} ${chalk.white(p.id.padEnd(28))} ${chalk.dim(p.name)}${count}`,
        );
        if (p.baseUrl || p.description) {
          console.log(
            chalk.dim(
              `   ${(p.baseUrl || '(no public api url)').slice(0, 70)}  ·  ${p.format}` +
                (p.envKey ? `  ·  ${p.envKey}` : ''),
            ),
          );
        }
      }
      console.log('');
    };

    // Prefer setup priority for builtins
    const priority = new Map<string, number>(
      listSetupProviders().map((p, i) => [String(p.id), i]),
    );
    const sortedBuiltin = [...builtin].sort((a, b) => {
      const pa = priority.get(a.id) ?? 999;
      const pb = priority.get(b.id) ?? 999;
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name);
    });
    printList(sortedBuiltin, 'Built-in (first-class)');
    if (options.all) {
      printList(mdev, 'models.dev (community registry)');
    } else {
      console.log(
        chalk.dim(
          'Tip: xibecode models --providers --all   # full models.dev catalog (100+)',
        ),
      );
    }
    console.log(chalk.dim('● = env key present · ○ = not in env'));
    console.log(chalk.dim('Fetch models: xibecode models --provider <id>'));
    console.log(
      chalk.dim(
        'Set provider: xibecode config --set-provider <id>  (then --set-key / --set-url if needed)',
      ),
    );
    console.log('');
    return;
  }

  const ep = await resolveEndpoint({
    provider: options.provider,
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    profile: options.profile,
  });

  const model = config.getModel();

  if (options.json) {
    const result = await fetchProviderModels({
      baseUrl: ep.baseUrl,
      apiKey: ep.apiKey,
      format: ep.format,
      provider: ep.providerId,
      includeNonChat: options.includeAllModels,
      forceRefresh: options.refresh,
    });
    console.log(
      JSON.stringify(
        {
          provider: ep.providerId,
          name: ep.name,
          baseUrl: ep.baseUrl,
          format: ep.format,
          currentModel: model,
          ...result,
        },
        null,
        2,
      ),
    );
    if (!result.models.length) process.exitCode = 1;
    return;
  }

  console.log(
    chalk.hex('#00D4FF').bold(
      `\nXibeCode Models (${options.profile || config.getProfileName() || 'default'} profile)`,
    ),
  );
  console.log('='.repeat(50));
  console.log(
    `Provider:  ${ep.providerId || 'custom'}${ep.name ? chalk.dim(` (${ep.name})`) : ''}`,
  );
  console.log(
    `API Key:   ${
      ep.apiKey
        ? `${ep.apiKey.substring(0, 8)}...${ep.apiKey.slice(-4)}`
        : chalk.yellow('not set')
    }`,
  );
  console.log(`Base URL:  ${ep.baseUrl || chalk.yellow('not set')}`);
  console.log(`Format:    ${ep.format}`);
  console.log(`Current:   ${model || chalk.dim('(unset)')}`);
  console.log('');
  console.log(chalk.dim('Fetching GET /models (then models.dev / curated)…'));

  const result = await fetchProviderModels({
    baseUrl: ep.baseUrl,
    apiKey: ep.apiKey,
    format: ep.format,
    provider: ep.providerId,
    includeNonChat: options.includeAllModels,
    forceRefresh: options.refresh,
  });

  if (!result.models.length) {
    console.log(chalk.red(`\nNo models (${result.error || 'empty'})`));
    console.log(chalk.dim(`URL: ${result.url || '(none)'}`));
    console.log(
      chalk.dim(
        'Try: xibecode models --providers --all  ·  xibecode models --provider openrouter',
      ),
    );
    process.exitCode = 1;
    return;
  }

  const sourceLabel =
    result.source === 'live'
      ? chalk.green('live /models')
      : result.source === 'curated'
        ? chalk.yellow('models.dev / curated')
        : chalk.dim(result.source);

  console.log(
    chalk.green(`\nFound ${result.models.length} model(s) via ${sourceLabel}`),
  );
  if (result.error && result.source !== 'live') {
    console.log(chalk.dim(`  note: ${result.error}`));
  }
  console.log(chalk.dim(`  ${result.url || ep.baseUrl || ''}`));
  console.log('');

  const show = result.models.slice(0, 80);
  console.table(
    show.map((m, i) => ({
      '#': i + 1,
      Model: m,
      current: m === model ? '←' : '',
    })),
  );
  if (result.models.length > 80) {
    console.log(chalk.dim(`… and ${result.models.length - 80} more (use --json)`));
  }

  console.log(
    chalk.dim(
      `\nSet model:  xibecode config --set-model ${result.models[0]}`,
    ),
  );
  console.log(
    chalk.dim(
      'Providers:  xibecode models --providers --all   # built-in + models.dev',
    ),
  );
  console.log(
    chalk.dim(
      'Other API:  xibecode models --provider <id>',
    ),
  );
  console.log('');
}

const modelsCmd = new Command('models');
modelsCmd
  .description(
 'List models from provider /models API + models.dev catalog ()',
  )
  .option('-k, --api-key <key>', 'API key (overrides config)')
  .option('-b, --base-url <url>', 'Custom base URL')
  .option('--profile <name>', 'Config profile to use')
  .option(
    '-p, --provider <id>',
    'Provider id (built-in or models.dev, e.g. openrouter, kilo, anthropic)',
  )
  .option('--providers', 'List providers', false)
  .option(
    '--all',
    'With --providers: include full models.dev registry (100+). With models: include non-chat',
    false,
  )
  .option('--json', 'Machine-readable output', false)
  .option('--refresh', 'Force-refresh models.dev cache', false)
  .action((opts) =>
    listModelsCommand({
      ...opts,
      includeAllModels: opts.all && !opts.providers,
    }),
  );

export { modelsCmd };
