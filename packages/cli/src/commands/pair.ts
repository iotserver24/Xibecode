/**
 * xibecode pair — DM pairing approval for gateway platforms.
 */

import chalk from 'chalk';
import {
  approvePairing,
  revokePairing,
  listPairing,
} from '../gateway/pairing.js';

export async function pairCommand(
  action: string | undefined,
  args: string[],
): Promise<void> {
  const act = (action || 'list').toLowerCase();

  if (act === 'list' || act === 'ls') {
    const state = await listPairing();
    console.log(chalk.white('Pending pairing codes:\n'));
    if (!state.pending.length) console.log(chalk.dim('  (none)'));
    for (const p of state.pending) {
      const exp = new Date(p.expiresAt).toISOString();
      console.log(
        `  ${chalk.cyan(p.code)}  ${p.platform}  user=${p.userId}  expires ${exp}`,
      );
    }
    console.log(chalk.white('\nApproved users:\n'));
    if (!state.approved.length) console.log(chalk.dim('  (none)'));
    for (const a of state.approved) {
      console.log(
        `  ${a.platform}  user=${a.userId}  since ${new Date(a.approvedAt).toISOString()}`,
      );
    }
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

  if (act === 'revoke') {
    const platform = args[0];
    const userId = args[1];
    if (!platform || !userId) {
      console.error(chalk.red('Usage: xibecode pair revoke <platform> <userId>'));
      process.exitCode = 1;
      return;
    }
    const ok = await revokePairing(platform, userId);
    console.log(ok ? chalk.green(`Revoked ${platform}:${userId}`) : chalk.red('Not found'));
    if (!ok) process.exitCode = 1;
    return;
  }

  console.error(chalk.red(`Unknown pair action: ${act}`));
  console.error(chalk.dim('list | approve <platform> <code> | revoke <platform> <userId>'));
  process.exitCode = 1;
}
