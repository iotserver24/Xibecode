#!/usr/bin/env node

/**
 * Syncs the version from the root package.json to all workspace packages.
 * Run via: pnpm run sync-version
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const rootPkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
const version = rootPkg.version;

const targets = [
  { name: 'electron/package.json', path: resolve(rootDir, 'electron', 'package.json') },
  { name: 'packages/core/package.json', path: resolve(rootDir, 'packages', 'core', 'package.json') },
  { name: 'packages/cli/package.json', path: resolve(rootDir, 'packages', 'cli', 'package.json') },
];

let changed = false;

for (const target of targets) {
  const pkg = JSON.parse(readFileSync(target.path, 'utf8'));
  if (pkg.version === version) {
    console.log(`${target.name} already at version ${version} — no change needed.`);
    continue;
  }
  pkg.version = version;
  writeFileSync(target.path, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Synced ${target.name} version: ${pkg.version} -> ${version}`);
  changed = true;
}

if (!changed) {
  console.log('All packages already at the correct version.');
}
