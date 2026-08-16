/**
 * Live model catalog from provider `/models` endpoints ().
 *
 * - OpenAI-compatible: GET {base}/models with Bearer
 * - Anthropic-compatible: GET {base}/models with x-api-key + anthropic-version
 * - Curated fallbacks when live catalog is empty/unreachable
 * - Short in-process cache so /model and setup don't hammer APIs
 *
 * @module models-catalog
 */

import {
  PROVIDER_CONFIGS,
  type ProviderType,
  type ProviderWireFormat,
} from './types/provider.js';

export interface FetchModelsOptions {
  baseUrl: string;
  apiKey?: string | null;
  /** Wire format — picks auth headers. */
  format?: ProviderWireFormat;
  /** Provider id (for curated fallback + defaults). */
  provider?: string | null;
  timeoutMs?: number;
  /** Keep embedding / audio / image models (default: filter out of agent pickers). */
  includeNonChat?: boolean;
  /** Bypass in-process cache. */
  forceRefresh?: boolean;
}

export interface FetchModelsResult {
  models: string[];
  /** Live ids detected as free (`:free` suffix or $0 pricing). */
  free?: string[];
  /** Where the list came from. */
  source: 'live' | 'curated' | 'default' | 'empty' | 'mixed';
  url: string;
  error?: string;
  /** How many ids came from GET /models with no key. */
  anonymousCount?: number;
  /** How many ids came from GET /models with a bearer/key. */
  authenticatedCount?: number;
}

/** Sentinel for pickers: user will type a model id. */
export const CUSTOM_MODEL_VALUE = '__custom__';

export function withCustomModelOption(models: string[]): string[] {
  const out = models.filter((m) => m && m !== CUSTOM_MODEL_VALUE);
  out.push(CUSTOM_MODEL_VALUE);
  return out;
}

/** Curated agent-friendly models when /models lags or fails (messaging gateway _PROVIDER_MODELS idea). */
export const CURATED_PROVIDER_MODELS: Record<string, readonly string[]> = {
  anthropic: [
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
    'claude-opus-4-5',
    'claude-sonnet-4-5',
  ],
  openai: [
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5-mini',
    'gpt-4.1',
    'gpt-4o',
    'gpt-4o-mini',
  ],
  openrouter: [
    'anthropic/claude-sonnet-4-6',
    'anthropic/claude-opus-4-6',
    'openai/gpt-5.4',
    'google/gemini-2.5-pro',
    'deepseek/deepseek-chat-v3',
    'x-ai/grok-4',
  ],
  deepseek: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner'],
  google: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-3-pro-preview',
    'gemini-3.5-flash',
  ],
  grok: ['grok-4-0709', 'grok-3', 'grok-3-mini'],
  xai: ['grok-4-0709', 'grok-3', 'grok-3-mini'],
  zai: ['glm-5.2', 'glm-5.1', 'glm-4.7', 'glm-4.6'],
  kimi: ['kimi-k2.6', 'kimi-k2.5', 'moonshot-v1-128k'],
  'kimi-coding': ['kimi-k2.6', 'kimi-k2.5'],
  minimax: ['MiniMax-M3', 'MiniMax-M2.5'],
  'minimax-cn': ['MiniMax-M3', 'MiniMax-M2.5'],
  alibaba: ['qwen3.6-plus', 'qwen3-coder-plus', 'qwen-max', 'qwen-plus'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768'],
  mistral: ['mistral-large-latest', 'mistral-medium-latest', 'codestral-latest', 'ministral-8b-latest'],
  together: [
    'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    'deepseek-ai/DeepSeek-V3',
    'Qwen/Qwen2.5-Coder-32B-Instruct',
  ],
  cerebras: ['llama-3.3-70b', 'llama3.1-70b', 'llama3.1-8b'],
  deepinfra: [
    'meta-llama/Llama-3.3-70B-Instruct',
    'deepseek-ai/DeepSeek-V3',
    'Qwen/Qwen2.5-72B-Instruct',
  ],
  fireworks: [
    'accounts/fireworks/models/llama-v3p3-70b-instruct',
    'accounts/fireworks/models/deepseek-v3',
  ],
  routingrun: [
    'route/deepseek-v4-pro',
    'route/glm-5.1',
    'deepseek-v4-pro',
    'deepseek-v4-flash',
    'glm-5.2',
    'kimi-k2.6',
  ],
  zenllm: ['zhipu/glm-5.1', 'deepseek/deepseek-v3', 'anthropic/claude-sonnet-4'],
  nvidia: ['nvidia/nemotron-3-super-120b-a12b', 'meta/llama-3.3-70b-instruct'],
  ollama: ['llama3.3', 'qwen2.5-coder', 'deepseek-r1', 'codellama'],
  'ollama-cloud': ['llama3.3', 'qwen2.5-coder', 'deepseek-r1'],
  lmstudio: ['local-model'],
};

