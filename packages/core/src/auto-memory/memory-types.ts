/**
 * Auto-memory type definitions.
 *
 * Memories are stored as markdown files with YAML frontmatter:
 *   ---
 *   type: user | feedback | project | reference
 *   timestamp: 2025-01-01T00:00:00Z
 *   tags: [tag1, tag2]
 *   ---
 *   Memory content here...
 */

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

export interface MemoryFrontmatter {
  type: MemoryType;
  timestamp: string;
  tags?: string[];
  /** Source session ID */
  sessionId?: string;
  /** Source that created this memory */
  source?: 'agent' | 'extraction' | 'dream' | 'manual';
}

export interface MemoryFile {
  /** Filename (without directory) */
  filename: string;
  /** Full path on disk */
  path: string;
  /** Parsed frontmatter */
  frontmatter: MemoryFrontmatter;
  /** Markdown body content */
  content: string;
  /** File modification time */
  mtime: Date;
}

export interface MemoryScanResult {
  memories: MemoryFile[];
  totalScanned: number;
  memoryDir: string;
}

export interface ExtractedMemory {
  type: MemoryType;
  content: string;
  tags: string[];
  /** The context that triggered this memory */
  trigger: string;
}

export interface DreamConsolidationResult {
  created: number;
  merged: number;
  pruned: number;
  errors: string[];
}

export interface AutoMemoryConfig {
  /** Whether auto-memory is enabled (default: true) */
  enabled: boolean;
  /** Maximum number of memories to inject into context (default: 5) */
  maxContextMemories: number;
  /** Maximum extraction turns per session (default: 5) */
  maxExtractionTurns: number;
  /** Whether dream consolidation is enabled (default: true) */
  dreamEnabled: boolean;
  /** Minimum age in hours before a memory can be pruned (default: 168 = 7 days) */
  pruneMinAgeHours: number;
}
