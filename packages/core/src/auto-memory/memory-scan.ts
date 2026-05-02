/**
 * Memory scanner - reads markdown memory files from the memory directory.
 *
 * Scans ~/.xibecode/projects/<sanitized-cwd>/memory/ for .md files,
 * parses YAML frontmatter, and returns sorted by mtime (newest first).
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { MemoryFile, MemoryFrontmatter, MemoryScanResult } from './memory-types.js';

const MEMORY_DIR_NAME = 'memory';
const PROJECTS_DIR_NAME = 'projects';

/**
 * Sanitize a directory path for use as a filesystem-safe directory name.
 * (Mirrors SessionManager's sanitizePath)
 */
function sanitizePath(dirPath: string): string {
  const sanitized = dirPath.replace(/[^a-zA-Z0-9]/g, '-');
  if (sanitized.length <= 60) return sanitized;
  let hash = 0;
  for (let i = 0; i < dirPath.length; i++) {
    const chr = dirPath.charCodeAt(i);
    hash = ((hash << 5) - hash + chr) | 0;
  }
  return `${sanitized.slice(0, 60)}-${Math.abs(hash).toString(36)}`;
}

/**
 * Get the memory directory path for a given working directory.
 */
export function getMemoryDir(cwd?: string, baseDir?: string): string {
  const base = baseDir || path.join(os.homedir(), '.xibecode');
  const projectDir = sanitizePath(cwd || process.cwd());
  return path.join(base, PROJECTS_DIR_NAME, projectDir, MEMORY_DIR_NAME);
}

/**
 * Get the path to the MEMORY.md entrypoint.
 */
export function getMemoryEntrypoint(cwd?: string, baseDir?: string): string {
  return path.join(getMemoryDir(cwd, baseDir), 'MEMORY.md');
}

/**
 * Scan the memory directory for all memory files.
 * Returns memories sorted by modification time (newest first).
 */
export async function scanMemories(cwd?: string, baseDir?: string): Promise<MemoryScanResult> {
  const memoryDir = getMemoryDir(cwd, baseDir);
  const memories: MemoryFile[] = [];
  let totalScanned = 0;

  try {
    const entries = await fs.readdir(memoryDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      totalScanned++;

      const filePath = path.join(memoryDir, entry.name);
      try {
        const stat = await fs.stat(filePath);
        const raw = await fs.readFile(filePath, 'utf-8');
        const { frontmatter, content } = parseFrontmatter(raw);

        memories.push({
          filename: entry.name,
          path: filePath,
          frontmatter,
          content,
          mtime: stat.mtime,
        });
      } catch {
        // Skip malformed files
      }
    }
  } catch {
    // Memory directory doesn't exist yet
  }

  // Sort by mtime, newest first
  memories.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  return { memories, totalScanned, memoryDir };
}

/**
 * Parse YAML frontmatter from a markdown string.
 *
 * Supports simple key: value pairs and arrays.
 * Does NOT require a full YAML parser.
 *
 * Format:
 *   ---
 *   key: value
 *   tags: [tag1, tag2]
 *   ---
 *   Content here
 */
export function parseFrontmatter(raw: string): { frontmatter: MemoryFrontmatter; content: string } {
  const defaultFrontmatter: MemoryFrontmatter = {
    type: 'project',
    timestamp: new Date().toISOString(),
  };

  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: defaultFrontmatter, content: raw };
  }

  const yaml = match[1];
  const content = match[2];
  const frontmatter: Record<string, any> = {};

  for (const line of yaml.split('\n')) {
    const kvMatch = line.match(/^(\w+):\s*(.+)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1];
    let value: any = kvMatch[2].trim();

    // Parse arrays: [tag1, tag2]
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((s: string) => s.trim().replace(/^['"]|['"]$/g, ''));
    }

    // Remove quotes from strings
    if (typeof value === 'string') {
      value = value.replace(/^['"]|['"]$/g, '');
    }

    frontmatter[key] = value;
  }

  return {
    frontmatter: {
      type: frontmatter.type || 'project',
      timestamp: frontmatter.timestamp || new Date().toISOString(),
      tags: frontmatter.tags || [],
      sessionId: frontmatter.sessionId,
      source: frontmatter.source,
    },
    content,
  };
}

/**
 * Serialize frontmatter + content back to a markdown string.
 */
export function serializeMemory(frontmatter: MemoryFrontmatter, content: string): string {
  const lines = ['---'];
  lines.push(`type: ${frontmatter.type}`);
  lines.push(`timestamp: ${frontmatter.timestamp}`);
  if (frontmatter.tags && frontmatter.tags.length > 0) {
    lines.push(`tags: [${frontmatter.tags.join(', ')}]`);
  }
  if (frontmatter.sessionId) {
    lines.push(`sessionId: ${frontmatter.sessionId}`);
  }
  if (frontmatter.source) {
    lines.push(`source: ${frontmatter.source}`);
  }
  lines.push('---');
  lines.push('');
  lines.push(content);
  return lines.join('\n');
}

/**
 * Ensure the memory directory exists.
 */
export async function ensureMemoryDir(cwd?: string, baseDir?: string): Promise<string> {
  const memoryDir = getMemoryDir(cwd, baseDir);
  await fs.mkdir(memoryDir, { recursive: true });
  return memoryDir;
}
