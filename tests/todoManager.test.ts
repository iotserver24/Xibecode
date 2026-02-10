import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import { TodoManager, TodoItem } from '../src/utils/todoManager.js';

vi.mock('fs/promises');

describe('TodoManager', () => {
  const rootDir = '/project';
  let manager: TodoManager;

  beforeEach(() => {
    manager = new TodoManager(rootDir);
    vi.resetAllMocks();
  });

  it('loads empty document when todo.md is missing', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

    const doc = await manager.load();
    expect(doc.pending).toEqual([]);
    expect(doc.inProgress).toEqual([]);
    expect(doc.done).toEqual([]);
  });

  it('parses existing todo.md with sections and items', async () => {
    const content = [
      '## Pending',
      '',
      '- [ ] [id:task-1] First task',
      '',
      '## In Progress',
      '',
      '- [ ] [id:task-2] Second task',
      '',
      '## Done',
      '',
      '- [x] [id:task-3] Third task',
      '',
    ].join('\n');

    vi.mocked(fs.readFile).mockResolvedValue(content);

    const doc = await manager.load();
    expect(doc.pending).toHaveLength(1);
    expect(doc.inProgress).toHaveLength(1);
    expect(doc.done).toHaveLength(1);
    expect(doc.pending[0].id).toBe('task-1');
    expect(doc.inProgress[0].status).toBe('in_progress');
    expect(doc.done[0].status).toBe('done');
  });

  it('mergeNewTasks adds new tasks and preserves existing statuses', async () => {
    const existingMarkdown = [
      '## Pending',
      '',
      '- [ ] [id:task-1] First task',
      '',
      '## In Progress',
      '',
      '- [ ] [id:task-2] Second task',
      '',
      '## Done',
      '',
      '- [x] [id:task-3] Third task',
      '',
    ].join('\n');

    vi.mocked(fs.readFile).mockResolvedValue(existingMarkdown);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const doc = await manager.mergeNewTasks([
      { id: 'task-1', title: 'First task (updated)' },
      { id: 'task-4', title: 'Fourth task' },
    ]);

    const all: TodoItem[] = [...doc.pending, ...doc.inProgress, ...doc.done];
    const ids = all.map(t => t.id);
    expect(ids).toContain('task-1');
    expect(ids).toContain('task-2');
    expect(ids).toContain('task-3');
    expect(ids).toContain('task-4');

    const updatedTask1 = all.find(t => t.id === 'task-1')!;
    expect(updatedTask1.title).toBe('First task (updated)');

    const newTask4 = all.find(t => t.id === 'task-4')!;
    expect(newTask4.status).toBe('pending');
  });

  it('updateStatus moves task between sections and rewrites file', async () => {
    const existingMarkdown = [
      '## Pending',
      '',
      '- [ ] [id:task-1] First task',
      '',
      '## In Progress',
      '',
      '_(none)_',
      '',
      '## Done',
      '',
      '_(none)_',
      '',
    ].join('\n');

    vi.mocked(fs.readFile).mockResolvedValue(existingMarkdown);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const updated = await manager.updateStatus('task-1', 'in_progress');
    expect(updated.pending).toHaveLength(0);
    expect(updated.inProgress).toHaveLength(1);
    expect(updated.inProgress[0].id).toBe('task-1');
  });

  it('getNextPending returns first pending task', async () => {
    const existingMarkdown = [
      '## Pending',
      '',
      '- [ ] [id:task-1] First task',
      '- [ ] [id:task-2] Second task',
      '',
      '## In Progress',
      '',
      '_(none)_',
      '',
      '## Done',
      '',
      '_(none)_',
      '',
    ].join('\n');

    vi.mocked(fs.readFile).mockResolvedValue(existingMarkdown);

    const doc = await manager.load();
    const next = manager.getNextPending(doc);
    expect(next?.id).toBe('task-1');
  });
});

