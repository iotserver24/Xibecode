#!/usr/bin/env node
/**
 * Dev runner: `tsx` bundles deps with esbuild in CJS mode, which breaks
 * `yoga-layout` (top-level await, used by Ink). Build with `tsc` and run
 * `node --watch dist/index.js` so native ESM loads yoga-layout correctly.
 */
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let forwarded = process.argv.slice(2);
if (forwarded[0] === '--') {
  forwarded = forwarded.slice(1);
}
const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

execSync(`${pnpmCmd} exec tsc`, { cwd: root, stdio: 'inherit', shell: true });

const interactiveCommands = new Set(['config', 'chat']);
// `bun run dev <cmd>` doesn't always report TTY consistently, but interactive
// subcommands still need stable stdio (no watcher noise, no restarts).
const isInteractiveRun = forwarded.length > 0 && interactiveCommands.has(forwarded[0]);

const tscWatch = spawn(pnpmCmd, ['exec', 'tsc', '-w', '--preserveWatchOutput'], {
  cwd: root,
  // When running interactive CLI commands, silence watcher output so it doesn't
  // corrupt Inquirer/Ink rendering. The watcher still rebuilds in the background.
  stdio: isInteractiveRun ? 'ignore' : 'inherit',
  shell: process.platform === 'win32',
});

const nodeArgs = isInteractiveRun
  ? ['dist/index.js', ...forwarded]
  : ['--watch', 'dist/index.js', ...forwarded];

const nodeWatch = spawn(process.execPath, nodeArgs, {
  cwd: root,
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
