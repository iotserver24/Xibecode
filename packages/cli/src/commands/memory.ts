/**
 * Memory command - manage project auto-memories.
 *
 * Usage:
 *   xc memory list              List all memories for this project
 *   xc memory search <query>    Search memories by keyword
 *   xc memory dream             Force dream consolidation
 *   xc memory path              Show memory directory path
 */

import { AutoMemoryManager, type MemoryFile } from 'xibecode-core';

export async function memoryCommand(
  action: string | undefined,
  args: string[],
  _options: { profile?: string },
): Promise<void> {
  const manager = new AutoMemoryManager({ cwd: process.cwd() });
  const act = action || 'list';

  switch (act) {
    case 'list': {
      const memories = await manager.listMemories();
      if (memories.length === 0) {
        console.log('No memories found for this project.');
        console.log('Memories are auto-extracted as you chat with XibeCode.');
        break;
      }
      console.log(`Found ${memories.length} memory/memories:\n`);
      for (const mem of memories) {
        const age = formatAge(mem.mtime);
        const tags = mem.frontmatter.tags?.length
          ? ` [${mem.frontmatter.tags.join(', ')}]`
          : '';
        console.log(`  ${mem.frontmatter.type}${tags} (${age})`);
        console.log(`    ${mem.content.trim().slice(0, 100)}${mem.content.length > 100 ? '...' : ''}`);
        console.log(`    File: ${mem.filename}`);
        console.log();
      }
      break;
    }

    case 'search': {
      const query = args.join(' ');
      if (!query) {
        console.error('Usage: xc memory search <query>');
        process.exit(1);
      }
      const context = await manager.getContextMemories(query);
      if (!context) {
        console.log('No relevant memories found.');
        break;
      }
      console.log('Relevant memories:\n');
      console.log(context);
      break;
    }

    case 'dream': {
      console.log('Running dream consolidation...');
      const result = await manager.dream();
      console.log(`Dream complete: created=${result.created}, merged=${result.merged}, pruned=${result.pruned}`);
      if (result.errors.length > 0) {
        console.log('Errors:');
        for (const err of result.errors) {
          console.log(`  - ${err}`);
        }
      }
      break;
    }

    case 'path': {
      console.log(`Memory directory: ${manager.getMemoryDir()}`);
      console.log(`Memory entrypoint: ${manager.getMemoryEntrypoint()}`);
      break;
    }

    default:
      console.error(`Unknown action: ${act}`);
      console.error('Available actions: list, search, dream, path');
      process.exit(1);
  }
}

function formatAge(date: Date): string {
  const ms = Date.now() - date.getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return date.toISOString().split('T')[0];
}
