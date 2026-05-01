import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import type { PermissionMode } from './permissions.js';

export interface PersistedPermissionState {
  permissionMode: PermissionMode;
  sessionApprovals: string[];
  directoryApprovals: string[];
  updatedAt: string;
}

export class PermissionStore {
  private readonly storePath: string;

  constructor(private readonly workingDir: string = process.cwd()) {
    this.storePath = path.join(workingDir, '.xibecode', 'permission-state.json');
  }

  async load(): Promise<PersistedPermissionState | null> {
    if (!existsSync(this.storePath)) {
      return null;
    }

    try {
      const raw = await fs.readFile(this.storePath, 'utf8');
      const parsed = JSON.parse(raw) as PersistedPermissionState;
      return parsed;
    } catch {
      return null;
    }
  }

  async save(state: PersistedPermissionState): Promise<void> {
    const dir = path.dirname(this.storePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.storePath, JSON.stringify(state, null, 2), 'utf8');
  }
}
