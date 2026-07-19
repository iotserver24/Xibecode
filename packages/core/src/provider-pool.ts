/**
 * Provider pool — multi-endpoint failover for higher connection reliability.
 *
 * Provider credential pool and fallback endpoints:
 * when the primary API key is rate-limited or a provider is down, rotate
 * to the next credential or fall over to an alternate provider/model.
 *
 * @module provider-pool
 */

import type { ProviderType } from './types/provider.js';

/** A single inference endpoint (provider + credentials + model). */
export interface ProviderEndpoint {
  /** Logical name for logs (e.g. "primary", "openrouter-backup"). */
  id?: string;
  apiKey: string;
  model: string;
  provider?: ProviderType;
  baseUrl?: string;
  /** Wire protocol override. */
  requestFormat?: 'auto' | 'openai' | 'anthropic';
  customProviderFormat?: 'openai' | 'anthropic';
}

/** Runtime state for rotating through endpoints. */
export class ProviderPool {
  private endpoints: ProviderEndpoint[];
  private index = 0;
  /** How many times we've fully cycled the pool for the current turn. */
  private cycles = 0;
  private readonly maxCycles: number;

  constructor(endpoints: ProviderEndpoint[], options?: { maxCycles?: number }) {
    if (!endpoints.length) {
      throw new Error('ProviderPool requires at least one endpoint');
    }
    this.endpoints = endpoints.map((e, i) => ({
      ...e,
      id: e.id || `endpoint-${i}`,
    }));
    this.maxCycles = options?.maxCycles ?? 2;
  }

  /** Current active endpoint. */
  current(): ProviderEndpoint {
    return this.endpoints[this.index]!;
  }

  /** Total endpoints in the pool. */
  size(): number {
    return this.endpoints.length;
  }

  /** Index of the active endpoint (0-based). */
  currentIndex(): number {
    return this.index;
  }

  /**
   * Rotate to the next endpoint. Returns null if the pool has been fully
   * exhausted for maxCycles (avoid infinite thrashing).
   */
  rotate(reason?: string): ProviderEndpoint | null {
    if (this.endpoints.length <= 1) {
      return null;
    }
    const prev = this.current();
    this.index = (this.index + 1) % this.endpoints.length;
    if (this.index === 0) {
      this.cycles += 1;
      if (this.cycles >= this.maxCycles) {
        return null;
      }
    }
    const next = this.current();
    void reason;
    void prev;
    return next;
  }

  /** Reset cycle counter (e.g. after a successful API call). */
  markSuccess(): void {
    this.cycles = 0;
  }

  /** Snapshot of remaining fallback endpoints after the current one. */
  remaining(): ProviderEndpoint[] {
    if (this.endpoints.length <= 1) return [];
    const out: ProviderEndpoint[] = [];
    for (let i = 1; i < this.endpoints.length; i++) {
      out.push(this.endpoints[(this.index + i) % this.endpoints.length]!);
    }
    return out;
  }

  /** Build a pool from primary config + optional fallback list. */
  static fromPrimaryAndFallbacks(
    primary: ProviderEndpoint,
    fallbacks: ProviderEndpoint[] = [],
  ): ProviderPool {
    const seen = new Set<string>();
    const list: ProviderEndpoint[] = [];
    const keyOf = (e: ProviderEndpoint) =>
      `${e.provider || ''}|${e.baseUrl || ''}|${e.model}|${e.apiKey.slice(0, 8)}`;

    for (const e of [primary, ...fallbacks]) {
      if (!e.apiKey?.trim() || !e.model?.trim()) continue;
      const k = keyOf(e);
      if (seen.has(k)) continue;
      seen.add(k);
      list.push(e);
    }
    if (!list.length) {
      throw new Error('No valid provider endpoints (missing apiKey/model)');
    }
    return new ProviderPool(list);
  }
}

/**
 * Parse fallback provider specs from config / env.
 *
 * Accepts objects or colon-delimited strings:
 *   "openrouter:anthropic/claude-sonnet-4:sk-or-..."
 *   { provider, model, apiKey, baseUrl? }
 */
export function parseFallbackProviders(
  raw: unknown,
  envFallback?: string,
): ProviderEndpoint[] {
  const out: ProviderEndpoint[] = [];

  const push = (item: unknown, idx: number) => {
    if (!item) return;
    if (typeof item === 'string') {
      const parts = item.split(':');
      // provider:model:apiKey  OR  provider:model:apiKey:baseUrl
      // model may contain slashes (openrouter style) — split carefully
      // Format: provider|model|apiKey|baseUrl?  preferred
      if (item.includes('|')) {
        const [provider, model, apiKey, baseUrl] = item.split('|').map((s) => s.trim());
        if (provider && model && apiKey) {
          out.push({
            id: `fallback-${idx}`,
            provider: provider as ProviderType,
            model,
            apiKey,
            baseUrl: baseUrl || undefined,
          });
        }
        return;
      }
      if (parts.length >= 3) {
        const provider = parts[0]!.trim() as ProviderType;
        const apiKey = parts[parts.length - 1]!.trim();
        const model = parts.slice(1, -1).join(':').trim();
        if (provider && model && apiKey) {
          out.push({ id: `fallback-${idx}`, provider, model, apiKey });
        }
      }
      return;
    }
    if (typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const apiKey = String(o.apiKey || o.api_key || '').trim();
      const model = String(o.model || '').trim();
      if (!apiKey || !model) return;
      out.push({
        id: String(o.id || `fallback-${idx}`),
        apiKey,
        model,
        provider: (o.provider as ProviderType) || undefined,
        baseUrl: o.baseUrl ? String(o.baseUrl) : o.base_url ? String(o.base_url) : undefined,
        requestFormat: o.requestFormat as ProviderEndpoint['requestFormat'],
        customProviderFormat: o.customProviderFormat as ProviderEndpoint['customProviderFormat'],
      });
    }
  };

  if (Array.isArray(raw)) {
    raw.forEach((item, i) => push(item, i));
  } else if (raw && typeof raw === 'object') {
    push(raw, 0);
  }

  if (envFallback?.trim()) {
    // Comma-separated list of pipe-delimited endpoints
    envFallback
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s, i) => push(s, out.length + i));
  }

  return out;
}

/** Whether an error should trigger provider/credential failover (not just same-endpoint retry). */
export function shouldFailoverProvider(err: unknown): boolean {
  if (!err) return false;
  const e = err as any;
  const status = e.status ?? e.statusCode ?? e.httpStatus ?? e.error?.status;
  if (typeof status === 'number') {
    // Auth and hard quota → try another key/provider
    if (status === 401 || status === 403 || status === 402 || status === 429) return true;
    if (status === 500 || status === 502 || status === 503 || status === 504) return true;
  }
  const msg = String(e.message || err || '').toLowerCase();
  return (
    msg.includes('rate limit') ||
    msg.includes('overloaded') ||
    msg.includes('capacity') ||
    msg.includes('insufficient') ||
    msg.includes('quota') ||
    msg.includes('unauthorized') ||
    msg.includes('invalid api key') ||
    msg.includes('authentication') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    msg.includes('fetch failed') ||
    msg.includes('inactivity timeout') ||
    msg.includes('empty response') ||
    msg.includes('service unavailable') ||
    msg.includes('temporarily unavailable')
  );
}
