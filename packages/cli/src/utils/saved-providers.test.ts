import { describe, expect, it } from 'vitest';
import {
  ensureCurrentSlot,
  findSavedProvider,
  parseSavedProviders,
  removeSavedProvider,
  savedProviderId,
  savedProviderLabel,
  slotFromActive,
  upsertSavedProvider,
} from './saved-providers.js';

describe('saved providers', () => {
  it('ids built-in providers by slug and custom by host', () => {
    expect(savedProviderId('OpenRouter')).toBe('openrouter');
    expect(savedProviderId('custom', 'https://api.example.com/v1')).toBe(
      'custom:api.example.com',
    );
  });

  it('keeps two slots when upserting a different provider', () => {
    const nous = slotFromActive({
      provider: 'nous',
      apiKey: 'sk-nous',
      model: 'hermes-3',
    })!;
    const or = slotFromActive({
      provider: 'openrouter',
      apiKey: 'sk-or',
      model: 'openrouter/free',
    })!;
    const list = upsertSavedProvider(upsertSavedProvider([], nous), or);
    expect(list).toHaveLength(2);
    expect(findSavedProvider(list, 'nous')?.apiKey).toBe('sk-nous');
    expect(findSavedProvider(list, 'openrouter')?.model).toBe('openrouter/free');
  });

  it('does not wipe the previous key when updating the same slot without a key', () => {
    const first = slotFromActive({ provider: 'nous', apiKey: 'sk-nous', model: 'a' })!;
    const update = slotFromActive({ provider: 'nous', model: 'b' })!;
    const list = upsertSavedProvider([first], update);
    expect(list).toHaveLength(1);
    expect(list[0]?.apiKey).toBe('sk-nous');
    expect(list[0]?.model).toBe('b');
  });

  it('synthesizes the active slot into an empty list', () => {
    const current = slotFromActive({
      provider: 'anthropic',
      apiKey: 'sk-ant',
    });
    expect(ensureCurrentSlot([], current)).toHaveLength(1);
  });

  it('parses and removes by id or provider', () => {
    const list = parseSavedProviders([
      { provider: 'nous', apiKey: 'a' },
      { id: 'openrouter', provider: 'openrouter', apiKey: 'b' },
      { foo: 'nope' },
    ]);
    expect(list.map((s) => s.id)).toEqual(['nous', 'openrouter']);
    expect(removeSavedProvider(list, 'nous')).toHaveLength(1);
    expect(savedProviderLabel(list[0]!)).toBe('nous');
  });
});
