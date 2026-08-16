/**
 * Pairing for messaging gateways (Telegram / Discord / Slack).
 *
 * - **User pairing**: approve a person (DM + any chat they use).
 * - **Channel pairing**: open a specific channel to anyone (great for Discord servers).
 * - **Guild pairing**: open a whole Discord server.
 *
 * Operators (allowlisted or already paired) can approve from chat:
 *   `/pair approve CODE`  or  shell: `xibecode pair approve discord CODE`
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { gatewayHome } from './agent-runner.js';

export type PairScope = 'user' | 'channel' | 'guild';

export interface PendingPair {
  code: string;
  platform: string;
  userId: string;
  chatId: string;
  /** Discord guild id when request came from a server channel */
  guildId?: string;
  username?: string;
  expiresAt: number;
}

export interface ApprovedPair {
  platform: string;
  /** user id | channel id | guild id depending on scope */
  userId: string;
  chatId?: string;
  guildId?: string;
  scope?: PairScope; // default 'user' for legacy entries
  label?: string;
  approvedAt: number;
}

export interface PairingState {
  pending: PendingPair[];
  approved: ApprovedPair[];
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
  const now = Date.now();
  state.pending = state.pending.filter((p) => p.expiresAt > now);
  await fs.writeFile(pairingPath(), JSON.stringify(state, null, 2), 'utf-8');
}

function genCode(): string {
  return randomBytes(5)
    .toString('base64url')
    .replace(/[^A-Z0-9]/gi, '')
    .slice(0, 8)
    .toUpperCase();
}

function scopeOf(a: ApprovedPair): PairScope {
  return a.scope || 'user';
}

/** User is personally approved (DM-capable). */
export async function isPaired(platform: string, userId: string): Promise<boolean> {
  const state = await load();
  return state.approved.some(
    (a) =>
      a.platform === platform &&
      a.userId === userId &&
      scopeOf(a) === 'user',
  );
}

/** Channel is open to anyone messaging in it. */
export async function isChannelPaired(
  platform: string,
  channelId: string,
): Promise<boolean> {
  if (!channelId) return false;
  const state = await load();
  return state.approved.some(
    (a) =>
      a.platform === platform &&
      scopeOf(a) === 'channel' &&
      (a.userId === channelId || a.chatId === channelId),
  );
}

/** Whole guild/server is open. */
export async function isGuildPaired(
  platform: string,
  guildId: string,
): Promise<boolean> {
  if (!guildId) return false;
  const state = await load();
  return state.approved.some(
    (a) =>
      a.platform === platform &&
      scopeOf(a) === 'guild' &&
      (a.userId === guildId || a.guildId === guildId),
  );
}

/**
 * Unified access check after allowlist.
 * Order: user pair → channel pair → guild pair.
 */
export async function isAccessPaired(opts: {
  platform: string;
  userId: string;
  chatId?: string;
  guildId?: string;
}): Promise<boolean> {
  if (await isPaired(opts.platform, opts.userId)) return true;
  if (opts.chatId && (await isChannelPaired(opts.platform, opts.chatId))) {
    return true;
  }
  if (opts.guildId && (await isGuildPaired(opts.platform, opts.guildId))) {
    return true;
  }
  return false;
}

