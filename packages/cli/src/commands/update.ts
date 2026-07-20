/**
 * Opt-in CLI self-update (mainly for E2B / Vectra Cloud sandboxes).
 *
 *   xibecode update --check
 *   xibecode update --apply --yes [--version X.Y.Z] [--restart]
 *
 * In E2B: after --apply --restart, daemon relaunches automatically.
 * Never applies without --apply/--yes (or dashboard / Telegram `/update yes`).
 */

import chalk from 'chalk';
import {
  isE2bHostedRuntime,
  NPM_PACKAGE_PAGE,
  updateCheckDisabled,
} from '../utils/npm-update-notice.js';
import {
  applySelfUpdate,
  checkCliUpdate,
  packageVersion,
} from '../utils/self-update.js';

export type UpdateCliOptions = {
  check?: boolean;
  apply?: boolean;
  version?: string;
  json?: boolean;
  yes?: boolean;
  /** Relaunch daemon after successful install (E2B / hosted). */
  restart?: boolean;
};

function printCheck(
  result: Awaited<ReturnType<typeof checkCliUpdate>>,
  json?: boolean,
) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(chalk.hex('#00D4FF').bold('\nXibeCode update check\n'));
  console.log(`Current:  ${result.current}`);
  console.log(
    `Latest:   ${result.latest}${result.fromCache ? chalk.dim(' (cached)') : ''}`,
  );
  console.log(`Hosted:   ${result.hosted ? 'yes (E2B/template)' : 'no'}`);
  if (result.disabled) {
    console.log(
      chalk.yellow('Checks disabled (XIBECODE_DISABLE_UPDATE_CHECK=1)'),
    );
    return;
  }
  if (result.updateAvailable) {
    console.log(
      chalk.yellow(
        `\nUpdate available: ${result.latest} (you have ${result.current})`,
      ),
    );
    console.log(chalk.dim(`npm: ${NPM_PACKAGE_PAGE}`));
    if (result.hosted) {
      console.log(
        chalk.dim(
          'E2B: Dashboard → Update & restart  ·  or Telegram `/update yes`',
        ),
      );
      console.log(
        chalk.dim(
          'CLI: xibecode update --apply --yes --restart',
        ),
      );
    } else {
      console.log(
        chalk.dim(
          'Upgrade: xibecode update --apply --yes  |  npm i -g xibecode@latest',
        ),
      );
    }
  } else {
    console.log(
      chalk.green('\nYou are on the latest release (or registry unavailable).'),
    );
  }
  console.log('');
}

export async function updateCommand(options: UpdateCliOptions): Promise<void> {
  const current = packageVersion();
  const checkOnly = options.check || (!options.apply && !options.version);

  if (checkOnly) {
    const result = await checkCliUpdate({ forceRefresh: false });
    printCheck(result, options.json);
    return;
  }

  if (updateCheckDisabled()) {
    console.error(
      chalk.red(
        'Update checks disabled (XIBECODE_DISABLE_UPDATE_CHECK / XIBECODE_DISABLE_AUTO_UPDATE).',
      ),
    );
    process.exitCode = 1;
    return;
  }

  if (!options.yes && !options.json) {
    const target = options.version || '(latest)';
    console.log(
      chalk.yellow(
        `About to install xibecode@${target} (currently ${current}).`,
      ),
    );
    console.log(
      chalk.dim(
        'Confirm with --yes (non-interactive). E2B: add --restart to auto-relaunch daemon.',
      ),
    );
    process.exitCode = 1;
    return;
  }

  const hosted = isE2bHostedRuntime();
  // Auto-restart when --restart OR (E2B/hosted and not disabled)
  const wantRestart =
    options.restart === true ||
    (hosted && process.env.XIBECODE_UPDATE_RESTART !== '0');

  if (!options.json) {
    console.log(chalk.cyan(`Installing…`));
    if (wantRestart && hosted) {
      console.log(chalk.dim('E2B/hosted — will auto-restart daemon after success.'));
    }
  }

  const result = await applySelfUpdate({
    version: options.version,
    restartDaemon: wantRestart,
  });

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: result.ok,
          from: result.from,
          to: result.to,
          verified: result.verified,
          hosted,
          restarted: result.restarted,
          logs: result.logs.slice(0, 6000),
          error: result.error,
        },
        null,
        2,
      ),
    );
  } else if (result.ok) {
    if (result.logs === 'already_latest') {
      console.log(chalk.green(`Already on latest (${result.from}).`));
    } else {
      console.log(
        chalk.green(`Updated ${result.from} → ${result.verified}`),
      );
      if (result.restarted) {
        console.log(chalk.dim('Daemon relaunch scheduled…'));
      } else if (hosted) {
        console.log(
          chalk.dim('Restart daemon: xibecode update --apply --yes --restart'),
        );
      }
    }
  } else {
    console.log(chalk.red(result.error || 'Update failed'));
    console.log(chalk.dim(result.logs.slice(0, 1500)));
    process.exitCode = 1;
  }

  if (!result.ok) process.exitCode = 1;
}
