/**
 * Provider types and configurations for AI model providers.
 * OpenAI- and Anthropic-compatible API provider catalog
 * plus XibeCode extras (zenllm.org, routing.run).
 *
 * @module types/provider
 */

export type ProviderWireFormat = 'openai' | 'anthropic';

export interface ProviderConfigEntry {
  baseUrl: string;
  defaultModel: string;
  format: ProviderWireFormat;
  envKey: string;
  /** Extra env vars checked after envKey (multi-env providers). */
  envKeys?: readonly string[];
  name: string;
  apiKeyUrl?: string;
  /** Optional short blurb for setup pickers. */
  description?: string;
}

/**
 * Built-in provider registry.
 * Keys are stable config ids (`xibecode config --set-provider <id>`).
 */
export const PROVIDER_CONFIGS = {
  // ── XibeCode recommended aggregators ───────────────────────────────────
  routingrun: {
    baseUrl: 'https://api.routing.run/v1',
    defaultModel: 'route/glm-5.1',
    format: 'openai',
    envKey: 'ROUTINGRUN_API_KEY',
    name: 'Routing.run',
    apiKeyUrl: 'https://app.routing.run/dashboard/keys',
    description: 'Cheapest open-source model routing',
  },
  zenllm: {
    baseUrl: 'https://api.zenllm.org/v1',
    defaultModel: 'zhipu/glm-5.1',
    format: 'openai',
    envKey: 'ZENLLM_API_KEY',
    name: 'zenllm.org',
    apiKeyUrl: 'https://zenllm.org/dashboard',
    description: '200+ models aggregator',
  },

  // ── Major direct APIs ──────────────────────────────────────────────────
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-6',
    format: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    envKeys: ['ANTHROPIC_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN'],
    name: 'Anthropic',
    apiKeyUrl: 'https://platform.claude.com/settings/keys',
    description: 'Claude models via API key',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.4',
    format: 'openai',
    envKey: 'OPENAI_API_KEY',
    name: 'OpenAI',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    description: 'api.openai.com',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-sonnet-4-6',
    format: 'openai',
    envKey: 'OPENROUTER_API_KEY',
    name: 'OpenRouter',
    apiKeyUrl: 'https://openrouter.ai/keys',
    description: 'Pay-per-use multi-provider aggregator',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-pro',
    format: 'openai',
    envKey: 'DEEPSEEK_API_KEY',
    name: 'DeepSeek',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    description: 'V4 / chat / reasoner direct API',
  },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3-pro-preview',
    format: 'openai',
    envKey: 'GOOGLE_API_KEY',
    envKeys: ['GEMINI_API_KEY'],
    name: 'Google AI Studio (Gemini)',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    description: 'Gemini via OpenAI-compatible endpoint',
  },
  grok: {
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4-0709',
    format: 'openai',
    envKey: 'XAI_API_KEY',
    name: 'xAI (Grok)',
    apiKeyUrl: 'https://console.x.ai',
    description: 'Grok direct API',
  },
  xai: {
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4-0709',
    format: 'openai',
    envKey: 'XAI_API_KEY',
    name: 'xAI',
    apiKeyUrl: 'https://console.x.ai',
    description: 'Alias of grok',
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    format: 'openai',
    envKey: 'GROQ_API_KEY',
    name: 'Groq',
    apiKeyUrl: 'https://console.groq.com/keys',
    description: 'Fast inference (Llama etc.)',
  },

  // ── Zhipu / Moonshot / MiniMax / Qwen family ───────────────────────────
  zai: {
    baseUrl: 'https://api.z.ai/api/paas/v4',
    defaultModel: 'glm-5.1',
    format: 'openai',
    envKey: 'ZAI_API_KEY',
    envKeys: ['GLM_API_KEY', 'Z_AI_API_KEY'],
    name: 'Z.AI / GLM',
    apiKeyUrl: 'https://z.ai/manage-apikey/apikey-list',
    description: 'Zhipu GLM direct API',
  },
  kimi: {
    baseUrl: 'https://api.moonshot.ai/anthropic',
    defaultModel: 'kimi-k2.6',
    format: 'anthropic',
    envKey: 'MOONSHOT_API_KEY',
    envKeys: ['KIMI_API_KEY', 'KIMI_CODING_API_KEY'],
    name: 'Moonshot (Kimi Anthropic)',
    apiKeyUrl: 'https://platform.moonshot.ai/console/api-keys',
    description: 'Kimi via Anthropic-compatible endpoint',
  },
  'kimi-coding': {
    baseUrl: 'https://api.moonshot.ai/v1',
    defaultModel: 'kimi-k2.6',
    format: 'openai',
    envKey: 'KIMI_API_KEY',
    envKeys: ['KIMI_CODING_API_KEY', 'MOONSHOT_API_KEY'],
    name: 'Kimi / Kimi Coding Plan',
    apiKeyUrl: 'https://platform.moonshot.ai/console/api-keys',
    description: 'Kimi Coding + Moonshot OpenAI-compat',
  },
  'kimi-coding-cn': {
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2.6',
    format: 'openai',
    envKey: 'KIMI_CN_API_KEY',
    name: 'Kimi / Moonshot (China)',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    description: 'Domestic Moonshot API',
  },
  alibaba: {
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3.6-plus',
    format: 'openai',
    envKey: 'DASHSCOPE_API_KEY',
    envKeys: ['ALIBABA_API_KEY'],
    name: 'Qwen Cloud (DashScope)',
    apiKeyUrl: 'https://dashscope.console.aliyun.com/apiKey',
    description: 'DashScope OpenAI-compatible',
  },
  'alibaba-coding-plan': {
    baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/v1',
    defaultModel: 'qwen3.5-coder-plus',
    format: 'openai',
    envKey: 'ALIBABA_CODING_PLAN_API_KEY',
    envKeys: ['DASHSCOPE_API_KEY', 'ALIBABA_API_KEY'],
    name: 'Alibaba Coding Plan',
    apiKeyUrl: 'https://dashscope.console.aliyun.com/apiKey',
    description: 'coding-intl.dashscope coding plan',
  },
  minimax: {
    baseUrl: 'https://api.minimax.io/anthropic',
    defaultModel: 'MiniMax-M3',
    format: 'anthropic',
    envKey: 'MINIMAX_API_KEY',
    name: 'MiniMax',
    apiKeyUrl: 'https://platform.minimax.io',
    description: 'Global MiniMax (Anthropic Messages)',
  },
  'minimax-cn': {
    baseUrl: 'https://api.minimaxi.com/anthropic',
    defaultModel: 'MiniMax-M3',
    format: 'anthropic',
    envKey: 'MINIMAX_CN_API_KEY',
    name: 'MiniMax (China)',
    apiKeyUrl: 'https://platform.minimaxi.com',
    description: 'Domestic MiniMax API',
  },

  // ── Aggregators & gateways ────────────────────────────
  fireworks: {
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    format: 'openai',
    envKey: 'FIREWORKS_API_KEY',
    name: 'Fireworks AI',
    apiKeyUrl: 'https://app.fireworks.ai/settings/users/api-keys',
    description: 'OpenAI-compatible model API',
  },
  novita: {
    baseUrl: 'https://api.novita.ai/openai/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct',
    format: 'openai',
    envKey: 'NOVITA_API_KEY',
    name: 'NovitaAI',
    apiKeyUrl: 'https://novita.ai',
    description: 'Model API + GPU cloud',
  },
  huggingface: {
    baseUrl: 'https://router.huggingface.co/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
    format: 'openai',
    envKey: 'HF_TOKEN',
    envKeys: ['HUGGINGFACE_API_KEY'],
    name: 'Hugging Face',
    apiKeyUrl: 'https://huggingface.co/settings/tokens',
    description: 'Inference Providers router',
  },
  'opencode-zen': {
    baseUrl: 'https://opencode.ai/zen/v1',
    defaultModel: 'claude-sonnet-4-5',
    format: 'openai',
    envKey: 'OPENCODE_ZEN_API_KEY',
    name: 'OpenCode Zen',
    apiKeyUrl: 'https://opencode.ai',
    description: 'Curated models, pay-as-you-go',
  },
  'opencode-go': {
    baseUrl: 'https://opencode.ai/zen/go/v1',
    defaultModel: 'kimi-k2.5',
    format: 'openai',
    envKey: 'OPENCODE_GO_API_KEY',
    name: 'OpenCode Go',
    apiKeyUrl: 'https://opencode.ai',
    description: 'Open models subscription gateway',
  },
  kilocode: {
    baseUrl: 'https://api.kilo.ai/api/gateway',
    defaultModel: 'anthropic/claude-sonnet-4.6',
    format: 'openai',
    envKey: 'KILOCODE_API_KEY',
    name: 'Kilo Code',
    apiKeyUrl: 'https://kilo.ai',
    description: 'Kilo Gateway API',
  },
  'ollama-cloud': {
    baseUrl: 'https://ollama.com/v1',
    defaultModel: 'llama3.3',
    format: 'openai',
    envKey: 'OLLAMA_API_KEY',
    name: 'Ollama Cloud',
    apiKeyUrl: 'https://ollama.com/settings',
    description: 'Cloud-hosted open models',
  },

  // ── Regional / specialized ─────────────────────────────────────────────
  nvidia: {
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'nvidia/nemotron-3-super-120b-a12b',
    format: 'openai',
    envKey: 'NVIDIA_API_KEY',
    name: 'NVIDIA NIM',
    apiKeyUrl: 'https://build.nvidia.com',
    description: 'Nemotron + hosted models',
  },
  xiaomi: {
    baseUrl: 'https://api.xiaomimimo.com/v1',
    defaultModel: 'mimo-v2.5-pro',
    format: 'openai',
    envKey: 'XIAOMI_API_KEY',
    name: 'Xiaomi MiMo',
    apiKeyUrl: 'https://platform.xiaomimimo.com',
    description: 'MiMo V2.5 models',
  },
  'tencent-tokenhub': {
    baseUrl: 'https://tokenhub.tencentmaas.com/v1',
    defaultModel: 'hy3-preview',
    format: 'openai',
    envKey: 'TOKENHUB_API_KEY',
    name: 'Tencent TokenHub',
    apiKeyUrl: 'https://tokenhub.tencentmaas.com',
    description: 'Hy3 Preview etc.',
  },
  stepfun: {
    baseUrl: 'https://api.stepfun.ai/step_plan/v1',
    defaultModel: 'step-3.5-flash',
    format: 'openai',
    envKey: 'STEPFUN_API_KEY',
    name: 'StepFun Step Plan',
    apiKeyUrl: 'https://platform.stepfun.com',
    description: 'Step Plan agent / coding models',
  },
  arcee: {
    baseUrl: 'https://api.arcee.ai/api/v1',
    defaultModel: 'trinity-large-thinking',
    format: 'openai',
    envKey: 'ARCEEAI_API_KEY',
    name: 'Arcee AI',
    apiKeyUrl: 'https://www.arcee.ai',
    description: 'Trinity models',
  },
  gmi: {
    baseUrl: 'https://api.gmi-serving.com/v1',
    defaultModel: 'zai-org/GLM-5.1-FP8',
    format: 'openai',
    envKey: 'GMI_API_KEY',
    name: 'GMI Cloud',
    apiKeyUrl: 'https://gmi-serving.com',
    description: 'Multi-model direct API',
  },

  // ── Local / user endpoint ──────────────────────────────────────────────
  lmstudio: {
    baseUrl: 'http://127.0.0.1:1234/v1',
    defaultModel: 'local-model',
    format: 'openai',
    envKey: 'LM_API_KEY',
    name: 'LM Studio',
    apiKeyUrl: 'https://lmstudio.ai',
    description: 'Local desktop model server (key often optional)',
  },
  'azure-foundry': {
    baseUrl: '',
    defaultModel: 'gpt-4o',
    format: 'openai',
    envKey: 'AZURE_FOUNDRY_API_KEY',
    name: 'Azure AI Foundry',
    apiKeyUrl: 'https://ai.azure.com',
    description: 'Set your Azure OpenAI/Foundry base URL',
  },
} as const satisfies Record<string, ProviderConfigEntry>;

