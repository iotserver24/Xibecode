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

export async function cloudPullCommand(options: CloudPullOptions): Promise<void> {
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

  const targetDir = options.apply
    ? process.cwd()
    : path.resolve(
      options.output?.trim() || path.join(process.cwd(), '.xibecode', `sandbox-pull-${timestampLabel()}`),
    );

  await ensureEmptyDir(targetDir, Boolean(options.force || options.apply));
  console.log(chalk.cyan(`Pulling sandbox workspace from session ${sessionId}...`));
  const archive = await downloadSandboxExportArchive(remoteExecution, sessionId);

  const tempArchivePath = path.join(os.tmpdir(), `xibecode-sandbox-pull-${Date.now()}.tar.gz`);
  await fs.writeFile(tempArchivePath, archive);
  try {
    await extractTarGz(tempArchivePath, targetDir);
  } finally {
    await fs.rm(tempArchivePath, { force: true }).catch(() => undefined);
  }

  if (options.apply) {
    console.log(chalk.green(`Applied sandbox workspace into ${targetDir}`));
  } else {
    console.log(chalk.green(`Downloaded sandbox workspace to ${targetDir}`));
    console.log(chalk.dim('Review and copy files locally when ready.'));
  }
}
