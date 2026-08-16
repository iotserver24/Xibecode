/**
 * xibecode pair — pairing approval for gateway platforms.
 * Prefer in-chat: /pair approve CODE · /pair channel · /pair server
 */

import chalk from 'chalk';
import {
  approvePairing,
  revokePairing,
  listPairing,
  pairChannel,
  pairGuild,
  formatPairingList,
} from '../gateway/pairing.js';

export async function pairCommand(
  action: string | undefined,
  args: string[],
): Promise<void> {
  const act = (action || 'list').toLowerCase();

  if (act === 'list' || act === 'ls') {
    console.log(formatPairingList(await listPairing()));
    return;
  }

  if (act === 'approve') {
    const platform = args[0];
    const code = args[1];
    if (!platform || !code) {
      console.error(chalk.red('Usage: xibecode pair approve <platform> <code>'));
      process.exitCode = 1;
      return;
    }
    const r = await approvePairing(platform, code);
    console.log(r.ok ? chalk.green(r.message) : chalk.red(r.message));
    if (!r.ok) process.exitCode = 1;
    return;
  }

  if (act === 'channel') {
    const platform = args[0];
    const channelId = args[1];
    if (!platform || !channelId) {
      console.error(chalk.red('Usage: xibecode pair channel <platform> <channelId>'));
      process.exitCode = 1;
      return;
    }
    const r = await pairChannel(platform, channelId);
    console.log(r.ok ? chalk.green(r.message) : chalk.red(r.message));
    if (!r.ok) process.exitCode = 1;
    return;
  }

  if (act === 'server' || act === 'guild') {
    const platform = args[0] || 'discord';
    const guildId = args[1] || args[0];
    // xibecode pair server discord GUILD_ID  OR  pair server GUILD_ID
    let plat = 'discord';
    let id = guildId;
    if (args[0] === 'discord' || args[0] === 'telegram' || args[0] === 'slack') {
      plat = args[0];
      id = args[1];
    } else {
      id = args[0];
    }
    if (!id) {
      console.error(chalk.red('Usage: xibecode pair server <guildId>'));
      process.exitCode = 1;
      return;
    }
    const r = await pairGuild(plat, id);
    console.log(r.ok ? chalk.green(r.message) : chalk.red(r.message));
    if (!r.ok) process.exitCode = 1;
    return;
  }

  if (act === 'revoke') {
    const platform = args[0];
    const userId = args[1];
    const scope = (args[2] as any) || 'any';
    if (!platform || !userId) {
      console.error(
        chalk.red(
          'Usage: xibecode pair revoke <platform> <id> [user|channel|guild]',
        ),
      );
      process.exitCode = 1;
      return;
    }
    const ok = await revokePairing(platform, userId, scope);
    console.log(ok ? chalk.green(`Revoked ${platform}:${userId}`) : chalk.red('Not found'));
    if (!ok) process.exitCode = 1;
    return;
  }

  console.error(chalk.red(`Unknown pair action: ${act}`));
  console.error(
    chalk.dim(
      'list | approve <platform> <code> | channel <platform> <id> | server <guildId> | revoke <platform> <id>',
    ),
  );
  process.exitCode = 1;
}