export type ProviderType = keyof typeof PROVIDER_CONFIGS | 'custom';

/** Recommended order for setup pickers (recommended first). */
export const SETUP_PROVIDER_PRIORITY: readonly (keyof typeof PROVIDER_CONFIGS)[] = [
  'routingrun',
  'zenllm',
  'openrouter',
  'anthropic',
  'openai',
  'deepseek',
  'google',
  'grok',
  'zai',
  'kimi',
  'kimi-coding',
  'alibaba',
  'minimax',
  'fireworks',
  'novita',
  'groq',
  'huggingface',
  'opencode-zen',
  'opencode-go',
  'kilocode',
  'nvidia',
  'xiaomi',
  'stepfun',
  'ollama-cloud',
  'lmstudio',
  'arcee',
  'gmi',
  'tencent-tokenhub',
  'kimi-coding-cn',
  'minimax-cn',
  'alibaba-coding-plan',
  'azure-foundry',
  'xai',
] as const;

export interface SetupProviderOption {
  id: keyof typeof PROVIDER_CONFIGS;
  name: string;
  baseUrl: string;
  format: ProviderWireFormat;
  defaultModel: string;
  envKey: string;
  apiKeyUrl?: string;
  description?: string;
  label: string;
}

/** Full setup list: priority first, then any remaining configs, then custom is caller's job. */
export function listSetupProviders(): SetupProviderOption[] {
  const seen = new Set<string>();
  const out: SetupProviderOption[] = [];

  const push = (id: keyof typeof PROVIDER_CONFIGS) => {
    if (seen.has(id)) return;
    seen.add(id);
    const cfg = PROVIDER_CONFIGS[id];
    const desc = 'description' in cfg ? (cfg as ProviderConfigEntry).description : undefined;
    out.push({
      id,
      name: cfg.name,
      baseUrl: cfg.baseUrl,
      format: cfg.format,
      defaultModel: cfg.defaultModel,
      envKey: cfg.envKey,
      apiKeyUrl: 'apiKeyUrl' in cfg ? cfg.apiKeyUrl : undefined,
      description: desc,
      label: desc ? `${cfg.name} — ${desc}` : cfg.name,
    });
  };

  for (const id of SETUP_PROVIDER_PRIORITY) push(id);
  for (const id of Object.keys(PROVIDER_CONFIGS) as (keyof typeof PROVIDER_CONFIGS)[]) {
    push(id);
  }
  return out;
}

/** Resolve env API key for a provider id (config key + multi-env). */
export function resolveProviderEnvApiKey(
  provider: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (!provider || provider === 'custom') return undefined;
  const cfg = PROVIDER_CONFIGS[provider as keyof typeof PROVIDER_CONFIGS];
  if (!cfg) return undefined;
  const keys = [cfg.envKey, ...(('envKeys' in cfg && cfg.envKeys) || [])];
  for (const k of keys) {
    const v = env[k]?.trim();
    if (v) return v;
  }
  return undefined;
}
