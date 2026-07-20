/**
 * models.dev registry integration (Hermes-style).
 *
 * Community catalog of 100+ providers / 4000+ models:
 *   https://models.dev/api.json
 *
 * Cache: in-memory → disk (~/.xibecode/cache/models_dev.json) → network.
 *
 * @module models-dev
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { ProviderWireFormat } from './types/provider.js';

const MODELS_DEV_URL = 'https://models.dev/api.json';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface ModelsDevModel {
  id: string;
  name?: string;
  tool_call?: boolean;
  reasoning?: boolean;
  attachment?: boolean;
  family?: string;
  /** raw entry for advanced consumers */
  raw?: Record<string, unknown>;
}

export interface ModelsDevProvider {
  id: string;
  name: string;
  /** OpenAI-compatible base URL when present */
  api?: string;
  env: string[];
  doc?: string;
  npm?: string;
  models: ModelsDevModel[];
  modelCount: number;
}

type RawRegistry = Record<string, any>;

let memCache: RawRegistry | null = null;
let memCacheAt = 0;

function xibecodeHome(): string {
  return process.env.XIBECODE_HOME?.trim() || path.join(os.homedir(), '.xibecode');
}

function diskCachePath(): string {
  return path.join(xibecodeHome(), 'cache', 'models_dev.json');
}

async function loadDisk(): Promise<{ data: RawRegistry; mtimeMs: number } | null> {
  try {
    const p = diskCachePath();
    const st = await fs.stat(p);
    const raw = await fs.readFile(p, 'utf-8');
    const data = JSON.parse(raw) as RawRegistry;
    if (!data || typeof data !== 'object') return null;
    return { data, mtimeMs: st.mtimeMs };
  } catch {
    return null;
  }
}

async function saveDisk(data: RawRegistry): Promise<void> {
  try {
    const p = diskCachePath();
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(data), 'utf-8');
  } catch {
    /* ignore */
  }
}

/**
 * Fetch full models.dev registry (provider id → provider object).
 */
export async function fetchModelsDevRegistry(
  forceRefresh = false,
): Promise<RawRegistry> {
  const now = Date.now();
  if (
    !forceRefresh &&
    memCache &&
    now - memCacheAt < CACHE_TTL_MS
  ) {
    return memCache;
  }

  if (!forceRefresh) {
    const disk = await loadDisk();
    if (disk && now - disk.mtimeMs < CACHE_TTL_MS) {
      memCache = disk.data;
      memCacheAt = now;
      return disk.data;
    }
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25_000);
    const res = await fetch(MODELS_DEV_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'xibecode/models-dev',
      },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as RawRegistry;
    if (!data || typeof data !== 'object') throw new Error('invalid JSON');
    memCache = data;
    memCacheAt = Date.now();
    void saveDisk(data);
    return data;
  } catch {
    // Stale disk / mem fallback
    if (memCache) return memCache;
    const disk = await loadDisk();
    if (disk) {
      memCache = disk.data;
      memCacheAt = Date.now();
      return disk.data;
    }
    return {};
  }
}

/** Map models.dev npm package → our wire format. */
export function wireFormatFromNpm(npm?: string): ProviderWireFormat {
  if (!npm) return 'openai';
  if (npm.includes('anthropic')) return 'anthropic';
  // openai, openai-compatible, azure, google-vertex, etc. → openai-style chat
  return 'openai';
}

function parseProvider(id: string, raw: any): ModelsDevProvider {
  const modelsObj = raw?.models && typeof raw.models === 'object' ? raw.models : {};
  const models: ModelsDevModel[] = Object.entries(modelsObj).map(([mid, m]: [string, any]) => ({
    id: (m && typeof m === 'object' && m.id) || mid,
    name: m?.name,
    tool_call: !!m?.tool_call,
    reasoning: !!m?.reasoning,
    attachment: !!m?.attachment,
    family: m?.family,
    raw: m && typeof m === 'object' ? m : undefined,
  }));
  const env = Array.isArray(raw?.env)
    ? raw.env.map(String)
    : raw?.env
      ? [String(raw.env)]
      : [];
  return {
    id: String(raw?.id || id),
    name: String(raw?.name || id),
    api: raw?.api ? String(raw.api).replace(/\/+$/, '') : undefined,
    env,
    doc: raw?.doc ? String(raw.doc) : undefined,
    npm: raw?.npm ? String(raw.npm) : undefined,
    models,
    modelCount: models.length,
  };
}

/**
 * List every provider from models.dev (sorted by name).
 */
