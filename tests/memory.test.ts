import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import * as fs from 'fs/promises';
import { NeuralMemory } from '../src/core/memory.js';

describe('NeuralMemory', () => {
  it('retrieves promoted memory entries', async () => {
    let promotionStore = '';
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    vi.mocked(fs.writeFile).mockImplementation(async (_path, content) => {
      promotionStore = String(content);
    });
    vi.mocked(fs.readFile).mockImplementation(async () => promotionStore as any);

    const memory = new NeuralMemory('/tmp/xibecode-memory-tests');
    await memory.promoteMemory('package_manager', 'use pnpm only');
    const results = await memory.retrieve('pnpm', 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.outcome.toLowerCase()).toContain('pnpm');
  });
});
