import { createRequire } from 'node:module';
import chalk from 'chalk';
import {
  CHANGELOG_URL,
  compareSemverCore,
  getNpmLatestVersion,
} from '../utils/npm-update-notice.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version?: string };

export async function whatsNewCommand() {
  const current = pkg.version ?? '0.0.0';
  try {
    const { latest } = await getNpmLatestVersion({ forceRefresh: true, timeoutMs: 5_000 });
    const cmp = compareSemverCore(latest, current);
    console.log(chalk.bold(`xibecode ${current}`));
    console.log(`npm latest: ${latest}`);
    if (cmp > 0) {
      console.log(chalk.yellow(`\nA newer version is available (${latest}).`));
      console.log(`Changelog: ${CHANGELOG_URL}`);
      console.log('\nUpgrade: ' + chalk.cyan('pnpm add -g xibecode@latest') + '  or  ' + chalk.cyan('npm i -g xibecode@latest'));
    } else if (cmp === 0) {
      console.log(chalk.green('\nYou are on the latest published version.'));
    } else {
      console.log(chalk.dim('\nYour build is ahead of npm (pre-release or local install).'));
    }
    console.log(chalk.dim(`\nRelease history: ${CHANGELOG_URL}`));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(chalk.red(`Could not check npm: ${msg}`));
    console.log(chalk.dim(`See ${CHANGELOG_URL} for release notes.`));
    process.exitCode = 1;
  }
}
