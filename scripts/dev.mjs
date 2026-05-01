#!/usr/bin/env node
/**
 * Dev runner for the monorepo.
 * Builds all packages with turbo, then runs the CLI with --watch.
 */
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cliDir = join(root, 'packages', 'cli');
let forwarded = process.argv.slice(2);
if (forwarded[0] === '--') {
  forwarded = forwarded.slice(1);
}
const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

// Initial build
execSync(`${pnpmCmd} run build`, { cwd: root, stdio: 'inherit', shell: true });

const interactiveCommands = new Set(['config', 'chat']);
const isInteractiveRun = forwarded.length > 0 && interactiveCommands.has(forwarded[0]);

// Watch CLI package TypeScript
const tscWatch = spawn(pnpmCmd, ['exec', 'tsc', '-w', '--preserveWatchOutput'], {
  cwd: cliDir,
  stdio: isInteractiveRun ? 'ignore' : 'inherit',
  shell: process.platform === 'win32',
});

const nodeArgs = isInteractiveRun
  ? ['dist/index.js', ...forwarded]
  : ['--watch', 'dist/index.js', ...forwarded];

const nodeWatch = spawn(process.execPath, nodeArgs, {
  cwd: cliDir,
  stdio: 'inherit',
});

function shutdown(code = 0) {
  for (const child of [tscWatch, nodeWatch]) {
    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
  }
  process.exit(code);
}

process.once('SIGINT', () => shutdown(130));
process.once('SIGTERM', () => shutdown(0));

tscWatch.once('exit', (code, signal) => {
  if (signal) {
    return;
  }
  if (code !== 0 && code !== null) {
    nodeWatch.kill('SIGTERM');
    process.exit(code);
  }
});

nodeWatch.once('exit', (code) => {
  tscWatch.kill('SIGTERM');
  process.exit(code ?? 0);
});
