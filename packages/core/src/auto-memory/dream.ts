/**
 * Dream consolidation - periodically consolidates, merges, and prunes memories.
 *
 * 4-phase process:
 *   1. Orient: Read current memories, understand the landscape
 *   2. Gather: Find related/overlapping memories
 *   3. Consolidate: Merge overlapping memories, deduplicate
 *   4. Prune: Remove stale or superseded memories
 *
 * Gating: Only runs after a minimum number of sessions and time since last dream.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { DreamConsolidationResult, MemoryFile } from './memory-types.js';
import { scanMemories, ensureMemoryDir, parseFrontmatter, serializeMemory } from './memory-scan.js';

export interface DreamOptions {
  cwd?: string;
  baseDir?: string;
  /** Minimum age in hours before a memory can be pruned (default: 168 = 7 days) */
  pruneMinAgeHours?: number;
  /** Maximum number of memories after pruning (default: 100) */
  maxMemories?: number;
}

const DREAM_MARKER_FILE = '.last-dream';

/**
 * Run the dream consolidation process.
 */
export async function runDreamConsolidation(options: DreamOptions): Promise<DreamConsolidationResult> {
  const result: DreamConsolidationResult = { created: 0, merged: 0, pruned: 0, errors: [] };
  const pruneMinAgeMs = (options.pruneMinAgeHours ?? 168) * 60 * 60 * 1000;
  const maxMemories = options.maxMemories ?? 100;

  // Phase 1: Orient - scan all memories
  const scanResult = await scanMemories(options.cwd, options.baseDir);
  const memories = scanResult.memories;

  if (memories.length === 0) return result;

  // Phase 2: Gather - find overlapping memories
  const groups = findOverlappingGroups(memories);

  // Phase 3: Consolidate - merge overlapping groups
  for (const group of groups) {
    if (group.length <= 1) continue;

    try {
      const merged = mergeMemoryGroup(group);
      const mergedPath = path.join(scanResult.memoryDir, merged.filename);

      // Write merged memory
      await fs.writeFile(mergedPath, serializeMemory(merged.frontmatter, merged.content), 'utf-8');

      // Remove original memories
      for (const original of group) {
        try {
          await fs.unlink(original.path);
        } catch {
          // Already deleted
        }
      }

      result.merged++;
    } catch (err: any) {
      result.errors.push(`Merge failed: ${err?.message || String(err)}`);
    }
  }

  // Phase 4: Prune - remove stale memories
  const now = Date.now();
  const reScan = await scanMemories(options.cwd, options.baseDir);

  for (const memory of reScan.memories) {
    const age = now - memory.mtime.getTime();

    // Don't prune recent memories
    if (age < pruneMinAgeMs) continue;

    // Prune if we're over the limit (oldest first)
    if (reScan.memories.length - result.pruned > maxMemories) {
      try {
        await fs.unlink(memory.path);
        result.pruned++;
      } catch {
        // Already deleted
      }
    }
  }

  // Update dream marker
  try {
    const memoryDir = await ensureMemoryDir(options.cwd, options.baseDir);
    const markerPath = path.join(memoryDir, DREAM_MARKER_FILE);
    await fs.writeFile(markerPath, new Date().toISOString(), 'utf-8');
  } catch {
    // Non-critical
  }

  return result;
}

/**
 * Check if dream consolidation should run.
 * Gated by: at least 24 hours since last dream.
 */
export async function shouldRunDream(options: DreamOptions): Promise<boolean> {
  const memoryDir = await ensureMemoryDir(options.cwd, options.baseDir);
  const markerPath = path.join(memoryDir, DREAM_MARKER_FILE);

  try {
    const lastDream = await fs.readFile(markerPath, 'utf-8');
    const lastDate = new Date(lastDream.trim());
    const hoursSince = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60);
    return hoursSince >= 24;
  } catch {
    // No marker file = never dreamed = should run
    return true;
  }
}

/**
 * Find groups of overlapping memories (by tag overlap and content similarity).
 */
function findOverlappingGroups(memories: MemoryFile[]): MemoryFile[][] {
  const groups: MemoryFile[][] = [];
  const assigned = new Set<string>();

  for (let i = 0; i < memories.length; i++) {
    const a = memories[i];
    if (assigned.has(a.filename)) continue;

    const group = [a];
    assigned.add(a.filename);

    for (let j = i + 1; j < memories.length; j++) {
      const b = memories[j];
      if (assigned.has(b.filename)) continue;

      if (hasOverlap(a, b)) {
        group.push(b);
        assigned.add(b.filename);
      }
    }

    groups.push(group);
  }

  return groups;
}

/**
 * Check if two memories overlap (shared tags or similar content).
 */
function hasOverlap(a: MemoryFile, b: MemoryFile): boolean {
  // Same type is a prerequisite
  if (a.frontmatter.type !== b.frontmatter.type) return false;

  // Tag overlap
  const aTags = new Set(a.frontmatter.tags ?? []);
  const bTags = new Set(b.frontmatter.tags ?? []);
  let tagOverlap = 0;
  for (const tag of aTags) {
    if (bTags.has(tag)) tagOverlap++;
  }

  if (tagOverlap >= 2) return true;
  if (aTags.size > 0 && bTags.size > 0 && tagOverlap / Math.min(aTags.size, bTags.size) > 0.5) return true;

  // Content word overlap
  const aWords = new Set(tokenize(a.content));
  const bWords = new Set(tokenize(b.content));
  let wordOverlap = 0;
  for (const w of aWords) {
    if (bWords.has(w)) wordOverlap++;
  }

  if (wordOverlap >= 5 && wordOverlap / Math.min(aWords.size, bWords.size) > 0.3) return true;

  return false;
}

/**
 * Merge a group of overlapping memories into one.
 */
function mergeMemoryGroup(group: MemoryFile[]): MemoryFile {
  // Use the newest memory's frontmatter as base
  const base = group[0];
  const allContent = group.map((m) => `## ${m.filename}\n${m.content.trim()}`).join('\n\n');
  const allTags = [...new Set(group.flatMap((m) => m.frontmatter.tags ?? []))];

  return {
    filename: `merged-${Date.now().toString(36)}.md`,
    path: base.path, // Will be overwritten
    frontmatter: {
      ...base.frontmatter,
      tags: allTags,
      source: 'dream',
      timestamp: new Date().toISOString(),
    },
    content: allContent,
    mtime: new Date(),
  };
}

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
}
