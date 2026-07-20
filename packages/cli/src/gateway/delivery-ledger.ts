/**
 * At-least-once delivery ledger for gateway outbound messages .
 * Survives crash between produce and platform ACK.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { gatewayHome } from './agent-runner.js';

export interface LedgerEntry {
  id: string;
  platform: string;
  chatId: string;
  text: string;
  threadId?: string;
  status: 'pending' | 'sending' | 'delivered' | 'abandoned';
  attempts: number;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
}

function ledgerPath(): string {
  return path.join(gatewayHome(), 'delivery-ledger.json');
}

async function load(): Promise<LedgerEntry[]> {
  try {
    const raw = await fs.readFile(ledgerPath(), 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

async function save(entries: LedgerEntry[]): Promise<void> {
  const dir = gatewayHome();
  await fs.mkdir(dir, { recursive: true });
  const dest = ledgerPath();
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`;
  // prune delivered > 7d, abandoned
  const week = Date.now() - 7 * 86_400_000;
  const kept = entries.filter((e) => {
    if (e.status === 'delivered' && e.updatedAt < week) return false;
    if (e.status === 'abandoned' && e.updatedAt < week) return false;
    return true;
  });
  await fs.writeFile(tmp, JSON.stringify({ entries: kept }, null, 2), 'utf-8');
  try {
    await fs.rename(tmp, dest);
  } catch (err: any) {
    // Race / missing parent: retry once, then direct write
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.rename(tmp, dest);
    } catch {
      await fs.writeFile(dest, JSON.stringify({ entries: kept }, null, 2), 'utf-8');
      await fs.unlink(tmp).catch(() => {});
    }
  }
}

export async function ledgerRecordPending(
  platform: string,
  chatId: string,
  text: string,
  threadId?: string,
): Promise<string> {
  const entries = await load();
  const id = randomBytes(6).toString('hex');
  const now = Date.now();
  entries.push({
    id,
    platform,
    chatId,
    text,
    threadId,
    status: 'pending',
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  });
  await save(entries);
  return id;
}

export async function ledgerMarkSending(id: string): Promise<void> {
  const entries = await load();
  const e = entries.find((x) => x.id === id);
  if (!e) return;
  e.status = 'sending';
  e.attempts += 1;
  e.updatedAt = Date.now();
  await save(entries);
}

export async function ledgerMarkDelivered(id: string): Promise<void> {
  const entries = await load();
  const e = entries.find((x) => x.id === id);
  if (!e) return;
  e.status = 'delivered';
  e.updatedAt = Date.now();
  await save(entries);
}

export async function ledgerMarkFailed(id: string, err: string): Promise<void> {
  const entries = await load();
  const e = entries.find((x) => x.id === id);
  if (!e) return;
  e.lastError = err;
  e.updatedAt = Date.now();
  if (e.attempts >= 3 || Date.now() - e.createdAt > 86_400_000) {
    e.status = 'abandoned';
  } else {
    e.status = 'pending';
  }
  await save(entries);
}

/** Pending/sending rows to redeliver on gateway boot (max 3 attempts, 24h). */
export async function ledgerPendingRedeliveries(): Promise<LedgerEntry[]> {
  const entries = await load();
  const day = Date.now() - 86_400_000;
  return entries.filter(
    (e) =>
      (e.status === 'pending' || e.status === 'sending') &&
      e.attempts < 3 &&
      e.createdAt > day,
  );
}
