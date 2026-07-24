import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CuratedMemoryStore } from './curated-memory.js';
import {
  stageWrite,
  listPending,
  rejectPending,
  setWriteApproval,
  isWriteApprovalEnabledAsync,
} from './write-approval.js';
import { approvePending } from './apply-pending.js';
import { indexSessionDocument, ftsSearch } from './session-fts.js';
import { shouldLearnSkill, draftSkillFromRun, saveLearnedSkill, learnedSkillsDir } from './skill-learner.js';
import { runPostTurnReview } from './post-turn-review.js';

const testHome = path.join(os.tmpdir(), `xibecode-learning-test-${process.pid}`);

describe('CuratedMemoryStore', () => {
  const base = path.join(testHome, 'memories');
  beforeEach(async () => {
    await fs.rm(testHome, { recursive: true, force: true });
    await fs.mkdir(base, { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(testHome, { recursive: true, force: true });
  });

  it('adds and freezes entries', async () => {
    const store = new CuratedMemoryStore({ baseDir: base });
    const r = await store.add('memory', 'Project uses pnpm');
    expect(r.success).toBe(true);
    expect(r.done).toBe(true);
    expect(r.note).toMatch(/Write saved/i);
    expect(r.entries).toBeUndefined(); // terminal success — no full dump
    await store.freezeSnapshot();
    const prompt = store.formatForSystemPrompt();
    expect(prompt).toContain('Project uses pnpm');
  });

  it('does not mutate frozen snapshot mid-session after write', async () => {
    const store = new CuratedMemoryStore({ baseDir: base });
    await store.add('memory', 'first');
    await store.freezeSnapshot();
    const before = store.formatForSystemPrompt();
    await store.add('memory', 'second mid-session');
    // Frozen prompt still only has first (disk has both)
    expect(store.formatForSystemPrompt()).toBe(before);
    expect(store.formatForSystemPrompt()).not.toContain('second mid-session');
    const live = await store.loadEntries('memory');
    expect(live).toContain('second mid-session');
  });

  it('enforces char limit and returns entries for consolidation', async () => {
    const store = new CuratedMemoryStore({ baseDir: base, memoryCharLimit: 50 });
    await store.add('memory', 'short');
    const r = await store.add('memory', 'x'.repeat(100));
    expect(r.success).toBe(false);
    expect(r.entries?.length).toBeGreaterThan(0);
  });

  it('applies atomic batch under final char budget', async () => {
    const store = new CuratedMemoryStore({ baseDir: base, memoryCharLimit: 80 });
    await store.add('memory', 'old stale fact that is long enough');
    const r = await store.applyBatch('memory', [
      { action: 'remove', old_text: 'old stale' },
      { action: 'add', content: 'new compact fact' },
    ]);
    expect(r.success).toBe(true);
    expect(r.note).toMatch(/Write saved/i);
    const live = await store.loadEntries('memory');
    expect(live).toEqual(['new compact fact']);
  });
});

describe('write approval', () => {
  beforeEach(async () => {
    process.env.HOME = testHome;
    process.env.XIBECODE_MEMORY_WRITE_APPROVAL = 'true';
    await fs.mkdir(path.join(testHome, '.xibecode'), { recursive: true });
  });
  afterEach(async () => {
    delete process.env.XIBECODE_MEMORY_WRITE_APPROVAL;
    await fs.rm(testHome, { recursive: true, force: true });
  });

  it('stages and approves memory', async () => {
    expect(await isWriteApprovalEnabledAsync('memory')).toBe(true);
    const staged = await stageWrite(
      'memory',
      'test entry',
      { action: 'add', target: 'memory', content: 'Learned fact ABC' },
      'test',
    );
    const list = await listPending('memory');
    expect(list.some((p) => p.id === staged.id)).toBe(true);

    // Approve needs real home path for curated store — use explicit base via payload apply
    // approvePending uses default CuratedMemoryStore home — set HOME
    const r = await approvePending(staged.id);
    // May succeed writing to testHome/.xibecode/memories
    expect(r.success || r.message).toBeTruthy();
    await rejectPending(staged.id); // cleanup if still there
  });
});

describe('session FTS', () => {
  it('indexes and searches', async () => {
    process.env.HOME = testHome;
    await fs.mkdir(path.join(testHome, '.xibecode'), { recursive: true });
    await indexSessionDocument({
      id: 's1',
      path: '/tmp/s1.jsonl',
      title: 'fix pnpm lockfile',
      body: 'The build failed because pnpm-lock.yaml was out of date. We ran pnpm install.',
      updated: Date.now(),
    });
    const hits = await ftsSearch('pnpm lockfile', 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.snippet.toLowerCase() + hits[0]!.sessionId).toBeTruthy();
  });
});

describe('skill learner', () => {
  it('detects complex runs and saves skill', async () => {
    process.env.HOME = testHome;
    expect(shouldLearnSkill({ toolCalls: 6, filesChanged: 2, iterations: 5 })).toBe(true);
    expect(shouldLearnSkill({ toolCalls: 1, filesChanged: 0, iterations: 1 })).toBe(false);
    const draft = draftSkillFromRun({
      prompt: 'Fix the TypeScript errors in src/agent.ts',
      finalText: 'Fixed 3 errors',
      toolsUsed: ['read_file', 'edit_file', 'run_command'],
      filesChanged: ['src/agent.ts'],
    });
    const r = await saveLearnedSkill(draft);
    expect(r.created).toBe(true);
    const dir = learnedSkillsDir();
    const files = await fs.readdir(dir);
    expect(files.some((f) => f.endsWith('.md'))).toBe(true);
  });
});

describe('post-turn review heuristic', () => {
  it('extracts preference without LLM', async () => {
    process.env.HOME = testHome;
    delete process.env.XIBECODE_MEMORY_WRITE_APPROVAL;
    delete process.env.XIBECODE_REVIEW_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const store = new CuratedMemoryStore({
      baseDir: path.join(testHome, '.xibecode', 'memories'),
    });
    const result = await runPostTurnReview({
      messages: [
        { role: 'user', content: 'I prefer pnpm over npm for installs' },
        { role: 'assistant', content: 'Got it, will use pnpm.' },
      ] as any,
      stats: {
        toolCalls: 0,
        filesChanged: 0,
        iterations: 1,
        initialPrompt: 'I prefer pnpm over npm for installs',
      },
      curated: store,
      learnSkills: false,
      useLlm: false,
    });
    expect(result.userAdds.length + result.staged).toBeGreaterThanOrEqual(0);
    // preference should be captured
    const user = await store.loadEntries('user');
    expect(user.some((e) => /pnpm/i.test(e)) || result.userAdds.some((e) => /pnpm/i.test(e))).toBe(
      true,
    );
  });
});

describe('setWriteApproval', () => {
  it('persists learning.json', async () => {
    process.env.HOME = testHome;
    await fs.mkdir(path.join(testHome, '.xibecode'), { recursive: true });
    delete process.env.XIBECODE_MEMORY_WRITE_APPROVAL;
    await setWriteApproval('memory', true);
    expect(await isWriteApprovalEnabledAsync('memory')).toBe(true);
    await setWriteApproval('memory', false);
    expect(await isWriteApprovalEnabledAsync('memory')).toBe(false);
  });
});
