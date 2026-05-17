/**

 *
 * Flow:
 * - `fileHistoryTrackEdit` records pre-edit file state into the latest snapshot.
 * - `fileHistoryMakeSnapshot` appends a message-linked snapshot at turn boundaries.
 * - `fileHistoryRewind` restores filesystem state to a snapshot by message id.
 */

import { createHash } from 'crypto';
import type { UUID } from 'crypto';
import type { Stats } from 'fs';
import { chmod, copyFile, mkdir, readFile, stat, unlink } from 'fs/promises';
import * as os from 'os';
import { dirname, isAbsolute, join, resolve } from 'path';
import type {
  FileHistoryBackupRef,
  FileHistorySnapshot,
  FileHistorySnapshotEntry,
} from './transcript-types.js';

const MAX_SNAPSHOTS = 100;

type BackupFileName = string | null;

export type FileHistoryState = {
  snapshots: FileHistorySnapshot[];
  trackedFiles: Set<string>;
  snapshotSequence: number;
};

export type DiffStats = {
  filesChanged?: string[];
  insertions: number;
  deletions: number;
} | undefined;

export function fileHistoryEnabled(): boolean {
  return process.env.XIBECODE_DISABLE_FILE_CHECKPOINTING !== '1';
}

export function getFileHistoryDir(): string {
  return join(os.homedir(), '.xibecode', 'file-history');
}

export function getBackupFileName(filePath: string, version: number): string {
  const pathHash = createHash('sha256').update(filePath).digest('hex').slice(0, 16);
  return `${pathHash}@v${version}`;
}

export function resolveBackupPath(backupFileName: string): string {
  return join(getFileHistoryDir(), backupFileName);
}

export function createFileHistoryState(): FileHistoryState {
  return {
    snapshots: [],
    trackedFiles: new Set(),
    snapshotSequence: 0,
  };
}

export function normalizeTrackingPath(workingDir: string, filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(workingDir, filePath);
}

export async function createBackup(
  filePath: string | null,
  version: number,
): Promise<FileHistoryBackupRef> {
  if (filePath === null) {
    return { backupFileName: null, version, backupTime: new Date().toISOString() };
  }

  const backupFileName = getBackupFileName(filePath, version);
  const backupPath = resolveBackupPath(backupFileName);

  let srcStats: Stats;
  try {
    srcStats = await stat(filePath);
  } catch {
    return { backupFileName: null, version, backupTime: new Date().toISOString() };
  }

  try {
    await copyFile(filePath, backupPath);
  } catch {
    await mkdir(dirname(backupPath), { recursive: true, mode: 0o700 });
    await copyFile(filePath, backupPath);
  }

  try {
    await chmod(backupPath, srcStats.mode);
  } catch {
    // non-fatal on some filesystems
  }

  return {
    backupFileName,
    version,
    backupTime: new Date().toISOString(),
  };
}

export async function restoreBackup(
  filePath: string,
  backupFileName: string,
): Promise<boolean> {
  const backupPath = resolveBackupPath(backupFileName);
  try {
    await stat(backupPath);
  } catch {
    return false;
  }

  try {
    await copyFile(backupPath, filePath);
  } catch {
    await mkdir(dirname(filePath), { recursive: true });
    await copyFile(backupPath, filePath);
  }

  return true;
}

export async function fileHistoryTrackEdit(
  _state: FileHistoryState,
  updateState: (updater: (prev: FileHistoryState) => FileHistoryState) => void,
  filePath: string,
  _messageId: UUID,
): Promise<void> {
  if (!fileHistoryEnabled()) return;

  let captured: FileHistoryState | undefined;
  updateState((state) => {
    captured = state;
    return state;
  });
  if (!captured) return;

  const lastSnapshot = captured.snapshots.at(-1);
  if (!lastSnapshot) return;

  if (lastSnapshot.trackedFileBackups[filePath]) {
    return;
  }

  const backup = await createBackup(filePath, 1);

  updateState((state) => {
    const latest = state.snapshots.at(-1);
    if (!latest || latest.trackedFileBackups[filePath]) {
      return state;
    }

    const updatedLatest: FileHistorySnapshot = {
      ...latest,
      trackedFileBackups: {
        ...latest.trackedFileBackups,
        [filePath]: backup,
      },
    };

    const snapshots = state.snapshots.slice();
    snapshots[snapshots.length - 1] = updatedLatest;

    const trackedFiles = state.trackedFiles.has(filePath)
      ? state.trackedFiles
      : new Set(state.trackedFiles).add(filePath);

    return {
      ...state,
      snapshots,
      trackedFiles,
    };
  });
}

