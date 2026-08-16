/**
 * Resolve a model's context window the way Hermes does:
 * models.dev registry (limit.context) → disk cache → family heuristics → fallback.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { fetchModelsDevRegistry } from './models-dev.js';

export type ContextWindowSource = 'cache' | 'models.dev' | 'heuristic' | 'fallback';

export interface ContextWindowInfo {
  tokens: number;
  source: ContextWindowSource;
  model: string;
}

const FALLBACK_WINDOW = 128_000;
const CACHE_FILE = 'context-windows.json';

function xibecodeHome(): string {
  return process.env.XIBECODE_HOME?.trim() || path.join(os.homedir(), '.xibecode');
}

function cachePath(): string {
  return path.join(xibecodeHome(), 'cache', CACHE_FILE);
}

function normalizeModelId(model: string): string {
  return String(model || '')
    .trim()
    .toLowerCase()
    .replace(/^models\//, '')
    .replace(/^openai\//, '')
    .replace(/^anthropic\//, '')
    .replace(/^google\//, '')
    .replace(/^x-ai\//, '')
    .replace(/^xai\//, '');
}

export function extractContextLimit(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0;
  const rec = raw as Record<string, unknown>;
  const limit = rec.limit;
  if (limit && typeof limit === 'object') {
    const ctx = (limit as Record<string, unknown>).context;
    if (typeof ctx === 'number' && ctx > 0) return Math.floor(ctx);
  }
  if (typeof rec.context === 'number' && rec.context > 0) return Math.floor(rec.context);
  if (typeof rec.context_length === 'number' && rec.context_length > 0) {
    return Math.floor(rec.context_length);
  }
  return 0;
}

/** Hermes-style family table: longest / most specific pattern first. */
export function heuristicContextWindow(model: string): number {
  const m = normalizeModelId(model);
  if (!m) return FALLBACK_WINDOW;

  if (m.includes('claude') && (m.includes('1m') || m.includes('1000k'))) return 1_000_000;
  if (m.includes('gemini') && (m.includes('2.5') || m.includes('2.0') || m.includes('1.5') || m.includes('pro') || m.includes('flash'))) {
    if (m.includes('lite') && m.includes('3.1')) return 32_768;
    if (m.includes('image') || m.includes('tts')) return 32_768;
    return 1_000_000;
  }
  if (m.includes('gpt-4.1') || m.includes('gpt-4o') || m.includes('gpt-4-turbo')) return 128_000;
  if (m.includes('gpt-5') || m.includes('o3') || m.includes('o1') || m.includes('o4')) return 200_000;
  if (m.includes('claude')) return 200_000;
  if (m.includes('deepseek')) return 128_000;
  if (m.includes('qwen') && (m.includes('2.5') || m.includes('3'))) return 128_000;
  if (m.includes('qwen')) return 32_768;
  if (m.includes('kimi') || m.includes('moonshot')) return 128_000;
  if (m.includes('glm') || m.includes('zhipu')) return 128_000;
  if (m.includes('mistral') || m.includes('mixtral') || m.includes('codestral')) return 128_000;
  if (m.includes('llama-3.1') || m.includes('llama-3.2') || m.includes('llama-3.3') || m.includes('llama4')) {
    return 128_000;
  }
  if (m.includes('grok')) return 131_072;
  if (m.includes('gpt-4') && !m.includes('turbo') && !m.includes('4o')) return 8_192;
  if (m.includes('gpt-3.5')) return 16_384;
  return FALLBACK_WINDOW;
}

async function readCache(): Promise<Record<string, number>> {
  try {
    const raw = await fs.readFile(cachePath(), 'utf-8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (typeof v === 'number' && v > 0) out[k] = Math.floor(v);
    }
    return out;
  } catch {
    return {};
  }
}

async function writeCache(model: string, tokens: number): Promise<void> {
  if (!model || tokens <= 0) return;
  try {
    const dir = path.dirname(cachePath());
    await fs.mkdir(dir, { recursive: true });
    const cur = await readCache();
    cur[normalizeModelId(model)] = tokens;
    await fs.writeFile(cachePath(), JSON.stringify(cur));
  } catch {
    /* ignore */
  }
}

export async function lookupModelsDevContext(model: string): Promise<number> {
  const want = normalizeModelId(model);
  if (!want) return 0;
  const reg = await fetchModelsDevRegistry();
  let best = 0;
  let bestScore = 0;
  for (const rawProv of Object.values(reg)) {
    const models = (rawProv as { models?: Record<string, unknown> })?.models;
    if (!models || typeof models !== 'object') continue;
    for (const [mid, entry] of Object.entries(models)) {
      const rawId =
        entry && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string'
          ? String((entry as { id: string }).id)
          : mid;
      const id = normalizeModelId(rawId);
      if (!id) continue;
      let score = 0;
      if (id === want) score = 100;
      else if (want.endsWith(id) || id.endsWith(want)) score = 80;
      else if (want.includes(id) || id.includes(want)) score = 40;
      if (score === 0) continue;
      const limit = extractContextLimit(entry);
      if (limit > 0 && score > bestScore) {
        best = limit;
        bestScore = score;
      }
    }
  }
  return bestScore >= 40 ? best : 0;
}

export async function resolveContextWindow(model: string): Promise<ContextWindowInfo> {
  const id = normalizeModelId(model) || 'unknown';
  const cached = (await readCache())[id];
  if (cached && cached > 0) {
    return { tokens: cached, source: 'cache', model };
  }

  try {
    const fromReg = await lookupModelsDevContext(model);
    if (fromReg > 0) {
      void writeCache(model, fromReg);
      return { tokens: fromReg, source: 'models.dev', model };
    }
  } catch {
    /* network / parse — fall through */
  }

  const heur = heuristicContextWindow(model);
  if (heur !== FALLBACK_WINDOW) {
    return { tokens: heur, source: 'heuristic', model };
  }
  return { tokens: FALLBACK_WINDOW, source: 'fallback', model };
}

export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n < 1000) return String(Math.round(n));
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
}

export function usagePercent(used: number, max: number): number {
  if (!max || max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((used / max) * 100)));
}
