import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { ConfigManager } from '../utils/config.js';
import { resolveRemoteExecutionConfig } from '../utils/remote-execution.js';
import { downloadSandboxExportArchive } from '../utils/cloud-gateway.js';

export interface CloudPullOptions {
  profile?: string;
  session?: string;
  output?: string;
  apply?: boolean;
  force?: boolean;
  /**
   * With `--apply`, extract every file from the archive onto cwd (legacy).
   * Default false: merge only files that are new or differ from local (skips identical files).
   */
  full?: boolean;
  onStatus?: (line: string) => void;
}

function timestampLabel(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function ensureEmptyDir(target: string, force: boolean): Promise<void> {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(target);
  if (entries.length > 0 && !force) {
    throw new Error(`Target directory is not empty: ${target}. Re-run with --force to overwrite.`);
  }
}

async function extractTarGz(archivePath: string, targetDir: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('tar', ['-xzf', archivePath, '-C', targetDir], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`tar extraction failed (${code}): ${stderr.trim() || 'no stderr'}`));
        return;
      }
      resolve();
    });
  });
}

async function filesContentEqual(aPath: string, bPath: string): Promise<boolean> {
  const [stA, stB] = await Promise.all([fs.stat(aPath), fs.stat(bPath)]);
  if (!stA.isFile() || !stB.isFile()) {
    return false;
  }
  if (stA.size !== stB.size) {
    return false;
  }
  if (stA.size === 0) {
    return true;
  }
  const [bufA, bufB] = await Promise.all([fs.readFile(aPath), fs.readFile(bPath)]);
  return bufA.equals(bufB);
}

/** Relative paths using / (suitable for logs); walking with platform paths internally. */
async function* walkFilesRecursive(rootDir: string): AsyncGenerator<string> {
  const stack: string[] = [''];
  while (stack.length > 0) {
    const rel = stack.pop()!;
    const absDir = path.join(rootDir, rel);
    const entries = await fs.readdir(absDir, { withFileTypes: true });
    for (const ent of entries) {
      const name = ent.name;
      const childRel = rel ? `${rel}/${name}` : name;
      if (ent.isDirectory()) {
        stack.push(childRel);
      } else if (ent.isFile()) {
        yield childRel;
      }
    }
  }
}

/**
 * Copy sandbox files into localRoot when missing or content differs.
 * Does not delete local files missing from the sandbox.
 */
async function mergeSandboxTreeIntoLocal(
  sandboxRoot: string,
  localRoot: string,
): Promise<{ added: number; updated: number; unchanged: number; skipped: number }> {
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  for await (const relSlash of walkFilesRecursive(sandboxRoot)) {
    const from = path.join(sandboxRoot, relSlash);
    const to = path.join(localRoot, relSlash);

    let localStat: Awaited<ReturnType<typeof fs.stat>> | undefined;
    try {
      localStat = await fs.stat(to);
    } catch {
      localStat = undefined;
    }

    if (localStat?.isDirectory()) {
      skipped += 1;
      continue;
    }

    if (!localStat) {
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
      added += 1;
      continue;
    }

    if (!localStat.isFile()) {
      skipped += 1;
      continue;
    }

    if (await filesContentEqual(from, to)) {
      unchanged += 1;
    } else {
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
      updated += 1;
    }
  }

  return { added, updated, unchanged, skipped };
}

export async function cloudPullCommand(options: CloudPullOptions): Promise<void> {
  const log = options.onStatus ?? ((line: string) => console.log(line));
  const formatInfo = (line: string) => (options.onStatus ? line : chalk.cyan(line));
  const formatSuccess = (line: string) => (options.onStatus ? line : chalk.green(line));
  const formatHint = (line: string) => (options.onStatus ? line : chalk.dim(line));
  const config = new ConfigManager(options.profile);
  process.env.XIBECODE_SANDBOX_MODE = 'e2b';
  const remoteExecution = resolveRemoteExecutionConfig(config, process.cwd());
  if (!remoteExecution) {
    throw new Error('Cloud runtime is not configured. Set sandbox gateway first.');
  }
  if (remoteExecution.strategy !== 'sandbox_full') {
    throw new Error('cloud pull requires sandbox_full strategy (set sandbox session strategy to sandbox_full).');
  }
  const sessionId = options.session?.trim() || process.env.XIBECODE_SANDBOX_SESSION_ID?.trim();
  if (!sessionId) {
    throw new Error('Missing session ID. Use --session <id> (or set XIBECODE_SANDBOX_SESSION_ID).');
  }
  remoteExecution.sessionId = sessionId;

  const cwd = process.cwd();
  const applyFull = Boolean(options.apply && options.full);
  const applyMerge = Boolean(options.apply && !options.full);

  const targetDir = options.apply
    ? cwd
    : path.resolve(
      options.output?.trim() || path.join(cwd, '.xibecode', `sandbox-pull-${timestampLabel()}`),
    );

  await ensureEmptyDir(targetDir, Boolean(options.force || options.apply));
  log(formatInfo(`Pulling sandbox workspace from session ${sessionId}...`));
  const archive = await downloadSandboxExportArchive(remoteExecution, sessionId);

  const tempArchivePath = path.join(os.tmpdir(), `xibecode-sandbox-pull-${Date.now()}.tar.gz`);
  await fs.writeFile(tempArchivePath, archive);
  const tempExtractDir = applyMerge ? await fs.mkdtemp(path.join(os.tmpdir(), 'xibecode-sandbox-merge-')) : null;
  try {
    if (applyMerge && tempExtractDir) {
      await extractTarGz(tempArchivePath, tempExtractDir);
      const stats = await mergeSandboxTreeIntoLocal(tempExtractDir, targetDir);
      log(
        formatSuccess(
          `Merged sandbox into ${targetDir}: ${stats.added} added, ${stats.updated} updated, ${stats.unchanged} unchanged` +
            (stats.skipped > 0 ? `, ${stats.skipped} skipped (local not a file)` : ''),
        ),
      );
    } else {
      await extractTarGz(tempArchivePath, targetDir);
    }
  } finally {
    await fs.rm(tempArchivePath, { force: true }).catch(() => undefined);
    if (tempExtractDir) {
      await fs.rm(tempExtractDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  if (options.apply) {
    if (applyFull) {
      log(formatSuccess(`Applied full sandbox workspace into ${targetDir}`));
    }
  } else {
    log(formatSuccess(`Downloaded sandbox workspace to ${targetDir}`));
    log(formatHint('Review and copy files locally when ready.'));
  }
}