export async function fileHistoryMakeSnapshot(
  updateState: (updater: (prev: FileHistoryState) => FileHistoryState) => void,
  messageId: UUID,
): Promise<FileHistorySnapshot | undefined> {
  if (!fileHistoryEnabled()) return undefined;

  let captured: FileHistoryState | undefined;
  updateState((state) => {
    captured = state;
    return state;
  });
  if (!captured) return undefined;

  const trackedFileBackups: Record<string, FileHistoryBackupRef> = {};
  const mostRecentSnapshot = captured.snapshots.at(-1);

  if (mostRecentSnapshot) {
    const trackedFilesArray = Array.from(captured.trackedFiles);
    // ⚡ Bolt: Chunked concurrency to prevent EMFILE (too many open files) OS errors when evaluating thousands of tracked files.
    const CONCURRENCY_LIMIT = 20;

    for (let i = 0; i < trackedFilesArray.length; i += CONCURRENCY_LIMIT) {
      const chunk = trackedFilesArray.slice(i, i + CONCURRENCY_LIMIT);

      await Promise.all(
        chunk.map(async (trackingPath) => {
          const latestBackup = mostRecentSnapshot.trackedFileBackups[trackingPath];
          const nextVersion = latestBackup ? latestBackup.version + 1 : 1;

          let fileStats: Stats | undefined;
          try {
            fileStats = await stat(trackingPath);
          } catch {
            fileStats = undefined;
          }

          if (!fileStats) {
            trackedFileBackups[trackingPath] = {
              backupFileName: null,
              version: nextVersion,
              backupTime: new Date().toISOString(),
            };
            return;
          }

          if (
            latestBackup &&
            latestBackup.backupFileName !== null &&
            !(await checkOriginFileChanged(
              trackingPath,
              latestBackup.backupFileName,
              fileStats,
            ))
          ) {
            trackedFileBackups[trackingPath] = latestBackup;
            return;
          }

          trackedFileBackups[trackingPath] = await createBackup(trackingPath, nextVersion);
        })
      );
    }
  }

  let createdSnapshot: FileHistorySnapshot | undefined;
  updateState((state) => {
    const lastSnapshot = state.snapshots.at(-1);
    if (lastSnapshot) {
      for (const trackingPath of state.trackedFiles) {
        if (trackingPath in trackedFileBackups) continue;
        const inherited = lastSnapshot.trackedFileBackups[trackingPath];
        if (inherited) trackedFileBackups[trackingPath] = inherited;
      }
    }

    const newSnapshot: FileHistorySnapshot = {
      messageId,
      trackedFileBackups,
      timestamp: new Date(),
    };

    const allSnapshots = [...state.snapshots, newSnapshot];
    const snapshots =
      allSnapshots.length > MAX_SNAPSHOTS
        ? allSnapshots.slice(-MAX_SNAPSHOTS)
        : allSnapshots;

    createdSnapshot = newSnapshot;
    return {
      ...state,
      snapshots,
      snapshotSequence: (state.snapshotSequence ?? 0) + 1,
    };
  });

  return createdSnapshot;
}

export async function fileHistoryRewind(
  updateState: (updater: (prev: FileHistoryState) => FileHistoryState) => void,
  messageId: UUID,
): Promise<string[]> {
  if (!fileHistoryEnabled()) return [];

  let captured: FileHistoryState | undefined;
  updateState((state) => {
    captured = state;
    return state;
  });
  if (!captured) return [];

  let targetSnapshot: FileHistorySnapshot | undefined;
  for (let i = captured.snapshots.length - 1; i >= 0; i--) {
    if (captured.snapshots[i]?.messageId === messageId) {
      targetSnapshot = captured.snapshots[i];
      break;
    }
  }
  if (!targetSnapshot) {
    throw new Error('The selected snapshot was not found');
  }

  return applySnapshot(captured, targetSnapshot);
}

export function fileHistoryCanRestore(
  state: FileHistoryState,
  messageId: UUID,
): boolean {
  if (!fileHistoryEnabled()) return false;
  return state.snapshots.some((snapshot) => snapshot.messageId === messageId);
}

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

export function fileHistoryRestoreStateFromEntries(
  entries: FileHistorySnapshotEntry[],
): FileHistoryState {
  const snapshots: FileHistorySnapshot[] = entries.map((entry) => ({
    messageId: entry.messageId,
    trackedFileBackups: entry.trackedFileBackups,
    timestamp: new Date(entry.timestamp),
  }));

  const trackedFiles = new Set<string>();
  for (const snapshot of snapshots) {
    for (const trackedPath of Object.keys(snapshot.trackedFileBackups)) {
      trackedFiles.add(trackedPath);
    }
  }

  return {
    snapshots,
    trackedFiles,
    snapshotSequence: snapshots.length,
  };
}

