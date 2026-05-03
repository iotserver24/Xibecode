// Build script for webview assets (placeholder — currently webview is inline HTML).
// If you later split webview into a separate React/Svelte app, this script will
// bundle it into dist/webview/.

import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Currently a no-op since webview HTML is generated inline.
// Uncomment and expand when you add a separate webview build:
//
// await build({
//   entryPoints: [resolve(__dirname, '../webview/src/index.tsx')],
//   bundle: true,
//   outdir: resolve(__dirname, '../dist/webview'),
//   format: 'iife',
//   platform: 'browser',
//   target: 'es2020',
//   sourcemap: true,
//   minify: true,
// });

console.log('[xibecode-ext] Webview build: nothing to do (inline HTML).');
