/**
 * Lightweight session search across past XibeCode sessions .
 * Scans ~/.xibecode/sessions and ~/.xibecode/projects JSONL/JSON without SQLite.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SessionHit {
  sessionId: string;
  path: string;
  title?: string;
  snippet: string;
  score: number;
  updated?: string;
}

function scoreText(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const k of keywords) {
    if (!k) continue;
    if (lower.includes(k)) score += 2;
    // word boundary-ish
    const re = new RegExp(`\\b${escapeRe(k)}\\b`, 'i');
    if (re.test(text)) score += 1;
  }
  return score;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function walkFiles(dir: string, out: string[], depth = 0): Promise<void> {
  if (depth > 4) return;
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = await fs.stat(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      await walkFiles(full, out, depth + 1);
    } else if (name.endsWith('.jsonl') || name.endsWith('.json')) {
      out.push(full);
    }
  }
}

function extractTextFromJsonl(raw: string, maxChars = 8000): string {
  const lines = raw.split('\n').filter(Boolean);
  const parts: string[] = [];
  let used = 0;
  // Prefer tail (recent)
  for (let i = lines.length - 1; i >= 0 && used < maxChars; i--) {
    try {
      const obj = JSON.parse(lines[i]!);
      const type = obj.type || obj.role;
      let text = '';
      if (typeof obj.message?.content === 'string') text = obj.message.content;
      else if (typeof obj.content === 'string') text = obj.content;
      else if (Array.isArray(obj.message?.content)) {
        text = obj.message.content
          .filter((b: any) => b?.type === 'text')
          .map((b: any) => b.text)
          .join(' ');
      } else if (typeof obj.text === 'string') text = obj.text;
      else if (typeof obj.prompt === 'string') text = obj.prompt;
      if (text) {
        parts.push(`[${type || '?'}] ${text.slice(0, 500)}`);
        used += text.length;
      }
    } catch {
      /* skip bad line */
    }
  }
  return parts.reverse().join('\n');
}

function extractTextFromJson(raw: string): string {
  try {
    const obj = JSON.parse(raw);
    const msgs = obj.messages || obj.conversation || [];
    if (!Array.isArray(msgs)) return raw.slice(0, 4000);
    return msgs
      .map((m: any) => {
        const role = m.role || '?';
        let c = m.content;
        if (Array.isArray(c)) {
          c = c.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join(' ');
        }
        return `[${role}] ${String(c || '').slice(0, 400)}`;
      })
      .join('\n')
      .slice(0, 8000);
  } catch {
    return raw.slice(0, 4000);
  }
}

/**
 * Search past sessions for keywords.
 * Prefers FTS index (JS inverted + optional node:sqlite FTS5), falls back to scan.
 */
export async function searchSessions(
  query: string,
  options?: { limit?: number; roots?: string[]; rebuildIndex?: boolean },
): Promise<SessionHit[]> {
  const limit = options?.limit ?? 8;

  // FTS index first
  try {
    const { ftsSearch } = await import('./session-fts.js');
    const ftsHits = await ftsSearch(query, limit);
    if (ftsHits.length > 0 && !options?.rebuildIndex) {
      return ftsHits;
    }
  } catch {
    /* fall through */
  }

  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  if (!keywords.length) return [];

  const home = os.homedir();
  const roots =
    options?.roots ||
    [
      path.join(home, '.xibecode', 'sessions'),
      path.join(home, '.xibecode', 'projects'),
      path.join(home, '.xibecode', 'gateway', 'sessions'),
    ];

  const files: string[] = [];
  for (const r of roots) {
    await walkFiles(r, files);
  }

  const hits: SessionHit[] = [];
  const { indexSessionFile } = await import('./session-fts.js').catch(() => ({
    indexSessionFile: null as any,
  }));

  for (const file of files) {
    let raw: string;
    try {
      const buf = await fs.readFile(file);
      raw = buf.subarray(0, 256_000).toString('utf-8');
    } catch {
      continue;
    }

    const text = file.endsWith('.jsonl')
      ? extractTextFromJsonl(raw)
      : extractTextFromJson(raw);

    // Opportunistically index for next FTS query
    if (indexSessionFile) {
      void indexSessionFile(file, text, path.basename(file));
    }

    const score = scoreText(text, keywords);
    if (score <= 0) continue;

    let snippet = '';
    for (const line of text.split('\n')) {
      if (keywords.some((k) => line.toLowerCase().includes(k))) {
        snippet = line.slice(0, 240);
        break;
      }
    }
    if (!snippet) snippet = text.slice(0, 200);

    let updated: string | undefined;
    try {
      const st = await fs.stat(file);
      updated = st.mtime.toISOString();
    } catch {
      /* ignore */
    }

    hits.push({
      sessionId: path.basename(file).replace(/\.(jsonl|json)$/, ''),
      path: file,
      snippet,
      score,
      updated,
    });
  }

  hits.sort((a, b) => b.score - a.score || (b.updated || '').localeCompare(a.updated || ''));
  return hits.slice(0, limit);
}
