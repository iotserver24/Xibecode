/**
 * Memory + learning-loop command.
 *
 *   list | search | dream | path | curated | sessions | skills
 *   pending | approve | reject | approval on|off
 */

import {
  AutoMemoryManager,
  CuratedMemoryStore,
  searchSessions,
  learnedSkillsDir,
  listPending,
  approvePending,
  approveAll,
  rejectPending,
  rejectAll,
  setWriteApproval,
  isWriteApprovalEnabledAsync,
} from 'xibecode-core';
import { promises as fs } from 'fs';
import * as path from 'path';

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
        console.log('No project auto-memories. Try: curated | sessions | skills | pending');
        break;
      }
      console.log(`Found ${memories.length} memory/memories:\n`);
      for (const mem of memories) {
        const age = formatAge(mem.mtime);
        const tags = mem.frontmatter.tags?.length
          ? ` [${mem.frontmatter.tags.join(', ')}]`
          : '';
        console.log(`  ${mem.frontmatter.type}${tags} (${age})`);
        console.log(
          `    ${mem.content.trim().slice(0, 100)}${mem.content.length > 100 ? '...' : ''}`,
        );
        console.log();
      }
      break;
    }

    case 'search': {
      const query = args.join(' ');
      if (!query) {
        console.error('Usage: xibecode memory search <query>');
        process.exit(1);
      }
      const context = await manager.getContextMemories(query);
      console.log(context || 'No relevant project memories found.');
      break;
    }

    case 'dream': {
      console.log('Running dream consolidation...');
      const result = await manager.dream();
      console.log(
        `Dream complete: created=${result.created}, merged=${result.merged}, pruned=${result.pruned}`,
      );
      break;
    }

    case 'path': {
      console.log(`Project memory dir: ${manager.getMemoryDir()}`);
      console.log(`Curated (global):   ~/.xibecode/memories/{MEMORY,USER}.md`);
      console.log(`Learned skills:     ${learnedSkillsDir()}`);
      console.log(`Pending writes:     ~/.xibecode/pending/`);
      console.log(`Session FTS index:  ~/.xibecode/session-index/`);
      break;
    }

    case 'curated':
    case 'profile': {
      const store = new CuratedMemoryStore();
      const mem = await store.loadEntries('memory');
      const user = await store.loadEntries('user');
      console.log('=== MEMORY.md ===');
      if (!mem.length) console.log('(empty)');
      else mem.forEach((e, i) => console.log(`${i + 1}. ${e}`));
      console.log('\n=== USER.md ===');
      if (!user.length) console.log('(empty)');
      else user.forEach((e, i) => console.log(`${i + 1}. ${e}`));
      break;
    }

    case 'sessions': {
      const query = args.join(' ');
      if (!query) {
        console.error('Usage: xibecode memory sessions <query>');
        process.exit(1);
      }
      const hits = await searchSessions(query, { limit: 10 });
      if (!hits.length) {
        console.log('No matching sessions (index builds as you chat).');
        break;
      }
      console.log(`${hits.length} hit(s):\n`);
      for (const h of hits) {
        console.log(`  [${h.score}] ${h.sessionId}  ${h.updated || ''}`);
        console.log(`    ${h.snippet}\n`);
      }
      break;
    }

    case 'skills': {
      const dir = learnedSkillsDir();
      let files: string[] = [];
      try {
        files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md'));
      } catch {
        console.log(`No learned skills yet (${dir})`);
        break;
      }
      if (!files.length) {
        console.log('No learned skills yet.');
        break;
      }
      console.log(`Learned skills (${files.length}):\n`);
      for (const f of files) {
        const raw = await fs.readFile(path.join(dir, f), 'utf-8').catch(() => '');
        const desc = raw.match(/description:\s*["']?([^"'\n]+)/)?.[1] || '';
        console.log(`  ${f.replace(/\.md$/, '')}`);
        if (desc) console.log(`    ${desc}`);
      }
      break;
    }

    case 'pending': {
      const kind = args[0] === 'skill' || args[0] === 'memory' ? args[0] : undefined;
      const list = await listPending(kind as any);
      if (!list.length) {
        console.log('No pending writes.');
        break;
      }
      console.log(`${list.length} pending:\n`);
      for (const p of list) {
        console.log(`  ${p.id}  [${p.kind}/${p.source || '?'}]  ${p.gist}`);
      }
      console.log('\nApprove: xibecode memory approve <id|all>');
      console.log('Reject:  xibecode memory reject <id|all>');
      break;
    }

    case 'approve': {
      const id = args[0];
      if (!id) {
        console.error('Usage: xibecode memory approve <id|all> [memory|skill]');
        process.exit(1);
      }
      if (id === 'all') {
        const kind = args[1] === 'skill' || args[1] === 'memory' ? args[1] : undefined;
        const r = await approveAll(kind as any);
        console.log(`Approved ${r.approved}, failed ${r.failed}`);
        break;
      }
      const r = await approvePending(id);
      console.log(r.success ? `OK: ${r.message}` : `FAIL: ${r.message}`);
      if (!r.success) process.exitCode = 1;
      break;
    }

    case 'reject': {
      const id = args[0];
      if (!id) {
        console.error('Usage: xibecode memory reject <id|all> [memory|skill]');
        process.exit(1);
      }
      if (id === 'all') {
        const kind = args[1] === 'skill' || args[1] === 'memory' ? args[1] : undefined;
        const n = await rejectAll(kind as any);
        console.log(`Rejected ${n}`);
        break;
      }
      const ok = await rejectPending(id);
      console.log(ok ? `Rejected ${id}` : `Not found: ${id}`);
      if (!ok) process.exitCode = 1;
      break;
    }

    case 'approval': {
      const onOff = (args[0] || '').toLowerCase();
      const kind = (args[1] === 'skill' ? 'skill' : 'memory') as 'memory' | 'skill';
      if (onOff !== 'on' && onOff !== 'off') {
        const mem = await isWriteApprovalEnabledAsync('memory');
        const sk = await isWriteApprovalEnabledAsync('skill');
        console.log(`memory write_approval: ${mem ? 'on' : 'off'}`);
        console.log(`skills write_approval: ${sk ? 'on' : 'off'}`);
        console.log('Usage: xibecode memory approval on|off [memory|skill]');
        break;
      }
      await setWriteApproval(kind, onOff === 'on');
      // also set env-style file for both if second arg omitted and first is on/off alone
      if (!args[1]) {
        await setWriteApproval('memory', onOff === 'on');
        await setWriteApproval('skill', onOff === 'on');
        console.log(`memory+skills write_approval: ${onOff}`);
      } else {
        console.log(`${kind} write_approval: ${onOff}`);
      }
      break;
    }

    default:
      console.error(`Unknown action: ${act}`);
      console.error(
        'list | search | dream | path | curated | sessions | skills | pending | approve | reject | approval',
      );
      process.exit(1);
  }
}

function formatAge(date: Date): string {
  const ms = Date.now() - date.getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
