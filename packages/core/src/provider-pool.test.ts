import { describe, it, expect } from 'vitest';
import {
  ProviderPool,
  parseFallbackProviders,
  shouldFailoverProvider,
} from './provider-pool.js';

describe('ProviderPool', () => {
  it('rotates across endpoints', () => {
    const pool = ProviderPool.fromPrimaryAndFallbacks(
      { apiKey: 'k1', model: 'm1', provider: 'anthropic' },
      [{ apiKey: 'k2', model: 'm2', provider: 'openrouter' }],
    );
    expect(pool.size()).toBe(2);
    expect(pool.current().model).toBe('m1');
    const next = pool.rotate('test');
    expect(next?.model).toBe('m2');
  });

  it('stops after max cycles', () => {
    const pool = new ProviderPool(
      [
        { apiKey: 'a', model: 'm1' },
        { apiKey: 'b', model: 'm2' },
      ],
      { maxCycles: 1 },
    );
    pool.rotate(); // to m2
    const exhausted = pool.rotate(); // back to m1, cycle complete
    expect(exhausted).toBeNull();
  });
});

describe('parseFallbackProviders', () => {
  it('parses pipe-delimited env string', () => {
    const list = parseFallbackProviders(
      undefined,
      'openrouter|anthropic/claude-sonnet-4|sk-or-test',
    );
    expect(list).toHaveLength(1);
    expect(list[0]!.provider).toBe('openrouter');
    expect(list[0]!.model).toBe('anthropic/claude-sonnet-4');
  });

  it('parses object array', () => {
    const list = parseFallbackProviders([
      { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-x' },
    ]);
    expect(list[0]!.model).toBe('gpt-4o');
  });
});

describe('shouldFailoverProvider', () => {
  it('detects rate limits and network errors', () => {
    expect(shouldFailoverProvider({ status: 429 })).toBe(true);
    expect(shouldFailoverProvider(new Error('socket hang up'))).toBe(true);
    expect(shouldFailoverProvider({ status: 400, message: 'bad request' })).toBe(false);
  });
});
