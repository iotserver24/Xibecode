import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import * as fs from 'fs/promises';
import { PlanSessionManager } from '../src/core/plan-session.js';

describe('PlanSessionManager', () => {
  it('creates and updates plan session status', async () => {
    let persisted = '';
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    vi.mocked(fs.writeFile).mockImplementation(async (_path, content) => {
      persisted = String(content);
    });
    vi.mocked(fs.readFile).mockImplementation(async () => persisted as any);

    const manager = new PlanSessionManager('/tmp/xibecode-plan-session-tests');
    const session = await manager.create('Build feature');
    const updated = await manager.updateStatus(session.id, 'approved');
    expect(updated?.status).toBe('approved');
  });
});
