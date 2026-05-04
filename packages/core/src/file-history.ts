/**
 * File-level checkpoint system for tracking edits and enabling restore.
 *
 * Replaces the old `.xibecode_backups/` directory with a centralized
 * `~/.xibecode/file-history/` store that uses deterministic naming
 * (`{hash}@v{N}`) to avoid redundant backups of the same file version.
 *
 * Snapshots are recorded in the JSONL transcript as `file-history-snapshot`
 * entries, allowing resume to restore the file history state.
 *
 * @module file-history
 */

import { createHash } from 'crypto';
import type { UUID } from 'crypto';
import { chmod, copyFile, mkdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import * as os from 'os';
import type { FileHistoryBackupRef, FileHistorySnapshot } from './transcript-types.js';

// ─── Constants ──────────────────────────────────────────────────

/** Maximum number of snapshots to retain in memory. */
const MAX_SNAPSHOTS = 100;

// ─── Backup Path Resolution ─────────────────────────────────────

/** Get the root directory for file history backups. */
export function getFileHistoryDir(): string {
  return join(os.homedir(), '.xibecode', 'file-history');
}

/**
 * Compute a deterministic backup file name from the original file path
 * and version number. Uses a hash of the original path to create a
 * filesystem-safe and unique name.
 *
 * Format: `{pathHash}@v{version}`
 */
export function getBackupFileName(filePath: string, version: number): string {
  const pathHash = hashFilePath(filePath);
  return `${pathHash}@v${version}`;
}

/** Resolve a backup file name to its full path in the file-history directory. */
export function resolveBackupPath(backupFileName: string): string {
  return join(getFileHistoryDir(), backupFileName);
}

/** Hash a file path for deterministic backup naming. */
function hashFilePath(filePath: string): string {
  return createHash('sha256').update(filePath).digest('hex').slice(0, 16);
}

// ─── File History State ─────────────────────────────────────────

export type FileHistoryState = {
  snapshots: FileHistorySnapshot[];
  trackedFiles: Set<string>;
  snapshotSequence: number;
};

/** Create an empty file history state. */
export function createFileHistoryState(): FileHistoryState {
  return {
    snapshots: [],
    trackedFiles: new Set(),
    snapshotSequence: 0,
  };
}

// ─── Backup Creation ────────────────────────────────────────────

/**
 * Create a backup of a file at a given version.
 * Uses copyFile for efficient kernel-level copy without reading into JS heap.
 *
 * @param filePath - Path to the file to back up
 * @param version - Version number for the backup
 * @returns Backup reference with file name and metadata
 */
export async function createBackup(
  filePath: string | null,
  version: number,
): Promise<FileHistoryBackupRef> {
  if (filePath === null) {
    return { backupFileName: null, version, backupTime: new Date().toISOString() };
  }

  const backupFileName = getBackupFileName(filePath, version);
  const backupPath = resolveBackupPath(backupFileName);

  // Stat first: if the source is missing, record a null backup
  let srcStats;
  try {
    srcStats = await stat(filePath);
  } catch {
    return { backupFileName: null, version, backupTime: new Date().toISOString() };
  }

  // copyFile preserves content without reading the whole file into the JS heap.
  // Lazy mkdir: 99% of calls hit the fast path (directory already exists).
  try {
    await copyFile(filePath, backupPath);
  } catch {
    await mkdir(dirname(backupPath), { recursive: true, mode: 0o700 });
    await copyFile(filePath, backupPath);
  }

  // Preserve file permissions on the backup
  try {
    await chmod(backupPath, srcStats.mode);
  } catch {
    // Permissions may not be changeable on some filesystems — non-fatal
  }

  return {
    backupFileName,
    version,
    backupTime: new Date().toISOString(),
  };
}

// ─── Backup Restoration ─────────────────────────────────────────

/**
 * Restore a file from its backup.
 *
 * @param filePath - Destination path to restore to
 * @param backupFileName - Name of the backup file in the file-history directory
 */
export async function restoreBackup(
  filePath: string,
  backupFileName: string,
): Promise<boolean> {
  const backupPath = resolveBackupPath(backupFileName);

  // Stat first: if the backup is missing, bail
  try {
    await stat(backupPath);
  } catch {
    return false;
  }

  // Lazy mkdir for destination
  try {
    await copyFile(backupPath, filePath);
  } catch {
    await mkdir(dirname(filePath), { recursive: true });
    await copyFile(backupPath, filePath);
  }

  return true;
}

// ─── Track Edit ─────────────────────────────────────────────────

/**
 * Track a file edit by creating a backup of its current contents (if necessary).
 * This must be called BEFORE the file is actually edited, so we can save
 * its contents before the change.
 *
 * Creates a v1 backup on the first edit of a file. Subsequent edits only
 * create new backups if the file has changed since the last backup.
 *
 * @param state - Current file history state (mutated in place)
 * @param updateState - Callback to persist state changes
 * @param filePath - Path to the file being edited
 * @param messageId - UUID of the associated message
 */
export async function fileHistoryTrackEdit(
  state: FileHistoryState,
  updateState: (updater: (prev: FileHistoryState) => FileHistoryState) => void,
  filePath: string,
  messageId: UUID,
): Promise<void> {
  const existingBackup = state.trackedFiles.has(filePath)
    ? getExistingBackupForFile(state, filePath)
    : null;

  let backup: FileHistoryBackupRef;

  if (!existingBackup) {
    // First edit of this file — create v1 backup
    backup = await createBackup(filePath, 1);
  } else {
    // File was tracked before — check if it changed since last backup
    const lastBackupPath = existingBackup.backupFileName
      ? resolveBackupPath(existingBackup.backupFileName)
      : null;

    if (lastBackupPath) {
      const changed = await hasFileChanged(filePath, lastBackupPath);
      if (!changed) {
        // File hasn't changed since last backup — no new backup needed
        backup = existingBackup;
      } else {
        // File changed — create new version backup
        backup = await createBackup(filePath, existingBackup.version + 1);
      }
    } else {
      // Previous backup was null (file didn't exist) — create v1
      backup = await createBackup(filePath, 1);
    }
  }

  // Update state
  updateState((prev) => {
    const newTrackedFiles = new Set(prev.trackedFiles);
    newTrackedFiles.add(filePath);

    // Update the latest snapshot with the new backup info
    const newSnapshots = [...prev.snapshots];
    const currentSnapshot: FileHistorySnapshot = {
      messageId,
      trackedFileBackups: {
        [filePath]: backup,
      },
      timestamp: new Date(),
    };

    // Merge with previous snapshot's tracked files
    if (newSnapshots.length > 0) {
      const lastSnapshot = newSnapshots[newSnapshots.length - 1];
      currentSnapshot.trackedFileBackups = {
        ...lastSnapshot.trackedFileBackups,
        [filePath]: backup,
      };
    }

    newSnapshots.push(currentSnapshot);

    // Evict old snapshots if we exceed the limit
    while (newSnapshots.length > MAX_SNAPSHOTS) {
      newSnapshots.shift();
    }

    return {
      snapshots: newSnapshots,
      trackedFiles: newTrackedFiles,
      snapshotSequence: prev.snapshotSequence + 1,
    };
  });
}

/**
 * Get the existing backup reference for a file from the most recent snapshot.
 */
function getExistingBackupForFile(
  state: FileHistoryState,
  filePath: string,
): FileHistoryBackupRef | null {
  // Walk snapshots in reverse to find the most recent backup for this file
  for (let i = state.snapshots.length - 1; i >= 0; i--) {
    const snapshot = state.snapshots[i];
    if (snapshot.trackedFileBackups[filePath]) {
      return snapshot.trackedFileBackups[filePath];
    }
  }
  return null;
}

/**
 * Compare a file against its backup to see if it has changed.
 */
async function hasFileChanged(filePath: string, backupPath: string): Promise<boolean> {
  try {
    const [currentContent, backupContent] = await Promise.all([
      readFile(filePath, 'utf-8'),
      readFile(backupPath, 'utf-8'),
    ]);
    return currentContent !== backupContent;
  } catch {
    // If either file can't be read, assume it changed
    return true;
  }
}

// ─── Restore from Snapshot ──────────────────────────────────────

/**
 * Check if a file can be restored from a snapshot.
 */
export function fileHistoryCanRestore(
  state: FileHistoryState,
  filePath: string,
): boolean {
  return getExistingBackupForFile(state, filePath)?.backupFileName !== null;
}

/**
 * Restore a file to its state at a specific snapshot.
 *
 * @param state - Current file history state
 * @param filePath - Path to the file to restore
 * @param snapshotIndex - Index of the snapshot to restore from (0 = oldest, -1 = most recent)
 * @returns true if restoration succeeded
 */
export async function fileHistoryRestore(
  state: FileHistoryState,
  filePath: string,
  snapshotIndex: number = -1,
): Promise<boolean> {
  const resolvedIndex =
    snapshotIndex < 0 ? state.snapshots.length + snapshotIndex : snapshotIndex;

  if (resolvedIndex < 0 || resolvedIndex >= state.snapshots.length) return false;

  const snapshot = state.snapshots[resolvedIndex];
  const backup = snapshot.trackedFileBackups[filePath];

  if (!backup || !backup.backupFileName) return false;

  return restoreBackup(filePath, backup.backupFileName);
}

// ─── State Serialization for Transcript ─────────────────────────

/**
 * Serialize file history state for embedding in a transcript entry.
 * Converts Sets to arrays for JSON compatibility.
 */
export function serializeFileHistoryState(state: FileHistoryState): {
  snapshots: Array<{
    messageId: string;
    trackedFileBackups: Record<string, FileHistoryBackupRef>;
    timestamp: string;
  }>;
  snapshotSequence: number;
} {
  return {
    snapshots: state.snapshots.map((s) => ({
      messageId: s.messageId,
      trackedFileBackups: s.trackedFileBackups,
      timestamp: s.timestamp.toISOString(),
    })),
    snapshotSequence: state.snapshotSequence,
  };
}

/**
 * Restore file history state from a serialized transcript entry.
 */
export function deserializeFileHistoryState(
  data: ReturnType<typeof serializeFileHistoryState>,
): FileHistoryState {
  const trackedFiles = new Set<string>();
  const snapshots: FileHistorySnapshot[] = data.snapshots.map((s) => {
    for (const path of Object.keys(s.trackedFileBackups)) {
      trackedFiles.add(path);
    }
    return {
      messageId: s.messageId as UUID,
      trackedFileBackups: s.trackedFileBackups,
      timestamp: new Date(s.timestamp),
    };
  });

  return {
    snapshots,
    trackedFiles,
    snapshotSequence: data.snapshotSequence,
  };
}

// ─── Diff Stats ─────────────────────────────────────────────────

export type DiffStats = {
  filesChanged?: string[];
  insertions: number;
  deletions: number;
} | undefined;

/**
 * Compute diff stats between two snapshots.
 * Compares the tracked file backup versions to identify changes.
 */
export function computeDiffStats(
  state: FileHistoryState,
  fromSnapshotIndex: number,
  toSnapshotIndex: number,
): DiffStats {
  if (fromSnapshotIndex < 0 || toSnapshotIndex >= state.snapshots.length) return undefined;

  const fromSnapshot = state.snapshots[fromSnapshotIndex];
  const toSnapshot = state.snapshots[toSnapshotIndex];

  if (!fromSnapshot || !toSnapshot) return undefined;

  const changedFiles: string[] = [];
  const allFiles = new Set([
    ...Object.keys(fromSnapshot.trackedFileBackups),
    ...Object.keys(toSnapshot.trackedFileBackups),
  ]);

  for (const file of allFiles) {
    const fromBackup = fromSnapshot.trackedFileBackups[file];
    const toBackup = toSnapshot.trackedFileBackups[file];

    if (!fromBackup && toBackup) {
      changedFiles.push(file); // New file
    } else if (fromBackup && !toBackup) {
      changedFiles.push(file); // Deleted file
    } else if (fromBackup && toBackup && fromBackup.version !== toBackup.version) {
      changedFiles.push(file); // Modified file
    }
  }

  return {
    filesChanged: changedFiles,
    insertions: changedFiles.length,
    deletions: 0,
  };
}
