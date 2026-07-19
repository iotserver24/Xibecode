/**
 * Session FTS index (SQLite FTS5 when node:sqlite available, else pure-JS inverted index).
 * Index path: ~/.xibecode/session-index/
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import type { SessionHit } from './session-search.js';

export interface IndexDoc {
  id: string;
  path: string;
  title: string;
  body: string;
  updated: number;
}

function indexDir(): string {
  return path.join(os.homedir(), '.xibecode', 'session-index');
}

function jsIndexPath(): string {
  return path.join(indexDir(), 'fts-js.json');
}

type JsIndex = {
  version: 1;
  docs: Record<
    string,
    { path: string; title: string; updated: number; terms: string[] }
  >;
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\-./]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 4000);
}

async function loadJsIndex(): Promise<JsIndex> {
  try {
    return JSON.parse(await fs.readFile(jsIndexPath(), 'utf-8')) as JsIndex;
  } catch {
    return { version: 1, docs: {} };
  }
}

async function saveJsIndex(idx: JsIndex): Promise<void> {
  await fs.mkdir(indexDir(), { recursive: true });
  const tmp = `${jsIndexPath()}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(idx), 'utf-8');
  await fs.rename(tmp, jsIndexPath());
}

/** Upsert one document into the FTS index. */
export async function indexSessionDocument(doc: IndexDoc): Promise<void> {
  const idx = await loadJsIndex();
  const terms = [...new Set(tokenize(`${doc.title} ${doc.body}`))];
  idx.docs[doc.id] = {
    path: doc.path,
    title: doc.title,
    updated: doc.updated,
    terms,
  };
  // Cap index size
  const ids = Object.keys(idx.docs);
  if (ids.length > 5000) {
    const sorted = ids
      .map((id) => ({ id, u: idx.docs[id]!.updated }))
      .sort((a, b) => a.u - b.u);
    for (const { id } of sorted.slice(0, ids.length - 5000)) {
      delete idx.docs[id];
    }
  }
  await saveJsIndex(idx);

  // Best-effort native SQLite FTS5
  await trySqliteUpsert(doc).catch(() => {});
}

/** Search the index. */
export async function ftsSearch(
  query: string,
  limit = 8,
): Promise<SessionHit[]> {
  const keywords = tokenize(query);
  if (!keywords.length) return [];

  // Prefer sqlite if available
  const sqliteHits = await trySqliteSearch(keywords, limit).catch(() => null);
  if (sqliteHits && sqliteHits.length) return sqliteHits;

  const idx = await loadJsIndex();
  const hits: SessionHit[] = [];
  for (const [id, doc] of Object.entries(idx.docs)) {
    let score = 0;
    const termSet = new Set(doc.terms);
    for (const k of keywords) {
      if (termSet.has(k)) score += 3;
      else if (doc.terms.some((t) => t.includes(k))) score += 1;
    }
    if (score <= 0) continue;
    const snippetTerms = doc.terms.filter((t) => keywords.some((k) => t.includes(k))).slice(0, 12);
    hits.push({
      sessionId: id,
      path: doc.path,
      title: doc.title,
      snippet: snippetTerms.join(' ') || doc.title,
      score,
      updated: new Date(doc.updated).toISOString(),
    });
  }
  hits.sort((a, b) => b.score - a.score || (b.updated || '').localeCompare(a.updated || ''));
  return hits.slice(0, limit);
}

/** Index a raw session file content. */
export async function indexSessionFile(
  filePath: string,
  body: string,
  title?: string,
): Promise<void> {
  const id = createHash('md5').update(filePath).digest('hex').slice(0, 12);
  let updated = Date.now();
  try {
    const st = await fs.stat(filePath);
    updated = st.mtimeMs;
  } catch {
    /* ignore */
  }
  await indexSessionDocument({
    id,
    path: filePath,
    title: title || path.basename(filePath),
    body: body.slice(0, 100_000),
    updated,
  });
}

// ── Optional node:sqlite FTS5 ────────────────────────────────

async function trySqliteUpsert(doc: IndexDoc): Promise<void> {
  const Database = await loadNodeSqlite();
  if (!Database) return;
  const dbPath = path.join(indexDir(), 'sessions.db');
  await fs.mkdir(indexDir(), { recursive: true });
  const db = new Database(dbPath);
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
        id UNINDEXED, path UNINDEXED, title, body, updated UNINDEXED
      );
    `);
    db.prepare('DELETE FROM sessions_fts WHERE id = ?').run(doc.id);
    db.prepare(
      'INSERT INTO sessions_fts (id, path, title, body, updated) VALUES (?, ?, ?, ?, ?)',
    ).run(doc.id, doc.path, doc.title, doc.body, String(doc.updated));
  } finally {
    db.close?.();
  }
}

async function trySqliteSearch(keywords: string[], limit: number): Promise<SessionHit[] | null> {
  const Database = await loadNodeSqlite();
  if (!Database) return null;
  const dbPath = path.join(indexDir(), 'sessions.db');
  try {
    await fs.access(dbPath);
  } catch {
    return null;
  }
  const db = new Database(dbPath);
  try {
    const q = keywords.map((k) => `"${k.replace(/"/g, '')}"`).join(' OR ');
    const rows = db
      .prepare(
        `SELECT id, path, title, snippet(sessions_fts, 2, '[', ']', '…', 12) AS snip, updated
         FROM sessions_fts WHERE sessions_fts MATCH ? LIMIT ?`,
      )
      .all(q, limit) as Array<{
      id: string;
      path: string;
      title: string;
      snip: string;
      updated: string;
    }>;
    return rows.map((r, i) => ({
      sessionId: r.id,
      path: r.path,
      title: r.title,
      snippet: r.snip || r.title,
      score: 100 - i,
      updated: new Date(Number(r.updated) || Date.now()).toISOString(),
    }));
  } catch {
    return null;
  } finally {
    db.close?.();
  }
}

async function loadNodeSqlite(): Promise<any | null> {
  try {
    // Node 22.5+ 
    const mod = await import('node:sqlite' as any);
    return mod.DatabaseSync || mod.Database || null;
  } catch {
    return null;
  }
}
