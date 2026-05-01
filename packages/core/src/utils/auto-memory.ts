/**
 * Auto-load project memories when a session starts (OpenClaude-aligned).
 * Keyword relevance scoring; optional env to disable.
 */

import { existsSync } from 'fs';
import { readFile, readdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

export type LoadedMemory = {
  path: string;
  content: string;
  relevance: number;
  type: 'project' | 'user' | 'auto';
};

export type ProjectMemoryContext = {
  projectName: string;
  gitRoot: string | null;
  recentTools: string[];
  query: string;
};

const MEMORY_RELEVANCE_THRESHOLD = 0.3;
const MAX_AUTO_LOAD_MEMORIES = 5;
const MAX_MEMORY_CONTENT_LENGTH = 2000;

function getProjectIdentifier(cwd: string): string {
  return cwd.split(/[/\\]/).pop() ?? 'unknown';
}

/**
 * Simple keyword-based relevance scoring (OpenClaude parity; embeddings later).
 */
function calculateRelevance(memoryContent: string, context: ProjectMemoryContext): number {
  const content = memoryContent.toLowerCase();
  let score = 0;

  if (content.includes(context.projectName.toLowerCase())) {
    score += 0.4;
  }

  for (const tool of context.recentTools) {
    if (content.includes(tool.toLowerCase())) {
      score += 0.2;
    }
  }

  const queryWords = context.query.toLowerCase().split(/\s+/);
  let matchCount = 0;
  for (const word of queryWords) {
    if (word.length > 3 && content.includes(word)) {
      matchCount++;
    }
  }
  if (queryWords.length > 0) {
    score += (matchCount / queryWords.length) * 0.3;
  }

  if (
    content.includes('decision') ||
    content.includes('pattern') ||
    content.includes('architecture') ||
    content.includes('convention')
  ) {
    score += 0.1;
  }

  return Math.min(score, 1.0);
}

async function loadMemoryFile(
  filePath: string,
  type: LoadedMemory['type'],
): Promise<LoadedMemory | null> {
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    const content = await readFile(filePath, 'utf-8');
    return {
      path: filePath,
      content: content.slice(0, MAX_MEMORY_CONTENT_LENGTH),
      relevance: 0,
      type,
    };
  } catch {
    return null;
  }
}

function xibecodeConfigHome(): string {
  return join(homedir(), '.xibecode');
}

/** User-level index: ~/.xibecode/memory/MEMORY.md */
async function loadUserMemories(): Promise<LoadedMemory[]> {
  const memoryDir = join(xibecodeConfigHome(), 'memory');
  const memories: LoadedMemory[] = [];
  const indexPath = join(memoryDir, 'MEMORY.md');
  const index = await loadMemoryFile(indexPath, 'user');
  if (index) {
    memories.push(index);
  }
  return memories;
}

/** Project `.xibecode/memory.md` plus flat `.xibecode/memories/*.md` snippets */
async function loadProjectMemories(cwd: string): Promise<LoadedMemory[]> {
  const memories: LoadedMemory[] = [];

  const entrypoint = join(cwd, '.xibecode', 'memory.md');
  const entry = await loadMemoryFile(entrypoint, 'project');
  if (entry) {
    memories.push(entry);
  }

  const autoDir = join(cwd, '.xibecode', 'memories');
  if (!existsSync(autoDir)) {
    return memories;
  }

  try {
    const names = await readdir(autoDir, { withFileTypes: true });
    const mdFiles = names.filter((d) => d.isFile() && d.name.endsWith('.md')).map((d) => join(autoDir, d.name));
    for (const fp of mdFiles.slice(0, MAX_AUTO_LOAD_MEMORIES)) {
      const loaded = await loadMemoryFile(fp, 'auto');
      if (loaded) {
        memories.push(loaded);
      }
    }
  } catch {
    /* ignore */
  }

  return memories;
}

function rankMemories(memories: LoadedMemory[], context: ProjectMemoryContext): LoadedMemory[] {
  const scored = memories.map((mem) => ({
    ...mem,
    relevance: calculateRelevance(mem.content, context),
  }));

  return scored
    .filter((mem) => mem.relevance >= MEMORY_RELEVANCE_THRESHOLD)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, MAX_AUTO_LOAD_MEMORIES);
}

/**
 * Auto-load relevant markdown memories for the current session (call once per run).
 */
export async function autoLoadProjectMemories(
  cwd: string,
  query: string = '',
  recentTools: string[] = [],
): Promise<LoadedMemory[]> {
  const projectName = getProjectIdentifier(cwd);
  const context: ProjectMemoryContext = {
    projectName,
    gitRoot: cwd,
    recentTools,
    query,
  };

  const [userMemories, projectMemories] = await Promise.all([
    loadUserMemories(),
    loadProjectMemories(cwd),
  ]);

  const allMemories = [...userMemories, ...projectMemories];
  return rankMemories(allMemories, context);
}

/** Format ranked memories for system prompt (OpenClaude-style HTML comments + sections). */
export function formatMemoriesForContext(memories: LoadedMemory[]): string {
  if (memories.length === 0) {
    return '';
  }

  const sections = memories.map((mem) => {
    const header = `<!-- ${mem.type} memory: ${mem.path} (relevance: ${(mem.relevance * 100).toFixed(0)}%) -->`;
    return `${header}\n${mem.content}`;
  });

  return `\n\n## Relevant Project Memories\n\n${sections.join('\n\n---\n\n')}`;
}

export function isAutoMemoryLoadEnabled(): boolean {
  if (process.env.XIBECODE_DISABLE_AUTO_MEMORY === '1' || process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY === '1') {
    return false;
  }
  if (process.env.XIBECODE_SIMPLE === '1' || process.env.CLAUDE_CODE_SIMPLE === '1') {
    return false;
  }
  return true;
}