const cache = new Map<
  string,
  { at: number; models: string[]; free?: string[]; source: FetchModelsResult['source'] }
>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function normalizeBaseUrl(baseUrl: string): string {
  return (baseUrl || '').trim().replace(/\/+$/, '');
}

function modelsUrl(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) return '';
  // Anthropic base may be https://api.anthropic.com (no /v1) or .../v1
  if (/\/v1$/i.test(base) || /\/anthropic$/i.test(base) || /paas\/v4$/i.test(base)) {
    return `${base}/models`;
  }
  // bare host → assume /v1/models for OpenAI-compat
  if (!/\/v\d+/i.test(base) && !/\/openai/i.test(base) && !/compatible-mode/i.test(base)) {
    return `${base}/v1/models`;
  }
  return `${base}/models`;
}

function looksAnthropic(baseUrl: string, format?: ProviderWireFormat): boolean {
  if (format === 'anthropic') return true;
  const b = baseUrl.toLowerCase();
  return (
    b.includes('api.anthropic.com') ||
    b.endsWith('/anthropic') ||
    b.includes('/anthropic/')
  );
}

function isNonChatModel(id: string): boolean {
  const s = id.toLowerCase();
  return (
    /embed|embedding|whisper|tts|dall-?e|moderation|image|audio|speech|transcri|vision-preview|text-embedding/.test(
      s,
    ) || s.includes('embed-')
  );
}

function looksFree(id: string, item?: any): boolean {
  if (/:free$/i.test(id) || /(^|[/\-])free([/\-]|$)/i.test(id)) return true;
  const p = item && typeof item === 'object' ? item.pricing : undefined;
  if (!p || typeof p !== 'object') return false;
  const num = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const prompt = num((p as any).prompt ?? (p as any).input);
  const completion = num((p as any).completion ?? (p as any).output);
  if (prompt === null && completion === null) return false;
  return (prompt ?? 0) === 0 && (completion ?? 0) === 0;
}

export function parseModelCatalog(payload: unknown): { ids: string[]; free: string[] } {
  const ids: string[] = [];
  const free: string[] = [];
  const push = (id: unknown, item?: any) => {
    if (typeof id !== 'string' || !id.trim()) return;
    const s = id.trim();
    ids.push(s);
    if (looksFree(s, item)) free.push(s);
  };

  const walk = (list: unknown[]) => {
    for (const item of list) {
      if (typeof item === 'string') push(item);
      else if (item && typeof item === 'object') {
        push((item as any).id ?? (item as any).name, item);
      }
    }
  };

  if (Array.isArray(payload)) {
    walk(payload);
  } else if (payload && typeof payload === 'object') {
    const data = (payload as any).data;
    if (Array.isArray(data)) walk(data);
    else if (data && typeof data === 'object') {
      push(data.id ?? data.name, data);
    }
    if (Array.isArray((payload as any).models)) walk((payload as any).models);
  }
  return { ids: uniqueSorted(ids), free: uniqueSorted(free) };
}

function parseModelIds(payload: unknown): string[] {
  return parseModelCatalog(payload).ids;
}

function uniqueSorted(ids: string[]): string[] {
  return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));
}

/** Prefer `first` order, then append remaining from `second`. */
function uniqueSortedPrefer(first: string[], second: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...first, ...second]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function buildHeaders(
  apiKey: string | undefined | null,
  format: ProviderWireFormat | undefined,
  baseUrl: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': 'xibecode/models-catalog',
  };
  const key = (apiKey || '').trim();
  if (!key) return headers;

  if (looksAnthropic(baseUrl, format)) {
    // OAuth-style tokens use Bearer; API keys use x-api-key
    if (/^sk-ant-oat/i.test(key) || key.startsWith('eyJ')) {
      headers.Authorization = `Bearer ${key}`;
    } else {
      headers['x-api-key'] = key;
    }
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers.Authorization = `Bearer ${key}`;
    // OpenRouter etiquette
    if (baseUrl.includes('openrouter.ai')) {
      headers['HTTP-Referer'] = 'https://xibecode.dev';
      headers['X-Title'] = 'XibeCode';
    }
  }
  return headers;
}