async function applySnapshot(
  state: FileHistoryState,
  targetSnapshot: FileHistorySnapshot,
): Promise<string[]> {
  const filesChanged: string[] = [];
  for (const trackingPath of state.trackedFiles) {
    const targetBackup = targetSnapshot.trackedFileBackups[trackingPath];
    const backupFileName: BackupFileName | undefined = targetBackup
      ? targetBackup.backupFileName
      : getBackupFileNameFirstVersion(trackingPath, state);

    if (backupFileName === undefined) {
      continue;
    }

    if (backupFileName === null) {
      try {
        await unlink(trackingPath);
        filesChanged.push(trackingPath);
      } catch {
        // file already absent
      }
      continue;
    }

    if (await checkOriginFileChanged(trackingPath, backupFileName)) {
      await restoreBackup(trackingPath, backupFileName);
      filesChanged.push(trackingPath);
    }
  }

  return filesChanged;
}

function getBackupFileNameFirstVersion(
  trackingPath: string,
  state: FileHistoryState,
): BackupFileName | undefined {
  for (const snapshot of state.snapshots) {
    const backup = snapshot.trackedFileBackups[trackingPath];
    if (backup) return backup.backupFileName;
  }
  return undefined;
}

export async function checkOriginFileChanged(
  originalFile: string,
  backupFileName: string,
  originalStatsHint?: Stats,
): Promise<boolean> {
  const backupPath = resolveBackupPath(backupFileName);

  let originalStats: Stats | null = originalStatsHint ?? null;
  if (!originalStats) {
    try {
      originalStats = await stat(originalFile);
    } catch {
      originalStats = null;
    }
  }

  let backupStats: Stats | null = null;
  try {
    backupStats = await stat(backupPath);
  } catch {
    backupStats = null;
  }

  return compareStatsAndContent(originalStats, backupStats, async () => {
    try {
      const [originalContent, backupContent] = await Promise.all([
        readFile(originalFile, 'utf-8'),
        readFile(backupPath, 'utf-8'),
      ]);
      return originalContent !== backupContent;
    } catch {
      return true;
    }
  });
}

async function compareStatsAndContent(
  originalStats: Stats | null,
  backupStats: Stats | null,
  compareContent: () => Promise<boolean>,
): Promise<boolean> {
  if ((originalStats === null) !== (backupStats === null)) return true;
  if (originalStats === null || backupStats === null) return false;

  if (
    originalStats.mode !== backupStats.mode ||
    originalStats.size !== backupStats.size
  ) {
    return true;
  }

  if (originalStats.mtimeMs < backupStats.mtimeMs) return false;
  return compareContent();
}

export function serializeFileHistoryState(state: FileHistoryState): {
  snapshots: Array<{
    messageId: string;
    trackedFileBackups: Record<string, FileHistoryBackupRef>;
    timestamp: string;
  }>;
  snapshotSequence: number;
} {
  return {
    snapshots: state.snapshots.map((snapshot) => ({
      messageId: snapshot.messageId,
      trackedFileBackups: snapshot.trackedFileBackups,
      timestamp: snapshot.timestamp.toISOString(),
    })),
    snapshotSequence: state.snapshotSequence,
  };
}

export function deserializeFileHistoryState(
  data: ReturnType<typeof serializeFileHistoryState>,
): FileHistoryState {
  const trackedFiles = new Set<string>();
  const snapshots: FileHistorySnapshot[] = data.snapshots.map((snapshot) => {
    for (const trackedPath of Object.keys(snapshot.trackedFileBackups)) {
      trackedFiles.add(trackedPath);
    }
    return {
      messageId: snapshot.messageId as UUID,
      trackedFileBackups: snapshot.trackedFileBackups,
      timestamp: new Date(snapshot.timestamp),
    };
  });

  return {
    snapshots,
    trackedFiles,
    snapshotSequence: data.snapshotSequence,
  };
}

export function computeDiffStats(
  state: FileHistoryState,
  fromSnapshotIndex: number,
  toSnapshotIndex: number,
): DiffStats {
  if (fromSnapshotIndex < 0 || toSnapshotIndex >= state.snapshots.length) {
    return undefined;
  }

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
      changedFiles.push(file);
    } else if (fromBackup && !toBackup) {
      changedFiles.push(file);
    } else if (fromBackup && toBackup && fromBackup.version !== toBackup.version) {
      changedFiles.push(file);
    }
  }

  return {
    filesChanged: changedFiles,
    insertions: changedFiles.length,
    deletions: 0,
  };
}
