/**
 * Apply approved pending memory/skill writes.
 */

import { CuratedMemoryStore } from './curated-memory.js';
import { saveLearnedSkill } from './skill-learner.js';
import { getPending, rejectPending, type PendingWrite } from './write-approval.js';

export async function approvePending(
  id: string,
): Promise<{ success: boolean; message: string }> {
  const item = await getPending(id);
  if (!item) return { success: false, message: `Pending id not found: ${id}` };

  if (item.kind === 'memory') {
    const store = new CuratedMemoryStore();
    const target = (item.payload.target === 'user' ? 'user' : 'memory') as
      | 'user'
      | 'memory';
    const action = String(item.payload.action || 'add');
    let r: { success: boolean; message: string };
    if (action === 'replace') {
      r = await store.replace(
        target,
        String(item.payload.old_text || ''),
        String(item.payload.content || ''),
      );
    } else if (action === 'remove') {
      r = await store.remove(target, String(item.payload.old_text || ''));
    } else {
      r = await store.add(target, String(item.payload.content || ''));
    }
    if (r.success) await rejectPending(id, 'memory');
    return r;
  }

  if (item.kind === 'skill') {
    const result = await saveLearnedSkill({
      name: String(item.payload.name || 'learned-skill'),
      description: String(item.payload.description || ''),
      content: String(item.payload.content || ''),
      tags: (item.payload.tags as string[]) || ['learned'],
    });
    if (result.created) {
      await rejectPending(id, 'skill');
      return { success: true, message: `Skill saved: ${result.name}` };
    }
    return { success: false, message: result.reason || 'skill save failed' };
  }

  return { success: false, message: 'Unknown pending kind' };
}

export async function approveAll(
  kind?: 'memory' | 'skill',
): Promise<{ approved: number; failed: number }> {
  const { listPending } = await import('./write-approval.js');
  const list = await listPending(kind);
  let approved = 0;
  let failed = 0;
  for (const p of list) {
    const r = await approvePending(p.id);
    if (r.success) approved++;
    else failed++;
  }
  return { approved, failed };
}

export type { PendingWrite };
