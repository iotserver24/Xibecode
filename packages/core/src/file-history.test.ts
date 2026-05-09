/**
 * Tests for the file history checkpoint system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { UUID } from 'crypto';
import {
  createBackup,
  restoreBackup,
  getBackupFileName,
  createFileHistoryState,
  fileHistoryTrackEdit,
  fileHistoryMakeSnapshot,
  fileHistoryRewind,
  fileHistoryCanRestore,
  fileHistoryRestore,
  checkOriginFileChanged,
  serializeFileHistoryState,
  deserializeFileHistoryState,
} from './file-history.js';
import { generateUuid } from './transcript-types.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xibecode-fh-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('getBackupFileName', () => {
  it('should produce deterministic names from the same path', () => {
    const name1 = getBackupFileName('/path/to/file.ts', 1);
    const name2 = getBackupFileName('/path/to/file.ts', 1);
    expect(name1).toBe(name2);
  });

  it('should produce different names for different versions', () => {
    const name1 = getBackupFileName('/path/to/file.ts', 1);
    const name2 = getBackupFileName('/path/to/file.ts', 2);
    expect(name1).not.toBe(name2);
  });

  it('should produce different names for different files', () => {
    const name1 = getBackupFileName('/path/to/file1.ts', 1);
    const name2 = getBackupFileName('/path/to/file2.ts', 1);
    expect(name1).not.toBe(name2);
  });
});

describe('createBackup', () => {
  it('should create a backup of an existing file', async () => {
    const filePath = path.join(tmpDir, 'test.txt');
    await fs.writeFile(filePath, 'original content', 'utf-8');

    const backup = await createBackup(filePath, 1);
    expect(backup.backupFileName).not.toBeNull();
    expect(backup.version).toBe(1);
  });

  it('should return null backup for nonexistent file', async () => {
    const backup = await createBackup(path.join(tmpDir, 'nonexistent.txt'), 1);
    expect(backup.backupFileName).toBeNull();
  });

  it('should return null backup for null filePath', async () => {
    const backup = await createBackup(null, 1);
    expect(backup.backupFileName).toBeNull();
  });
});

describe('restoreBackup', () => {
  it('should restore a file from its backup', async () => {
    const filePath = path.join(tmpDir, 'restore.txt');
    await fs.writeFile(filePath, 'original content', 'utf-8');

    const backup = await createBackup(filePath, 1);
    expect(backup.backupFileName).not.toBeNull();

    // Modify the file
    await fs.writeFile(filePath, 'modified content', 'utf-8');

    // Restore from backup
    const restored = await restoreBackup(filePath, backup.backupFileName!);
    expect(restored).toBe(true);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('original content');
  });
});

describe('FileHistoryState', () => {
  it('should track file edits', async () => {
    const state = createFileHistoryState();
    const filePath = path.join(tmpDir, 'tracked.txt');
    await fs.writeFile(filePath, 'content', 'utf-8');

    let currentState = state;
    const updateState = (updater: (prev: typeof state) => typeof state) => {
      currentState = updater(currentState);
    };

    const seedMessageId = generateUuid() as UUID;
    await fileHistoryMakeSnapshot(updateState, seedMessageId);
    await fileHistoryTrackEdit(currentState, updateState, filePath, seedMessageId);

    expect(currentState.trackedFiles.has(filePath)).toBe(true);
    expect(currentState.snapshots.length).toBe(1);
  });

  it('should indicate when a file can be restored', async () => {
    const state = createFileHistoryState();
    const filePath = path.join(tmpDir, 'can-restore.txt');
    await fs.writeFile(filePath, 'content', 'utf-8');

    let currentState = state;
    const updateState = (updater: (prev: typeof state) => typeof state) => {
      currentState = updater(currentState);
    };

    const messageId = generateUuid() as UUID;
    await fileHistoryMakeSnapshot(updateState, messageId);
    await fileHistoryTrackEdit(currentState, updateState, filePath, messageId);

    expect(fileHistoryCanRestore(currentState, messageId)).toBe(true);
  });

  it('should not create duplicate versions for unchanged files on snapshot', async () => {
    const state = createFileHistoryState();
    const filePath = path.join(tmpDir, 'unchanged.txt');
    await fs.writeFile(filePath, 'same content', 'utf-8');

    let currentState = state;
    const updateState = (updater: (prev: typeof state) => typeof state) => {
      currentState = updater(currentState);
    };

    const m1 = generateUuid() as UUID;
    const m2 = generateUuid() as UUID;
    await fileHistoryMakeSnapshot(updateState, m1);
    await fileHistoryTrackEdit(currentState, updateState, filePath, m1);
    await fileHistoryMakeSnapshot(updateState, m2);

    const backup = currentState.snapshots.at(-1)?.trackedFileBackups[filePath];
    expect(backup?.version).toBe(1);
  });

  it('should rewind to target snapshot', async () => {
    const state = createFileHistoryState();
    const filePath = path.join(tmpDir, 'rewind.txt');
    await fs.writeFile(filePath, 'before', 'utf-8');

    let currentState = state;
    const updateState = (updater: (prev: typeof state) => typeof state) => {
      currentState = updater(currentState);
    };

    const start = generateUuid() as UUID;
    const end = generateUuid() as UUID;
    await fileHistoryMakeSnapshot(updateState, start);
    await fileHistoryTrackEdit(currentState, updateState, filePath, start);
    await fs.writeFile(filePath, 'after', 'utf-8');
    await fileHistoryMakeSnapshot(updateState, end);

    await fileHistoryRewind(updateState, start);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('before');
  });

  it('should detect change against backup', async () => {
    const filePath = path.join(tmpDir, 'diff-check.txt');
    await fs.writeFile(filePath, 'v1', 'utf-8');
    const backup = await createBackup(filePath, 1);
    expect(backup.backupFileName).not.toBeNull();

    const unchanged = await checkOriginFileChanged(filePath, backup.backupFileName!);
    expect(unchanged).toBe(false);

    await fs.writeFile(filePath, 'v2', 'utf-8');
    const changed = await checkOriginFileChanged(filePath, backup.backupFileName!);
    expect(changed).toBe(true);
  });
});

describe('serializeFileHistoryState', () => {
  it('should roundtrip state through serialization', () => {
    const state = createFileHistoryState();
    state.snapshots.push({
      messageId: generateUuid() as UUID,
      trackedFileBackups: {
        '/path/to/file.ts': {
          backupFileName: 'abc@v1',
          version: 1,
          backupTime: new Date().toISOString(),
        },
      },
      timestamp: new Date(),
    });
    state.trackedFiles.add('/path/to/file.ts');
    state.snapshotSequence = 1;

    const serialized = serializeFileHistoryState(state);
    const deserialized = deserializeFileHistoryState(serialized);

    expect(deserialized.trackedFiles.has('/path/to/file.ts')).toBe(true);
    expect(deserialized.snapshots.length).toBe(1);
    expect(deserialized.snapshotSequence).toBe(1);
  });
});
