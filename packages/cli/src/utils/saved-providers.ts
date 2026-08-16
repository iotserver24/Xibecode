/**
 * Hermes-style saved provider slots: keep keys/URLs for many providers
 * and switch without wiping the others.
 */

export type SavedProviderFormat = 'openai' | 'anthropic';

export interface SavedProvider {
  id: string;
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  format?: SavedProviderFormat;
  label?: string;
}

export function savedProviderId(provider: string, baseUrl?: string): string {
  const p = (provider || 'custom').trim().toLowerCase() || 'custom';
  if (p === 'custom' || p === 'auto') {
    try {
      const host = baseUrl ? new URL(baseUrl).host : '';
      return host ? `custom:${host}` : 'custom';
    } catch {
      return 'custom';
    }
  }
  return p;
}

export function parseSavedProviders(raw: unknown): SavedProvider[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedProvider[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const provider = String(rec.provider || rec.id || '').trim();
    if (!provider) continue;
    const baseUrl = rec.baseUrl != null ? String(rec.baseUrl).trim() : undefined;
    const id =
      String(rec.id || '').trim() || savedProviderId(provider, baseUrl);
    if (seen.has(id)) continue;
    seen.add(id);
    const apiKey = rec.apiKey != null ? String(rec.apiKey).trim() : undefined;
    const format =
      rec.format === 'anthropic' ? 'anthropic' : rec.format === 'openai' ? 'openai' : undefined;
    const model = rec.model != null ? String(rec.model).trim() : undefined;
    const label = rec.label != null ? String(rec.label).trim() : undefined;
    out.push({
      id,
      provider,
      apiKey: apiKey || undefined,
      baseUrl: baseUrl || undefined,
      model: model || undefined,
      format,
      label: label || undefined,
    });
  }
  return out;
}

export function upsertSavedProvider(
  list: SavedProvider[],
  slot: SavedProvider,
): SavedProvider[] {
  const id = slot.id || savedProviderId(slot.provider, slot.baseUrl);
  const next: SavedProvider = { ...slot, id };
  const idx = list.findIndex((s) => s.id === id);
  if (idx < 0) return [...list, next];
  const prev = list[idx]!;
  const merged: SavedProvider = {
    ...prev,
    ...next,
    apiKey: next.apiKey || prev.apiKey,
    baseUrl: next.baseUrl ?? prev.baseUrl,
    model: next.model ?? prev.model,
    format: next.format ?? prev.format,
    label: next.label ?? prev.label,
  };
  return list.map((s, i) => (i === idx ? merged : s));
}

export function removeSavedProvider(
  list: SavedProvider[],
  id: string,
): SavedProvider[] {
  return list.filter((s) => s.id !== id && s.provider !== id);
}

export function slotFromActive(input: {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  format?: SavedProviderFormat;
  label?: string;
}): SavedProvider | null {
  const provider =
    (input.provider || '').trim() || (input.baseUrl?.trim() ? 'custom' : '');
  if (!provider && !input.apiKey?.trim()) return null;
  const id = savedProviderId(provider || 'custom', input.baseUrl);
  return {
    id,
    provider: provider || 'custom',
    apiKey: input.apiKey?.trim() || undefined,
    baseUrl: input.baseUrl?.trim() || undefined,
    model: input.model?.trim() || undefined,
    format: input.format,
    label: input.label?.trim() || undefined,
  };
}

export function ensureCurrentSlot(
  list: SavedProvider[],
  current: SavedProvider | null,
): SavedProvider[] {
  if (!current) return list;
  return upsertSavedProvider(list, current);
}

export function findSavedProvider(
  list: SavedProvider[],
  idOrProvider: string,
): SavedProvider | undefined {
  const key = idOrProvider.trim();
  if (!key) return undefined;
  return list.find((s) => s.id === key || s.provider === key);
}

export function savedProviderLabel(slot: SavedProvider): string {
  if (slot.label?.trim()) return slot.label.trim();
  const name = slot.provider || slot.id;
  return slot.model ? `${name} · ${slot.model}` : name;
}
