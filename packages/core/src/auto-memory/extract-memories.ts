/**
 * Memory extraction - runs per-turn to extract memories from conversation.
 *
 * Uses simple heuristics to identify memorable information from
 * user messages and tool results. Future: integrate LLM-based extraction.
 */

import * as path from 'path';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { ExtractedMemory, MemoryType } from './memory-types.js';
import { ensureMemoryDir, serializeMemory, getMemoryDir } from './memory-scan.js';
import * as fs from 'fs/promises';

export interface ExtractionOptions {
  /** Current working directory */
  cwd?: string;
  /** Base directory for memory storage */
  baseDir?: string;
  /** Session ID */
  sessionId?: string;
  /** Maximum extractions per turn (default: 3) */
  maxExtractions?: number;
}

/**
 * Extract memories from the latest conversation turn.
 *
 * Looks for patterns in user messages and assistant responses:
 * - User preferences ("I prefer...", "Always use...", "Never do...")
 * - Error patterns and solutions ("the issue was...", "fixed by...")
 * - Project structure insights ("this project uses...", "the main entry is...")
 */
export function extractMemoriesFromTurn(
  messages: MessageParam[],
): ExtractedMemory[] {
  const extracted: ExtractedMemory[] = [];
  const maxExtractions = 3;

  // Get the last few messages (the current turn)
  const recent = messages.slice(-6);

  for (const msg of recent) {
    if (extracted.length >= maxExtractions) break;

    const text = messageText(msg);
    if (!text) continue;

    // Pattern: User preferences
    const preferenceMatch = text.match(/(?:I\s+prefer|always\s+use|never\s+(?:use|do)|I\s+(?:always|never)|make\s+sure\s+to)\s+(.{10,100})/i);
    if (preferenceMatch) {
      extracted.push({
        type: 'user',
        content: preferenceMatch[0].trim(),
        tags: ['preference'],
        trigger: 'User stated a preference',
      });
      continue;
    }

    // Pattern: Error and solution
    const errorSolutionMatch = text.match(/(?:the\s+issue\s+was|fixed\s+by|problem\s+was|root\s+cause|error\s+was)\s+(.{10,150})/i);
    if (errorSolutionMatch) {
      extracted.push({
        type: 'feedback',
        content: errorSolutionMatch[0].trim(),
        tags: ['bugfix', 'debugging'],
        trigger: 'Error solution identified',
      });
      continue;
    }

    // Pattern: Project structure
    const projectMatch = text.match(/(?:this\s+project\s+uses|the\s+(?:main|primary|entry)\s+(?:point|file)|this\s+codebase\s+(?:is|uses|has))\s+(.{10,150})/i);
    if (projectMatch) {
      extracted.push({
        type: 'project',
        content: projectMatch[0].trim(),
        tags: ['architecture'],
        trigger: 'Project structure insight',
      });
      continue;
    }
  }

  return extracted;
}

/**
 * Write extracted memories to disk.
 */
export async function writeExtractedMemories(
  memories: ExtractedMemory[],
  options: ExtractionOptions,
): Promise<number> {
  if (memories.length === 0) return 0;

  const memoryDir = await ensureMemoryDir(options.cwd, options.baseDir);
  let written = 0;

  for (const memory of memories) {
    const timestamp = new Date().toISOString();
    const id = `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const filename = `${id}.md`;
    const filePath = path.join(memoryDir, filename);

    const frontmatter = {
      type: memory.type,
      timestamp,
      tags: memory.tags,
      sessionId: options.sessionId,
      source: 'extraction' as const,
    };

    const content = serializeMemory(frontmatter, memory.content);

    try {
      await fs.writeFile(filePath, content, 'utf-8');
      written++;
    } catch {
      // Skip failed writes
    }
  }

  // Update MEMORY.md entrypoint
  await updateMemoryEntrypoint(options.cwd, options.baseDir);

  return written;
}

/**
 * Update the MEMORY.md entrypoint with a summary of all memories.
 */
async function updateMemoryEntrypoint(cwd?: string, baseDir?: string): Promise<void> {
  const { scanMemories, getMemoryEntrypoint } = await import('./memory-scan.js');
  const { formatMemoriesForContext } = await import('./find-relevant.js');

  const result = await scanMemories(cwd, baseDir);
  if (result.memories.length === 0) return;

  const entrypointPath = getMemoryEntrypoint(cwd, baseDir);
  const content = `# Project Memory Index\n\nAuto-generated index of project memories.\nLast updated: ${new Date().toISOString()}\n\n${formatMemoriesForContext(result.memories.slice(0, 20))}\n`;

  try {
    await fs.writeFile(entrypointPath, content, 'utf-8');
  } catch {
    // Non-critical
  }
}

/**
 * Extract the text content from a MessageParam.
 */
function messageText(msg: MessageParam): string {
  const content = msg.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((block): block is { type: 'text'; text: string } =>
        typeof block === 'object' && 'type' in block && block.type === 'text')
      .map((block) => block.text)
      .join(' ');
  }
  return '';
}
