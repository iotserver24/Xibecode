/**
 * Tests for the transcript writer module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { TranscriptWriter, appendEntryToFile, resetTranscriptWriter } from './transcript-writer.js';
import type { Entry } from './transcript-types.js';
import { generateUuid } from './transcript-types.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xibecode-test-'));
  resetTranscriptWriter();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeEntry(type: string, overrides?: Partial<Entry>): Entry {
  return {
    type: type as Entry['type'],
    uuid: generateUuid(),
    parentUuid: null,
    timestamp: new Date().toISOString(),
    sessionId: 'test-session',
    ...overrides,
  } as Entry;
}

describe('TranscriptWriter', () => {
  it('should enqueue and write entries to a JSONL file', async () => {
    const writer = new TranscriptWriter();
    const filePath = path.join(tmpDir, 'test.jsonl');
    const entry = makeEntry('user', { message: { role: 'user', content: 'hello' } } as Partial<Entry>);

    await writer.enqueueWrite(filePath, entry);
    await writer.flush();

    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.type).toBe('user');
    expect(parsed.sessionId).toBe('test-session');
  });

  it('should batch multiple writes', async () => {
    const writer = new TranscriptWriter();
    const filePath = path.join(tmpDir, 'batch.jsonl');

    const entries = [
      makeEntry('user'),
      makeEntry('assistant'),
      makeEntry('user'),
    ];

    await Promise.all(entries.map((e) => writer.enqueueWrite(filePath, e)));
    await writer.flush();

    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(3);
  });

  it('should create parent directories if they do not exist', async () => {
    const writer = new TranscriptWriter();
    const filePath = path.join(tmpDir, 'nested', 'dir', 'test.jsonl');
    const entry = makeEntry('custom-title', { customTitle: 'Test Title' } as Partial<Entry>);

    await writer.enqueueWrite(filePath, entry);
    await writer.flush();

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBeTruthy();
  });

  it('should flush pending writes on explicit flush', async () => {
    const writer = new TranscriptWriter();
    const filePath = path.join(tmpDir, 'flush.jsonl');
    const entry = makeEntry('tag', { tag: 'important' } as Partial<Entry>);

    const writePromise = writer.enqueueWrite(filePath, entry);
    await writer.flush();
    await writePromise;

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBeTruthy();
  });
});

describe('appendEntryToFile', () => {
  it('should append a single entry to a file synchronously', () => {
    const filePath = path.join(tmpDir, 'sync.jsonl');
    const entry = makeEntry('custom-title', { customTitle: 'Sync Title' } as Partial<Entry>);

    appendEntryToFile(filePath, entry);

    // Read back and verify
    const { readFileSync } = require('fs') as typeof import('fs');
    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.type).toBe('custom-title');
  });

  it('should create parent directories on sync append', () => {
    const filePath = path.join(tmpDir, 'sync-nested', 'test.jsonl');
    const entry = makeEntry('tag', { tag: 'nested' } as Partial<Entry>);

    appendEntryToFile(filePath, entry);

    const { readFileSync } = require('fs') as typeof import('fs');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toBeTruthy();
  });
});