function curatedFor(provider?: string | null): string[] {
  if (!provider || provider === 'custom') return [];
  const list = CURATED_PROVIDER_MODELS[provider];
  if (list?.length) return [...list];
  const cfg = PROVIDER_CONFIGS[provider as keyof typeof PROVIDER_CONFIGS];
  if (cfg?.defaultModel) return [cfg.defaultModel];
  return [];
}

async function getLiveModelIds(
  url: string,
  apiKey: string | undefined | null,
  format: ProviderWireFormat | undefined,
  baseUrl: string,
  includeNonChat: boolean | undefined,
  timeoutMs: number,
): Promise<{ ids: string[]; free: string[]; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(apiKey, format, baseUrl),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return { ids: [], free: [], error: `GET /models → HTTP ${res.status}` };
    }
    const payload = await res.json().catch(() => null);
    const parsed = parseModelCatalog(payload);
    let ids = parsed.ids;
    let free = parsed.free;
    if (!includeNonChat) {
      ids = ids.filter((id) => !isNonChatModel(id));
      free = free.filter((id) => !isNonChatModel(id));
    }
    return { ids, free };
  } catch (err: any) {
    return {
      ids: [],
      free: [],
      error: err?.name === 'AbortError' ? 'timeout' : err?.message || String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch model ids from a provider's OpenAI/Anthropic-compatible `/models` API.
 * Tries **without** an API key first, then again **with** the key.
 * Free models (from live pricing / `:free`) are sorted to the front.
 */
export async function fetchProviderModels(
  opts: FetchModelsOptions,
): Promise<FetchModelsResult> {
  const baseUrl = normalizeBaseUrl(opts.baseUrl);
  const url = modelsUrl(baseUrl);
  const format = opts.format;
  const provider = opts.provider || undefined;
  const cacheKey = `${provider || ''}|${url}|${(opts.apiKey || '').slice(0, 8)}`;

  if (!opts.forceRefresh) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return {
        models: hit.models,
        free: hit.free,
        source: hit.source,
        url: url || baseUrl,
      };
    }
  }

  if (!url) {
    const fallback = curatedFor(provider);
    return {
      models: fallback,
      source: fallback.length ? 'curated' : 'empty',
      url: '',
      error: 'No base URL configured',
    };
  }

  const timeoutMs = opts.timeoutMs ?? 12_000;
  const anon = await getLiveModelIds(
    url,
    undefined,
    format,
    baseUrl,
    opts.includeNonChat,
    timeoutMs,
  );
  const hasKey = Boolean((opts.apiKey || '').trim());
  const authed = hasKey
    ? await getLiveModelIds(
        url,
        opts.apiKey,
        format,
        baseUrl,
        opts.includeNonChat,
        timeoutMs,
      )
    : { ids: [] as string[], free: [] as string[] };

  const live = uniqueSorted([...anon.ids, ...authed.ids]);
  const free = uniqueSorted([...(anon.free || []), ...(authed.free || [])]);
  const ordered = uniqueSortedPrefer(free, live);
  const error = live.length ? undefined : anon.error || authed.error;

  if (ordered.length) {
    cache.set(cacheKey, { at: Date.now(), models: ordered, free, source: 'live' });
    return {
      models: ordered,
      free,
      source: 'live',
      url,
      error,
      anonymousCount: anon.ids.length,
      authenticatedCount: authed.ids.length,
    };
  }

 // models.dev catalog (messaging gateway primary offline/online database)
  if (provider) {
    try {
      const { modelsDevModelIds } = await import('./models-dev.js');
      const mdev = await modelsDevModelIds(provider);
      if (mdev.length) {
        cache.set(cacheKey, { at: Date.now(), models: mdev, source: 'curated' });
        return {
          models: mdev,
          source: 'curated',
          url,
          error: error || 'Live /models empty; using models.dev catalog',
        };
      }
    } catch {
      /* ignore models.dev failures */
    }
  }

  // Merge curated: prefer curated order, then any extras we might have
  const curated = curatedFor(provider);
  if (curated.length) {
    cache.set(cacheKey, { at: Date.now(), models: curated, source: 'curated' });
    return {
      models: curated,
      source: 'curated',
      url,
      error: error || 'Live catalog empty; using curated fallback',
    };
  }

  const def = provider
    ? PROVIDER_CONFIGS[provider as keyof typeof PROVIDER_CONFIGS]?.defaultModel
    : undefined;
  if (def) {
    return { models: [def], source: 'default', url, error };
  }

  return { models: [], source: 'empty', url, error: error || 'No models' };
}