export async function listModelsDevProviders(
  forceRefresh = false,
): Promise<ModelsDevProvider[]> {
  const reg = await fetchModelsDevRegistry(forceRefresh);
  const out = Object.entries(reg).map(([id, raw]) => parseProvider(id, raw));
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Lookup one provider by models.dev id (or common alias).
 */
export async function getModelsDevProvider(
  id: string,
  forceRefresh = false,
): Promise<ModelsDevProvider | null> {
  const key = normalizeModelsDevId(id);
  const reg = await fetchModelsDevRegistry(forceRefresh);
  if (reg[key]) return parseProvider(key, reg[key]);
  // case-insensitive
  const found = Object.keys(reg).find((k) => k.toLowerCase() === key.toLowerCase());
  if (found) return parseProvider(found, reg[found]);
  return null;
}

/**
 * Model ids for a models.dev provider (prefer tool-calling chat models).
 */
export async function modelsDevModelIds(
  providerId: string,
  opts?: { toolCallOnly?: boolean; forceRefresh?: boolean },
): Promise<string[]> {
  const p = await getModelsDevProvider(providerId, opts?.forceRefresh);
  if (!p) return [];
  let models = p.models;
  if (opts?.toolCallOnly !== false) {
    const withTools = models.filter((m) => m.tool_call);
    if (withTools.length) models = withTools;
  }
  // drop pure embedding/audio
  models = models.filter((m) => {
    const s = m.id.toLowerCase();
    return !/embed|whisper|tts|dall-?e|moderation|speech/.test(s);
  });
  return models.map((m) => m.id).sort((a, b) => a.localeCompare(b));
}

/**
 * Hermes-style id aliases: our config id ↔ models.dev id.
 */
const TO_MODELS_DEV: Record<string, string> = {
  openrouter: 'openrouter',
  novita: 'novita-ai',
  anthropic: 'anthropic',
  openai: 'openai',
  'openai-codex': 'openai',
  zai: 'zai',
  kimi: 'kimi-for-coding',
  'kimi-coding': 'kimi-for-coding',
  'kimi-coding-cn': 'kimi-for-coding',
  moonshot: 'kimi-for-coding',
  stepfun: 'stepfun',
  minimax: 'minimax',
  'minimax-cn': 'minimax-cn',
  deepseek: 'deepseek',
  alibaba: 'alibaba',
  'alibaba-coding-plan': 'alibaba-coding-plan',
  'qwen-oauth': 'alibaba',
  copilot: 'github-copilot',
  'github-copilot': 'github-copilot',
  'opencode-zen': 'opencode',
  opencode: 'opencode',
  'opencode-go': 'opencode-go',
  kilocode: 'kilo',
  kilo: 'kilo',
  fireworks: 'fireworks-ai',
  'fireworks-ai': 'fireworks-ai',
  huggingface: 'huggingface',
  gemini: 'google',
  google: 'google',
  xai: 'xai',
  grok: 'xai',
  xiaomi: 'xiaomi',
  nvidia: 'nvidia',
  groq: 'groq',
  mistral: 'mistral',
  together: 'togetherai',
  togetherai: 'togetherai',
  perplexity: 'perplexity',
  cohere: 'cohere',
  'ollama-cloud': 'ollama-cloud',
  ollama: 'ollama-cloud',
  lmstudio: 'lmstudio',
  bedrock: 'amazon-bedrock',
  'amazon-bedrock': 'amazon-bedrock',
  cerebras: 'cerebras',
  deepinfra: 'deepinfra',
  upstage: 'upstage',
  'google-vertex': 'google-vertex',
  azure: 'azure',
};

export function normalizeModelsDevId(id: string): string {
  const k = (id || '').trim().toLowerCase();
  return TO_MODELS_DEV[k] || k;
}

/**
 * Resolve API base URL + format + env keys for any provider id
 * (built-in alias or pure models.dev id).
 */
export async function resolveModelsDevEndpoint(id: string): Promise<{
  id: string;
  modelsDevId: string;
  name: string;
  baseUrl: string;
  format: ProviderWireFormat;
  envKeys: string[];
  doc?: string;
  defaultModel?: string;
  modelCount: number;
} | null> {
  const p = await getModelsDevProvider(id);
  if (!p) return null;
  const models = p.models.filter((m) => m.tool_call);
  const defaultModel = (models[0] || p.models[0])?.id;
  return {
    id,
    modelsDevId: p.id,
    name: p.name,
    baseUrl: p.api || '',
    format: wireFormatFromNpm(p.npm),
    envKeys: p.env,
    doc: p.doc,
    defaultModel,
    modelCount: p.modelCount,
  };
}
