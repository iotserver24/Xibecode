import * as fs from 'fs/promises';
import * as path from 'path';
import { createRequire } from 'module';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import { EnhancedUI } from '../ui/enhanced-tui.js';
import { GitUtils } from '../utils/git.js';
import { ConfigManager } from '../utils/config.js';

const execAsync = promisify(exec);
const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

interface DiagnosticsOptions {
  output?: string;
  includeDiff?: boolean;
  diffTarget?: string;
  verbose?: boolean;
  profile?: string;
}

function redactLine(line: string): string {
  // Common "KEY=VALUE" patterns
  const eqIdx = line.indexOf('=');
  if (eqIdx > 0) {
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1);
    if (/(key|token|secret|password|auth|cookie)/i.test(key)) {
      return `${key}=[REDACTED]`;
    }
    // If value looks like a bearer token / api key, redact it.
    if (/\b(bearer|sk-|xoxb-|ghp_|github_pat_)\b/i.test(value) || value.trim().length > 80) {
      return `${key}=[REDACTED]`;
    }
  }

  // Inline token patterns
  return line
    .replace(/(bearer\s+)[a-z0-9._-]+/gi, '$1[REDACTED]')
    .replace(/\b(sk-[a-z0-9]{16,})\b/gi, '[REDACTED]')
    .replace(/\b(ghp_[a-zA-Z0-9]{20,})\b/g, '[REDACTED]')
    .replace(/\b(github_pat_[a-zA-Z0-9_]{20,})\b/g, '[REDACTED]');
}

async function safeExec(cmd: string, cwd: string): Promise<{ ok: true; out: string } | { ok: false; error: string }> {
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd,
      timeout: 8000,
      maxBuffer: 1024 * 1024,
    });
    const out = [stdout?.trim(), stderr?.trim()].filter(Boolean).join('\n').trim();
    return { ok: true, out };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function formatSection(title: string, lines: string[]): string {
  const body = lines.length ? lines : ['(none)'];
  return [`## ${title}`, ...body.map(l => redactLine(l)), ''].join('\n');
}

export async function diagnosticsCommand(options: DiagnosticsOptions) {
  const ui = new EnhancedUI(Boolean(options.verbose));
  const cwd = process.cwd();
  const git = new GitUtils(cwd);
  const config = new ConfigManager(options.profile);

  const ts = new Date();
  const stamp = ts.toISOString().replace(/[:.]/g, '-');
  const outPath = options.output
    ? path.resolve(cwd, options.output)
    : path.resolve(cwd, 'tmp', `xibecode-diagnostics-${stamp}.md`);

  await fs.mkdir(path.dirname(outPath), { recursive: true });

  ui.header(pkg.version);
  console.log(chalk.bold.white('🩺 Diagnostics bundle\n'));
  console.log(chalk.gray(`  Writing: ${outPath}\n`));

  const sections: string[] = [];

  sections.push(formatSection('XibeCode', [
    `version=${pkg.version}`,
    `profile=${config.getProfileName()}`,
    `node=${process.version}`,
    `platform=${process.platform}`,
    `arch=${process.arch}`,
    `cwd=${cwd}`,
  ]));

  const pnpm = await safeExec('pnpm -v', cwd);
  const bun = await safeExec('bun -v', cwd);
  const gitBin = await safeExec('git --version', cwd);
  sections.push(formatSection('Tooling versions', [
    `pnpm=${pnpm.ok ? pnpm.out : `(unavailable) ${pnpm.error}`}`,
    `bun=${bun.ok ? bun.out : `(unavailable) ${bun.error}`}`,
    `git=${gitBin.ok ? gitBin.out : `(unavailable) ${gitBin.error}`}`,
  ]));

  const envKeys = Object.keys(process.env)
    .sort((a, b) => a.localeCompare(b))
    .map(k => `${k}=${process.env[k] ?? ''}`);
  sections.push(formatSection('Environment (keys + redacted values)', envKeys));

  const gitStatus = await git.getStatus();
  if (!gitStatus.isGitRepo) {
    sections.push(formatSection('Git', ['not a git repository']));
  } else {
    const statusLines: string[] = [];
    statusLines.push(`branch=${gitStatus.branch ?? '(unknown)'}`);
    statusLines.push(`clean=${String(Boolean(gitStatus.isClean))}`);
    statusLines.push(`ahead=${gitStatus.ahead ?? 0}`);
    statusLines.push(`behind=${gitStatus.behind ?? 0}`);
    statusLines.push(`staged=${(gitStatus.staged ?? []).length}`);
    statusLines.push(`unstaged=${(gitStatus.unstaged ?? []).length}`);
    statusLines.push(`untracked=${(gitStatus.untracked ?? []).length}`);
    sections.push(formatSection('Git status', statusLines));

    const diffTarget = options.diffTarget || 'HEAD';
    const diffSummary = await git.getDiffSummary(diffTarget);
    const diffLines = [
      `target=${diffTarget}`,
      `files=${diffSummary.totalFiles}`,
      `insertions=${diffSummary.totalInsertions}`,
      `deletions=${diffSummary.totalDeletions}`,
    ];
    const topFiles = diffSummary.files
      .slice()
      .sort((a, b) => b.changes - a.changes)
      .slice(0, 25)
      .map(f => `${f.changes.toString().padStart(5)}  +${f.insertions}/-${f.deletions}  ${f.path}`);
    sections.push(formatSection('Git diff summary', [...diffLines, '', ...topFiles]));

    if (options.includeDiff) {
      const unified = await git.getUnifiedDiff(undefined, diffTarget);
      const capped = unified.length > 200_000
        ? unified.slice(0, 200_000) + '\n\n[diff truncated at 200k chars]\n'
        : unified;
      sections.push(['## Git unified diff (redacted, may be truncated)', redactLine(capped), ''].join('\n'));
    }
  }

  const report = [
    `# XibeCode diagnostics`,
    ``,
    `_Generated: ${ts.toISOString()}_`,
    ``,
    ...sections,
  ].join('\n');

  await fs.writeFile(outPath, report, 'utf-8');

  ui.success('Diagnostics written.');
  console.log(chalk.dim('  Attach this file when reporting issues.'));
}