export async function requestPairing(
  platform: string,
  userId: string,
  chatId: string,
  meta?: { guildId?: string; username?: string },
): Promise<string> {
  const state = await load();
  const existing = state.pending.filter(
    (p) =>
      p.platform === platform &&
      p.userId === userId &&
      p.expiresAt > Date.now(),
  );
  if (existing.length >= 3) {
    return existing[0]!.code;
  }
  // Reuse same code if still pending for this user
  if (existing.length > 0) {
    return existing[0]!.code;
  }
  const code = genCode();
  state.pending.push({
    code,
    platform,
    userId,
    chatId,
    guildId: meta?.guildId,
    username: meta?.username,
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  await save(state);
  return code;
}

export async function approvePairing(
  platform: string,
  code: string,
): Promise<{ ok: boolean; message: string; userId?: string; chatId?: string }> {
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
  if (
    !state.approved.some(
      (a) =>
        a.platform === p.platform &&
        a.userId === p.userId &&
        scopeOf(a) === 'user',
    )
  ) {
    state.approved.push({
      platform: p.platform,
      userId: p.userId,
      chatId: p.chatId,
      guildId: p.guildId,
      scope: 'user',
      label: p.username,
      approvedAt: Date.now(),
    });
  }
  await save(state);
  const who = p.username ? `${p.username} (${p.userId})` : p.userId;
  return {
    ok: true,
    message: `Approved **user** ${p.platform}: ${who}`,
    userId: p.userId,
    chatId: p.chatId,
  };
}

/** Pair current channel so anyone there can use the bot. */
export async function pairChannel(
  platform: string,
  channelId: string,
  opts?: { label?: string; byUserId?: string },
): Promise<{ ok: boolean; message: string }> {
  if (!channelId) return { ok: false, message: 'Missing channel id' };
  const state = await load();
  if (await isChannelPaired(platform, channelId)) {
    return { ok: true, message: `Channel already paired: \`${channelId}\`` };
  }
  state.approved.push({
    platform,
    userId: channelId,
    chatId: channelId,
    scope: 'channel',
    label: opts?.label || `channel:${channelId}`,
    approvedAt: Date.now(),
  });
  await save(state);
  return {
    ok: true,
    message:
      `✅ **Channel paired** — anyone in this channel can use the bot.\n` +
      `Id: \`${channelId}\`\n` +
      `Revoke: \`/pair revoke channel ${channelId}\``,
  };
}

/** Pair whole Discord server (guild). */
export async function pairGuild(
  platform: string,
  guildId: string,
  opts?: { label?: string },
): Promise<{ ok: boolean; message: string }> {
  if (!guildId) {
    return {
      ok: false,
      message: 'Not in a server — `/pair server` only works in a guild channel.',
    };
  }
  const state = await load();
  if (await isGuildPaired(platform, guildId)) {
    return { ok: true, message: `Server already paired: \`${guildId}\`` };
  }
  state.approved.push({
    platform,
    userId: guildId,
    guildId,
    scope: 'guild',
    label: opts?.label || `guild:${guildId}`,
    approvedAt: Date.now(),
  });
  await save(state);
  return {
    ok: true,
    message:
      `✅ **Server paired** — anyone in this server can use the bot.\n` +
      `Id: \`${guildId}\`\n` +
      `Revoke: \`/pair revoke server ${guildId}\``,
  };
}

export async function revokePairing(
  platform: string,
  id: string,
  scope: PairScope | 'any' = 'any',
): Promise<boolean> {
  const state = await load();
  const before = state.approved.length;
  state.approved = state.approved.filter((a) => {
    if (a.platform !== platform) return true;
    const matchId =
      a.userId === id || a.chatId === id || a.guildId === id;
    if (!matchId) return true;
    if (scope === 'any') return false; // remove
    return scopeOf(a) !== scope; // keep if different scope
  });
  await save(state);
  return state.approved.length < before;
}

export async function listPairing(): Promise<PairingState> {
  return load();
}

/** Format pending + approved for chat (/pair list). */
export function formatPairingList(state: PairingState): string {
  const lines: string[] = ['**Pairing status**', ''];
  lines.push('**Pending codes** (expire in 1h):');
  const pending = state.pending.filter((p) => p.expiresAt > Date.now());
  if (!pending.length) lines.push('_none_');
  for (const p of pending) {
    const who = p.username ? `${p.username}` : p.userId;
    lines.push(
      `• \`${p.code}\` · ${p.platform} · ${who} · user=\`${p.userId}\`` +
        (p.guildId ? ` · guild=\`${p.guildId}\`` : ''),
    );
  }
  lines.push('');
  lines.push('**Approved:**');
  if (!state.approved.length) lines.push('_none_');
  for (const a of state.approved) {
    const sc = scopeOf(a);
    lines.push(
      `• **${sc}** · ${a.platform} · \`${a.userId}\`` +
        (a.label ? ` · ${a.label}` : '') +
        ` · ${new Date(a.approvedAt).toISOString().slice(0, 10)}`,
    );
  }
  lines.push('');
  lines.push(
    '_Ops:_ `/pair approve CODE` · `/pair channel` · `/pair server` · `/pair revoke user|channel|server <id>`',
  );
  return lines.join('\n');
}

/** User-facing access-denied + code message (messaging UIs). */
export function formatPairingDenied(opts: {
  platform: string;
  code: string;
  context?: 'dm' | 'channel';
}): string {
  const plat = opts.platform;
  const where =
    opts.context === 'channel'
      ? 'this channel'
      : opts.context === 'dm'
        ? 'DM'
        : 'here';
  return [
    `🔒 **Access needed** to use the bot ${where}.`,
    '',
    `Your pairing code: \`${opts.code}\``,
    '',
    '**Operator** (already allowed) can approve from chat:',
    `• \`/pair approve ${opts.code}\``,
    '',
    'Or from the host shell:',
    `• \`xibecode pair approve ${plat} ${opts.code}\``,
    '',
    '**For a whole channel/server** (no per-user codes):',
    '• Operator runs `/pair channel` in that channel',
    '• Or `/pair server` for the whole Discord server',
  ].join('\n');
}
