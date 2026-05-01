#!/usr/bin/env node

/**
 * Syncs the version from the root package.json to electron/package.json.
 * Run via: pnpm run sync-version
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const rootPkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
const electronPkgPath = resolve(rootDir, 'electron', 'package.json');
const electronPkg = JSON.parse(readFileSync(electronPkgPath, 'utf8'));

if (electronPkg.version === rootPkg.version) {
  console.log(`electron/package.json already at version ${rootPkg.version} — no change needed.`);
  process.exit(0);
}

electronPkg.version = rootPkg.version;
writeFileSync(electronPkgPath, JSON.stringify(electronPkg, null, 2) + '\n');
console.log(`Synced electron/package.json version: ${electronPkg.version} -> ${rootPkg.version}`);
