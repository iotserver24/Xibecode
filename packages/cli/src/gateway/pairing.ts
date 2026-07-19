/**
 * DM pairing codes for gateway access (optional alternative to allowlists).
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { gatewayHome } from './agent-runner.js';

export interface PairingState {
  pending: Array<{
    code: string;
    platform: string;
    userId: string;
    chatId: string;
    expiresAt: number;
  }>;
  approved: Array<{
    platform: string;
    userId: string;
    chatId?: string;
    approvedAt: number;
  }>;
}

function pairingPath(): string {
  return path.join(gatewayHome(), 'pairing.json');
}

async function load(): Promise<PairingState> {
  try {
    return JSON.parse(await fs.readFile(pairingPath(), 'utf-8')) as PairingState;
  } catch {
    return { pending: [], approved: [] };
  }
}

async function save(state: PairingState): Promise<void> {
  await fs.mkdir(gatewayHome(), { recursive: true });
  // prune expired pending
  const now = Date.now();
  state.pending = state.pending.filter((p) => p.expiresAt > now);
  await fs.writeFile(pairingPath(), JSON.stringify(state, null, 2), 'utf-8');
}

function genCode(): string {
  // 8 char alphanumeric
  return randomBytes(5).toString('base64url').replace(/[^A-Z0-9]/gi, '').slice(0, 8).toUpperCase();
}

export async function isPaired(platform: string, userId: string): Promise<boolean> {
  const state = await load();
  return state.approved.some(
    (a) => a.platform === platform && a.userId === userId,
  );
}

export async function requestPairing(
  platform: string,
  userId: string,
  chatId: string,
): Promise<string> {
  const state = await load();
  // rate limit: max 3 pending per user
  const existing = state.pending.filter(
    (p) => p.platform === platform && p.userId === userId && p.expiresAt > Date.now(),
  );
  if (existing.length >= 3) {
    return existing[0]!.code;
  }
  const code = genCode();
  state.pending.push({
    code,
    platform,
    userId,
    chatId,
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  await save(state);
  return code;
}

export async function approvePairing(
  platform: string,
  code: string,
): Promise<{ ok: boolean; message: string; userId?: string }> {
  const state = await load();
  const idx = state.pending.findIndex(
    (p) =>
      p.code.toUpperCase() === code.toUpperCase() &&
      (platform === 'any' || p.platform === platform) &&
      p.expiresAt > Date.now(),
  );
  if (idx < 0) return { ok: false, message: 'Invalid or expired pairing code' };
  const p = state.pending[idx]!;
  state.pending.splice(idx, 1);
  if (!state.approved.some((a) => a.platform === p.platform && a.userId === p.userId)) {
    state.approved.push({
      platform: p.platform,
      userId: p.userId,
      chatId: p.chatId,
      approvedAt: Date.now(),
    });
  }
  await save(state);
  return { ok: true, message: `Approved ${p.platform} user ${p.userId}`, userId: p.userId };
}

export async function revokePairing(
  platform: string,
  userId: string,
): Promise<boolean> {
  const state = await load();
  const before = state.approved.length;
  state.approved = state.approved.filter(
    (a) => !(a.platform === platform && a.userId === userId),
  );
  await save(state);
  return state.approved.length < before;
}

export async function listPairing(): Promise<PairingState> {
  return load();
}
