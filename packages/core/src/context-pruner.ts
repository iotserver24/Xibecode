/**
 * Lightweight context pruning: score files by relevance to the task
 * so we can cap what gets suggested to the agent and reduce tokens.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import fg from 'fast-glob';

const DEFAULT_MAX_FILES = 40;
const DEFAULT_EXTENSIONS = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs', '*.cjs', '*.py', '*.go', '*.rs', '*.java', '*.md', '*.json'];
const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__', '.venv', 'vendor'];

export interface PruneOptions {
  maxFiles?: number;
  extensions?: string[];
  /** If true, include a simple content snippet (first 500 chars) in scoring. */
  useContent?: boolean;
  /** If true, augment with PKG-style code graph (AST/import-based relevance). Requires CodeGraph. */
  usePkgStyleContext?: boolean;
}

/**
 * Extract meaningful words from the task (ignore stopwords, short tokens).
 */
function taskWords(task: string): Set<string> {
  const stop = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'has', 'can', 'will', 'are', 'was', 'were', 'been', 'being', 'into', 'through', 'during', 'before', 'after', 'when', 'where', 'which', 'what', 'your', 'need', 'add', 'fix', 'make', 'use', 'file', 'files', 'code']);
  const normalized = task.toLowerCase().replace(/[^\w\s]/g, ' ');
  const words = new Set<string>();
  for (const w of normalized.split(/\s+/)) {
    if (w.length >= 2 && !stop.has(w)) words.add(w);
  }
  return words;
}

/**
 * Score a file path (and optionally a content snippet) against task words.
 * Returns a number >= 0; higher = more relevant.
 */
function scorePathAndContent(filePath: string, content: string | null, words: Set<string>): number {
  const pathLower = filePath.toLowerCase().replace(/\\/g, '/');
  const pathParts = pathLower.split('/');
  let score = 0;
  for (const w of words) {
    if (pathLower.includes(w)) {
      // Prefer matches in filename over deep path
      const fileName = pathParts[pathParts.length - 1] ?? '';
      if (fileName.includes(w)) score += 3;
      else score += 1;
    }
  }
  if (content) {
    const contentLower = content.toLowerCase();
    for (const w of words) {
      if (contentLower.includes(w)) score += 1;
    }
  }
  return score;
}

/**
 * List candidate files in workingDir (by extensions), optionally read a small
 * content preview, score by relevance to the task, and return top maxFiles paths.
 * When usePkgStyleContext is true, augments with PKG-style code graph (AST) results.
 */
export async function pruneContext(
  workingDir: string,
  task: string,
  options: PruneOptions = {}
): Promise<string[]> {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const useContent = options.useContent ?? false;
  const usePkgStyleContext = options.usePkgStyleContext ?? false;

  const words = taskWords(task);
  const patterns = extensions.map(ext => `**/${ext}`);
  const ignore = IGNORE_DIRS.map(d => `**/${d}/**`);
  const files = words.size > 0
    ? await fg(patterns, { cwd: workingDir, absolute: false, ignore, onlyFiles: true })
    : [];

  const scored: { path: string; score: number }[] = [];

  for (const rel of files) {
    let content: string | null = null;
    if (useContent) {
      try {
        const full = path.join(workingDir, rel);
        const buf = await fs.readFile(full, 'utf-8').catch(() => '');
        content = buf.slice(0, 500);
      } catch {
        // skip content
      }
    }
    const score = scorePathAndContent(rel, content, words);
    scored.push({ path: rel, score });
  }

  scored.sort((a, b) => b.score - a.score);

  const withScore = scored.filter(s => s.score > 0);
  let top = withScore.length > 0
    ? withScore.slice(0, maxFiles).map(s => s.path)
    : scored.slice(0, maxFiles).map(s => s.path);

  if (usePkgStyleContext && task.trim().length > 0) {
    try {
      const { CodeGraph } = await import('./code-graph.js');
      const codeGraph = new CodeGraph(workingDir);
      const graphResults = await codeGraph.search(task.trim().slice(0, 100));
      const graphPaths = [...new Set(graphResults.map(r => r.filePath).filter(Boolean))];
      const combined = [...new Set([...top, ...graphPaths])].slice(0, maxFiles);
      top = combined;
    } catch {
      // Non-fatal: fall back to keyword-only
    }
  }

  return top;
}