/**
 * Resolve base URL + format + env key for a known provider id.
 */
export function resolveProviderEndpoint(provider: string): {
  id: string;
  name: string;
  baseUrl: string;
  format: ProviderWireFormat;
  envKey: string;
  defaultModel: string;
} | null {
  if (!provider || provider === 'custom') return null;
  const cfg = PROVIDER_CONFIGS[provider as keyof typeof PROVIDER_CONFIGS];
  if (!cfg) return null;
  return {
    id: provider,
    name: cfg.name,
    baseUrl: cfg.baseUrl,
    format: cfg.format,
    envKey: cfg.envKey,
    defaultModel: cfg.defaultModel,
  };
}

/**
 * List built-in providers (for `xibecode models --providers`).
 */
export function listProviderCatalog(): Array<{
  id: string;
  name: string;
  baseUrl: string;
  format: ProviderWireFormat;
  defaultModel: string;
  envKey: string;
  description?: string;
  source?: 'builtin' | 'models.dev';
}> {
  return (Object.keys(PROVIDER_CONFIGS) as (keyof typeof PROVIDER_CONFIGS)[])
    .map((id) => {
      const cfg = PROVIDER_CONFIGS[id];
      return {
        id,
        name: cfg.name,
        baseUrl: cfg.baseUrl,
        format: cfg.format,
        defaultModel: cfg.defaultModel,
        envKey: cfg.envKey,
        description: (cfg as any).description as string | undefined,
        source: 'builtin' as const,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Built-in providers + full models.dev universe (mega-catalog).
 */
export async function listAllProvidersCatalog(opts?: {
  includeModelsDev?: boolean;
  forceRefresh?: boolean;
}): Promise<
  Array<{
    id: string;
    name: string;
    baseUrl: string;
    format: ProviderWireFormat;
    defaultModel: string;
    envKey: string;
    description?: string;
    source: 'builtin' | 'models.dev';
    modelCount?: number;
  }>
> {
  type Row = {
    id: string;
    name: string;
    baseUrl: string;
    format: ProviderWireFormat;
    defaultModel: string;
    envKey: string;
    description?: string;
    source: 'builtin' | 'models.dev';
    modelCount?: number;
  };

  const out: Row[] = listProviderCatalog().map((p) => ({
    ...p,
    source: 'builtin' as const,
  }));
  if (opts?.includeModelsDev === false) return out;

  const seen = new Set(out.map((p) => p.id.toLowerCase()));
  // also mark common aliases so we don't double-list
  for (const a of [
    'kilo',
    'kilocode',
    'fireworks',
    'fireworks-ai',
    'together',
    'togetherai',
    'google',
    'gemini',
    'opencode',
    'opencode-zen',
    'kimi-coding',
    'kimi-for-coding',
    'xai',
    'grok',
    'hermes',
    'nous',
  ]) {
    seen.add(a);
  }

  try {
    const { listModelsDevProviders, wireFormatFromNpm } = await import('./models-dev.js');
    const mdev = await listModelsDevProviders(opts?.forceRefresh);
    for (const p of mdev) {
      if (seen.has(p.id.toLowerCase())) continue;
      seen.add(p.id.toLowerCase());
      out.push({
        id: p.id,
        name: p.name,
        baseUrl: p.api || '',
        format: wireFormatFromNpm(p.npm),
        defaultModel: p.models.find((m) => m.tool_call)?.id || p.models[0]?.id || '',
        envKey: p.env[0] || '',
        description: `models.dev · ${p.modelCount} models`,
        source: 'models.dev',
        modelCount: p.modelCount,
      });
    }
  } catch {
    /* offline */
  }

  return out.sort((a, b) => {
    if (a.source !== b.source) return a.source === 'builtin' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export type { ProviderType };
