/**
 * Write-approval gate for memory and skill mutations (Hermes-style).
 * When enabled, writes are staged under ~/.xibecode/pending/ for review.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomBytes } from 'crypto';

export type PendingKind = 'memory' | 'skill';

export interface PendingWrite {
  id: string;
  kind: PendingKind;
  createdAt: number;
  /** Short gist for chat listing */
  gist: string;
  /** Opaque payload applied on approve */
  payload: Record<string, unknown>;
  source?: string;
}

function pendingRoot(): string {
  return path.join(os.homedir(), '.xibecode', 'pending');
}

function kindDir(kind: PendingKind): string {
  return path.join(pendingRoot(), kind === 'skill' ? 'skills' : 'memory');
}

export function isWriteApprovalEnabled(kind: PendingKind): boolean {
  const env =
    kind === 'skill'
      ? process.env.XIBECODE_SKILLS_WRITE_APPROVAL
      : process.env.XIBECODE_MEMORY_WRITE_APPROVAL;
  if (env === '1' || env === 'true') return true;
  if (env === '0' || env === 'false') return false;
  // Config file
  try {
    // sync read avoided — callers pass flag; env is primary
  } catch {
    /* ignore */
  }
  return false;
}

export async function setWriteApproval(kind: PendingKind, on: boolean): Promise<void> {
  const confPath = path.join(os.homedir(), '.xibecode', 'learning.json');
  let data: any = {};
  try {
    data = JSON.parse(await fs.readFile(confPath, 'utf-8'));
  } catch {
    data = {};
  }
  if (kind === 'skill') data.skillsWriteApproval = on;
  else data.memoryWriteApproval = on;
  await fs.mkdir(path.dirname(confPath), { recursive: true });
  await fs.writeFile(confPath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function isWriteApprovalEnabledAsync(kind: PendingKind): Promise<boolean> {
  const env =
    kind === 'skill'
      ? process.env.XIBECODE_SKILLS_WRITE_APPROVAL
      : process.env.XIBECODE_MEMORY_WRITE_APPROVAL;
  if (env === '1' || env === 'true') return true;
  if (env === '0' || env === 'false') return false;
  try {
    const confPath = path.join(os.homedir(), '.xibecode', 'learning.json');
    const data = JSON.parse(await fs.readFile(confPath, 'utf-8'));
    if (kind === 'skill') return Boolean(data.skillsWriteApproval);
    return Boolean(data.memoryWriteApproval);
  } catch {
    return false;
  }
}

export async function stageWrite(
  kind: PendingKind,
  gist: string,
  payload: Record<string, unknown>,
  source = 'auto',
): Promise<PendingWrite> {
  const dir = kindDir(kind);
  await fs.mkdir(dir, { recursive: true });
  const id = randomBytes(4).toString('hex');
  const item: PendingWrite = {
    id,
    kind,
    createdAt: Date.now(),
    gist: gist.slice(0, 200),
    payload,
    source,
  };
  await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(item, null, 2), 'utf-8');
  return item;
}

export async function listPending(kind?: PendingKind): Promise<PendingWrite[]> {
  const kinds: PendingKind[] = kind ? [kind] : ['memory', 'skill'];
  const out: PendingWrite[] = [];
  for (const k of kinds) {
    const dir = kindDir(k);
    let files: string[] = [];
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'));
    } catch {
      continue;
    }
    for (const f of files) {
      try {
        const raw = await fs.readFile(path.join(dir, f), 'utf-8');
        out.push(JSON.parse(raw) as PendingWrite);
      } catch {
        /* skip */
      }
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getPending(
  id: string,
  kind?: PendingKind,
): Promise<PendingWrite | null> {
  const list = await listPending(kind);
  return list.find((p) => p.id === id) || null;
}

export async function rejectPending(id: string, kind?: PendingKind): Promise<boolean> {
  const item = await getPending(id, kind);
  if (!item) return false;
  const file = path.join(kindDir(item.kind), `${id}.json`);
  try {
    await fs.unlink(file);
    return true;
  } catch {
    return false;
  }
}

export async function rejectAll(kind?: PendingKind): Promise<number> {
  const list = await listPending(kind);
  let n = 0;
  for (const p of list) {
    if (await rejectPending(p.id, p.kind)) n++;
  }
  return n;
}
