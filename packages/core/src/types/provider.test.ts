import { describe, expect, it } from 'vitest';
import {
  PROVIDER_CONFIGS,
  listSetupProviders,
  resolveProviderEnvApiKey,
} from './provider.js';
import {
  CUSTOM_MODEL_VALUE,
  parseModelCatalog,
  withCustomModelOption,
} from '../models-catalog.js';

describe('nous provider', () => {
  it('registers Nous as OpenAI-compat at the public inference API', () => {
    expect(PROVIDER_CONFIGS.nous.baseUrl).toBe(
      'https://inference-api.nousresearch.com/v1',
    );
    expect(PROVIDER_CONFIGS.nous.format).toBe('openai');
    expect(PROVIDER_CONFIGS.nous.envKey).toBe('NOUS_API_KEY');
    expect(PROVIDER_CONFIGS.nous.envKeys).toContain('HERMES_API_KEY');
    expect(PROVIDER_CONFIGS.hermes.baseUrl).toBe(PROVIDER_CONFIGS.nous.baseUrl);
  });

  it('lists nous near the front of setup', () => {
    const ids = listSetupProviders().map((p) => p.id);
    expect(ids.indexOf('nous')).toBeLessThan(ids.indexOf('openrouter'));
    expect(ids.indexOf('nous')).toBeLessThan(ids.indexOf('hermes'));
  });

  it('accepts NOUS_API_KEY or HERMES_API_KEY', () => {
    expect(resolveProviderEnvApiKey('nous', { NOUS_API_KEY: 'nk' })).toBe('nk');
    expect(resolveProviderEnvApiKey('nous', { HERMES_API_KEY: 'hk' })).toBe(
      'hk',
    );
  });
});

describe('parseModelCatalog', () => {
  it('detects free models from :free and $0 pricing, not a hardcoded list', () => {
    const { ids, free } = parseModelCatalog({
      data: [
        {
          id: 'vendor/new-free-model:free',
          pricing: { prompt: '0', completion: '0' },
        },
        {
          id: 'vendor/paid-model',
          pricing: { prompt: '0.0001', completion: '0.0002' },
        },
        { id: 'vendor/zero-price', pricing: { prompt: 0, completion: 0 } },
      ],
    });
    expect(ids).toEqual([
      'vendor/new-free-model:free',
      'vendor/paid-model',
      'vendor/zero-price',
    ].sort());
    expect(free).toContain('vendor/new-free-model:free');
    expect(free).toContain('vendor/zero-price');
    expect(free).not.toContain('vendor/paid-model');
  });

  it('appends a custom-model sentinel for pickers', () => {
    expect(withCustomModelOption(['a', 'b'])).toEqual([
      'a',
      'b',
      CUSTOM_MODEL_VALUE,
    ]);
  });
});
