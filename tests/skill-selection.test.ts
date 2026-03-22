import { describe, it, expect } from 'vitest';
import {
  extractDepTokens,
  selectRelevantBuiltInSkills,
  scoreSkillRelevance,
  tokenizeTaskPrompt,
} from '../src/core/skill-selection.js';
import type { SkillLike } from '../src/core/skill-selection.js';

const sampleSkills: SkillLike[] = [
  {
    name: 'sandbox-autonomous',
    description: 'Safe autonomous runs',
    instructions: 'body',
    tags: ['sandbox'],
  },
  {
    name: 'react-next-patterns',
    description: 'React and Next.js',
    instructions: 'body',
    tags: ['react', 'nextjs'],
  },
  {
    name: 'write-tests',
    description: 'Testing',
    instructions: 'body',
    tags: ['testing'],
  },
  {
    name: 'security-audit',
    description: 'Security review',
    instructions: 'body',
    tags: ['security'],
  },
];

describe('skill-selection', () => {
  it('extractDepTokens includes scoped package short names', () => {
    const t = extractDepTokens({
      dependencies: { '@scope/my-lib': '^1.0.0', react: '^18' },
      devDependencies: { typescript: '^5' },
    });
    expect(t.has('react')).toBe(true);
    expect(t.has('@scope/my-lib')).toBe(true);
    expect(t.has('my-lib')).toBe(true);
  });

  it('scores prompt keywords toward matching skills', () => {
    const promptTokens = tokenizeTaskPrompt('Add unit tests for the login flow');
    const s = scoreSkillRelevance(sampleSkills[2], promptTokens, new Set());
    expect(s).toBeGreaterThan(0);
  });

  it('selectRelevantBuiltInSkills always includes core and boosts deps + prompt', () => {
    const deps = extractDepTokens({ dependencies: { react: '^18', next: '^14' } });
    const selected = selectRelevantBuiltInSkills(
      sampleSkills,
      'Refactor the Next.js page components',
      deps,
      { maxSkills: 4, minSkills: 3, minScore: 2 }
    );
    expect(selected.map((s) => s.name)).toContain('sandbox-autonomous');
    expect(selected.map((s) => s.name)).toContain('react-next-patterns');
  });
});
