/**
 * Find relevant memories for the current task.
 *
 * Uses keyword overlap scoring to select the most relevant memories
 * from the scanned set. Up to `maxResults` memories are returned.
 *
 * Future: integrate LLM-as-judge for semantic relevance.
 */

import type { MemoryFile, MemoryType } from './memory-types.js';

export interface RelevanceOptions {
  /** Maximum number of memories to return (default: 5) */
  maxResults?: number;
  /** Preferred memory types in priority order */
  preferredTypes?: MemoryType[];
  /** Current task/prompt to match against */
  task?: string;
}

/**
 * Find the most relevant memories from a list of scanned memories.
 *
 * Scoring: keyword overlap between task and memory content/tags,
 * weighted by memory type preference and recency.
 */
export function findRelevantMemories(
  memories: MemoryFile[],
  options?: RelevanceOptions,
): MemoryFile[] {
  const maxResults = options?.maxResults ?? 5;
  const task = options?.task ?? '';
  const preferredTypes = options?.preferredTypes ?? ['user', 'feedback', 'project', 'reference'];

  if (memories.length === 0) return [];
  if (!task) return memories.slice(0, maxResults);

  const taskTokens = tokenize(task);
  const scored = memories.map((memory) => ({
    memory,
    score: scoreMemory(memory, taskTokens, preferredTypes),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults).map((s) => s.memory);
}

/**
 * Score a single memory against task tokens.
 */
function scoreMemory(
  memory: MemoryFile,
  taskTokens: Set<string>,
  preferredTypes: MemoryType[],
): number {
  let score = 0;

  // Keyword overlap with content
  const contentTokens = tokenize(memory.content);
  for (const token of taskTokens) {
    if (contentTokens.has(token)) score += 2;
  }

  // Keyword overlap with tags
  if (memory.frontmatter.tags) {
    for (const tag of memory.frontmatter.tags) {
      const tagTokens = tokenize(tag);
      for (const token of taskTokens) {
        if (tagTokens.has(token)) score += 3;
      }
    }
  }

  // Type preference bonus
  const typeIdx = preferredTypes.indexOf(memory.frontmatter.type);
  if (typeIdx !== -1) {
    score += (preferredTypes.length - typeIdx);
  }

  // Recency bonus (within last 24 hours gets a boost)
  const ageMs = Date.now() - memory.mtime.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours < 24) score += 2;
  else if (ageHours < 168) score += 1; // within a week

  return score;
}

/**
 * Tokenize a string into a set of lowercase words, removing stopwords.
 */
function tokenize(text: string): Set<string> {
  const stopwords = new Set([
    'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'has',
    'can', 'will', 'are', 'was', 'were', 'been', 'being', 'into', 'through',
    'during', 'before', 'after', 'when', 'where', 'which', 'what', 'your',
    'need', 'add', 'fix', 'make', 'use', 'file', 'files', 'code', 'not',
  ]);

  const words = new Set<string>();
  const normalized = text.toLowerCase().replace(/[^\w\s]/g, ' ');
  for (const w of normalized.split(/\s+/)) {
    if (w.length > 2 && !stopwords.has(w)) {
      words.add(w);
    }
  }
  return words;
}

/**
 * Format memories for injection into the agent context.
 */
export function formatMemoriesForContext(memories: MemoryFile[]): string {
  if (memories.length === 0) return '';

  const parts = memories.map((m) => {
    const tags = m.frontmatter.tags?.length
      ? ` [${m.frontmatter.tags.join(', ')}]`
      : '';
    return `### ${m.frontmatter.type}${tags}\n${m.content.trim()}`;
  });

  return `# Project Memories\n\n${parts.join('\n\n')}`;
}
