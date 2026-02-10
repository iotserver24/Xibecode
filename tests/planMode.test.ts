import { describe, it, expect, vi } from 'vitest';
import { PlanMode } from '../src/core/planMode.js';
import * as fs from 'fs/promises';

vi.mock('fs/promises');

describe('PlanMode', () => {
  const rootDir = '/project';
  const planMode = new PlanMode(rootDir);

  it('classifies short single-step tasks as small', () => {
    const small = 'Rename function foo to bar in src/index.ts';
    expect(planMode.isLargeTask(small)).toBe(false);
  });

  it('classifies obvious multi-step tasks as large', () => {
    const large = 'Step 1: Implement authentication. Step 2: Add tests. Step 3: Refactor the UI.';
    expect(planMode.isLargeTask(large)).toBe(true);
  });

  it('buildPlan creates tasks and writes todo.md', async () => {
    const text = [
      '- Implement authentication',
      '- Add tests',
      '- Refactor the UI',
    ].join('\n');

    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const result = await planMode.buildPlan(text);
    expect(result.tasks.length).toBeGreaterThanOrEqual(2);
    expect(result.doc.pending.length).toBeGreaterThanOrEqual(2);
  });
});

