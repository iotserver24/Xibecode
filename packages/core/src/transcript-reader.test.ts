/**
 * Tests for the transcript reader module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  loadTranscriptFile,
  findMainConversationTip,
  buildConversationChain,
  readHeadAndTail,
  extractFirstPromptFromHead,
  listCandidateFiles,
  readFileTailSync,
} from './transcript-reader.js';
import type { Entry, TranscriptMessage } from './transcript-types.js';
import { generateUuid, isTranscriptMessage } from './transcript-types.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xibecode-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeEntry(type: string, parentUuid: string | null = null, overrides?: Partial<Entry>): Entry {
  return {
    type: type as Entry['type'],
    uuid: generateUuid(),
    parentUuid,
    timestamp: new Date().toISOString(),
    sessionId: 'test-session',
    ...overrides,
  } as Entry;
}

async function writeJsonl(filePath: string, entries: Entry[]): Promise<void> {
  const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, lines, 'utf-8');
}

describe('loadTranscriptFile', () => {
  it('should load an empty file', async () => {
    const filePath = path.join(tmpDir, 'empty.jsonl');
    await fs.writeFile(filePath, '', 'utf-8');

    const result = await loadTranscriptFile(filePath);
    expect(result.entries.length).toBe(0);
    expect(result.byUuid.size).toBe(0);
  });

  it('should load entries and build uuid map', async () => {
    const entries = [makeEntry('user'), makeEntry('assistant'), makeEntry('user')];
    const filePath = path.join(tmpDir, 'basic.jsonl');
    await writeJsonl(filePath, entries);

    const result = await loadTranscriptFile(filePath);
    expect(result.entries.length).toBe(3);
    expect(result.byUuid.size).toBe(3);
  });

  it('should identify leaf nodes', async () => {
    const uuid1 = generateUuid();
    const uuid2 = generateUuid();
    const uuid3 = generateUuid();

    const entries: Entry[] = [
      makeEntry('user', null, { uuid: uuid1 } as Partial<Entry>),
      makeEntry('assistant', uuid1, { uuid: uuid2 } as Partial<Entry>),
      makeEntry('user', uuid2, { uuid: uuid3 } as Partial<Entry>),
    ];

    const filePath = path.join(tmpDir, 'chain.jsonl');
    await writeJsonl(filePath, entries);

    const result = await loadTranscriptFile(filePath);
    // Only uuid3 should be a leaf (no other entry points to it as parent)
    expect(result.leafUuids.size).toBe(1);
    expect(result.leafUuids.has(uuid3 as any)).toBe(true);
  });

  it('should skip malformed lines', async () => {
    const entries = [makeEntry('user'), makeEntry('assistant')];
    const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\nbad json line\n';
    const filePath = path.join(tmpDir, 'malformed.jsonl');
    await fs.writeFile(filePath, lines, 'utf-8');

    const result = await loadTranscriptFile(filePath);
    expect(result.entries.length).toBe(2);
  });

  it('should return empty for nonexistent file', async () => {
    const result = await loadTranscriptFile(path.join(tmpDir, 'nope.jsonl'));
    expect(result.entries.length).toBe(0);
  });
});

describe('buildConversationChain', () => {
  it('should build a chain from tip to root', async () => {
    const uuid1 = generateUuid();
    const uuid2 = generateUuid();
    const uuid3 = generateUuid();

    const entries: Entry[] = [
      { type: 'user', uuid: uuid1, parentUuid: null, timestamp: new Date().toISOString(), sessionId: 's', message: { role: 'user', content: 'hi' } } as Entry,
      { type: 'assistant', uuid: uuid2, parentUuid: uuid1, timestamp: new Date().toISOString(), sessionId: 's', message: { role: 'assistant', content: 'hello' } } as Entry,
      { type: 'user', uuid: uuid3, parentUuid: uuid2, timestamp: new Date().toISOString(), sessionId: 's', message: { role: 'user', content: 'next' } } as Entry,
    ];

    const filePath = path.join(tmpDir, 'chain.jsonl');
    await writeJsonl(filePath, entries);

    const { byUuid, leafUuids } = await loadTranscriptFile(filePath);
    const tip = findMainConversationTip(byUuid, leafUuids);
    expect(tip).not.toBeNull();

    const chain = buildConversationChain(byUuid, tip!);
    expect(chain.length).toBe(3);
    // Chain should be in chronological order: root first, tip last
    expect((chain[0] as any).uuid).toBe(uuid1);
    expect((chain[2] as any).uuid).toBe(uuid3);
  });
});

describe('readHeadAndTail', () => {
  it('should read head and tail of a file', async () => {
    const content = Array.from({ length: 100 }, (_, i) => `{"type":"user","uuid":"${generateUuid()}","line":${i}}`).join('\n') + '\n';
    const filePath = path.join(tmpDir, 'headtail.jsonl');
    await fs.writeFile(filePath, content, 'utf-8');

    const result = await readHeadAndTail(filePath);
    expect(result).not.toBeNull();
    expect(result!.head.length).toBeGreaterThan(0);
    expect(result!.tail.length).toBeGreaterThan(0);
  });

  it('should return null for nonexistent file', async () => {
    const result = await readHeadAndTail(path.join(tmpDir, 'nope.jsonl'));
    expect(result).toBeNull();
  });
});

describe('readFileTailSync', () => {
  it('should read the tail of a file synchronously', async () => {
    const content = 'line1\nline2\nline3\n';
    const filePath = path.join(tmpDir, 'tail.jsonl');
    await fs.writeFile(filePath, content, 'utf-8');

    const tail = readFileTailSync(filePath);
    expect(tail.length).toBeGreaterThan(0);
    expect(tail).toContain('line3');
  });

  it('should return empty string for nonexistent file', () => {
    const tail = readFileTailSync(path.join(tmpDir, 'nope.jsonl'));
    expect(tail).toBe('');
  });
});

describe('extractFirstPromptFromHead', () => {
  it('should extract the first meaningful user prompt', () => {
    const head = [
      '{"type":"system","content":"system message"}',
      '{"type":"user","content":"Hello, how are you?"}',
      '{"type":"assistant","content":"I am fine"}',
    ].join('\n');

    const prompt = extractFirstPromptFromHead(head);
    expect(prompt).toBe('Hello, how are you?');
  });

  it('should skip tool_result and isMeta messages', () => {
    const head = [
      '{"type":"user","content":"tool output","tool_result":true}',
      '{"type":"user","content":"meta message","isMeta":true}',
      '{"type":"user","content":"Real prompt here"}',
    ].join('\n');

    const prompt = extractFirstPromptFromHead(head);
    expect(prompt).toBe('Real prompt here');
  });
});

describe('listCandidateFiles', () => {
  it('should list .jsonl files as session candidates', async () => {
    await fs.mkdir(path.join(tmpDir, 'sessions'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'sessions', 'abc12345-6789-abcd-ef01-234567890abc.jsonl'), '{}\n', 'utf-8');
    await fs.writeFile(path.join(tmpDir, 'sessions', 'not-a-session.txt'), 'hello', 'utf-8');

    const candidates = await listCandidateFiles(path.join(tmpDir, 'sessions'));
    expect(candidates.length).toBe(1);
    expect(candidates[0].sessionId).toBe('abc12345-6789-abcd-ef01-234567890abc');
  });
});
