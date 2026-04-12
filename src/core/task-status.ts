export type TaskLifecycleStatus = 'queued' | 'running' | 'completed' | 'failed' | 'killed';

export interface TaskStatusSnapshot {
  id: string;
  label: string;
  status: TaskLifecycleStatus;
  updatedAt: string;
}

export class TaskStatusStore {
  private readonly statuses = new Map<string, TaskStatusSnapshot>();

  upsert(id: string, label: string, status: TaskLifecycleStatus): TaskStatusSnapshot {
    const snapshot: TaskStatusSnapshot = {
      id,
      label,
      status,
      updatedAt: new Date().toISOString(),
    };
    this.statuses.set(id, snapshot);
    return snapshot;
  }

  list(): TaskStatusSnapshot[] {
    return Array.from(this.statuses.values()).sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
  }
}
