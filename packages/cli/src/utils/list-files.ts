import { spawn } from 'node:child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

export type FileEntry = {
  relativePath: string;
  isDirectory: boolean;
};

function spawnBuffer(cmd: string, args: string[], cwd: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd });
    const chunks: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => chunks.push(c));
    child.stderr.on('data', (c: Buffer) => { stderr += c.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${cmd} ${args.join(' ')} failed (${code}): ${stderr.trim() || 'no stderr'}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

function decodeNullSeparatedPaths(buf: Buffer): string[] {
  if (!buf.length) return [];
  const raw = buf.toString('utf8');
  const parts = raw.split('\0');
  return parts.filter((p) => p.length > 0);
}

async function gitRepoRoot(cwd: string): Promise<string | null> {
  try {
    const inside = (await spawnBuffer('git', ['rev-parse', '--is-inside-work-tree'], cwd)).toString('utf8').trim();
    if (inside !== 'true') return null;
    const root = (await spawnBuffer('git', ['rev-parse', '--show-toplevel'], cwd)).toString('utf8').trim();
    return root || null;
  } catch {
    return null;
  }
}

async function gitWorkspacePaths(repoRoot: string): Promise<string[]> {
  const tracked = decodeNullSeparatedPaths(await spawnBuffer('git', ['ls-files', '-z'], repoRoot));
  const untracked = decodeNullSeparatedPaths(await spawnBuffer('git', ['ls-files', '-z', '-o', '--exclude-standard'], repoRoot));
  return Array.from(new Set([...tracked, ...untracked])).sort((a, b) => a.localeCompare(b));
}

function addDirectoryEntries(paths: string[]): Set<string> {
  const dirs = new Set<string>();
  for (const filePath of paths) {
    let dir = path.posix.dirname(filePath);
    while (dir && dir !== '.') {
      dirs.add(dir);
      dir = path.posix.dirname(dir);
    }
  }
  return dirs;
}

const BASIC_SKIP = new Set(['node_modules', '.git', '.xibecode', 'dist', 'build', '.next', '.DS_Store', 'coverage']);

async function walkDir(dirPath: string, relativeSoFar: string): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    for (const item of items) {
      if (BASIC_SKIP.has(item.name)) continue;
      const relPath = relativeSoFar ? `${relativeSoFar}/${item.name}` : item.name;
      if (item.isDirectory()) {
        entries.push({ relativePath: relPath, isDirectory: true });
        const sub = await walkDir(path.join(dirPath, item.name), relPath);
        entries.push(...sub);
      } else if (item.isFile()) {
        entries.push({ relativePath: relPath, isDirectory: false });
      }
    }
  } catch {
    // skip unreadable dirs
  }
  return entries;
}

/**
 * List workspace files and directories, respecting .gitignore when inside a git repo.
 * Paths are relative to `cwd` with POSIX separators.
 */
export async function listWorkspaceFiles(cwd: string): Promise<FileEntry[]> {
  const root = await gitRepoRoot(cwd);

  if (root) {
    const paths = await gitWorkspacePaths(root);
    // Convert paths from repo-root-relative to cwd-relative
    const cwdRelativePaths = paths.map((p) => {
      const abs = path.join(root, p);
      return path.relative(cwd, abs).replace(/\\/g, '/');
    }).filter((p) => !p.startsWith('..')); // skip files outside cwd

    const dirSet = addDirectoryEntries(cwdRelativePaths);
    const entryMap = new Map<string, FileEntry>();

    for (const p of cwdRelativePaths) {
      entryMap.set(p, { relativePath: p, isDirectory: false });
    }
    for (const d of dirSet) {
      if (!entryMap.has(d)) {
        entryMap.set(d, { relativePath: d, isDirectory: true });
      }
    }

    return Array.from(entryMap.values()).sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.relativePath.localeCompare(b.relativePath);
    });
  }

  // Fallback: non-git directory walk
  const entries = await walkDir(cwd, '');
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.relativePath.localeCompare(b.relativePath);
  });
  return entries;
}
