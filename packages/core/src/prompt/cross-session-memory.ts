/**
 * Grok-style cross-session memory.
 *
 * Layout (outside the repo, like ~/.grok/memory):
 *   ~/.xibecode/memory/MEMORY.md
 *   ~/.xibecode/memory/<slug>-<hash8>/MEMORY.md
 *   ~/.xibecode/memory/<slug>-<hash8>/sessions/YYYY-MM-DD-<slug>-<sid8>.md
 *
 * First-turn injection searches those files plus the session FTS index.
 * Session-end writes a metadata log (no extra LLM). Compaction flushes a
 * richer log first so the compact step cannot drop active work.
 */

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extractUserQuery, messagePlainText } from './user-context.js';
import { searchSessions, type SessionHit } from '../learning-loop/session-search.js';

const execFileAsync = promisify(execFile);

export const MIN_SESSION_PROMPTS = 3;
export const MIN_SESSION_USER_BYTES = 50;
export const MAX_INJECTION_HITS = 6;
export const FIRST_TURN_MIN_SCORE = 4;

export interface MemoryPaths {
  root: string;
  globalMemory: string;
  workspaceDir: string;
  workspaceMemory: string;
  sessionsDir: string;
  identity: string;
}

export interface SessionEndInput {
  sessionId: string;
  cwd: string;
  messages: Array<{ role?: string; content?: unknown }>;
  now?: Date;
  baseDir?: string;
}

export interface MemoryHit {
  source: 'workspace' | 'global' | 'session' | 'index';
  title: string;
  snippet: string;
  score: number;
  updated?: string;
  stale?: boolean;
}

function memoryRoot(baseDir?: string): string {
  return baseDir || process.env.XIBECODE_MEMORY_DIR?.trim() || path.join(homedir(), '.xibecode', 'memory');
}

function memoryDisabled(): boolean {
  return /^(0|false|off|no)$/i.test((process.env.XIBECODE_MEMORY || '').trim());
}

function sanitizeSlug(raw: string): string {
  const slug = raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return slug || 'workspace';
}

export async function workspaceIdentity(cwd: string): Promise<string> {
  const resolved = path.resolve(cwd);
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      cwd: resolved,
      timeout: 3000,
      maxBuffer: 8 * 1024,
    });
    const url = stdout.trim();
    const m = url.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    if (m?.[1]) {
      const slug = sanitizeSlug(m[1].replace(/\//g, '-'));
      const hash = createHash('sha256').update(m[1]).digest('hex').slice(0, 8);
      return `${slug}-${hash}`;
    }
  } catch {
    /* path fallback */
  }
  const slug = sanitizeSlug(path.basename(resolved));
  const hash = createHash('sha256').update(resolved).digest('hex').slice(0, 8);
  return `${slug}-${hash}`;
}

export async function resolveMemoryPaths(cwd: string, baseDir?: string): Promise<MemoryPaths> {
  const root = memoryRoot(baseDir);
  const identity = await workspaceIdentity(cwd);
  const workspaceDir = path.join(root, identity);
  return {
    root,
    globalMemory: path.join(root, 'MEMORY.md'),
    workspaceDir,
    workspaceMemory: path.join(workspaceDir, 'MEMORY.md'),
    sessionsDir: path.join(workspaceDir, 'sessions'),
    identity,
  };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\-./]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 80);
}

function scoreText(text: string, keywords: string[]): number {
  if (!text || keywords.length === 0) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const k of keywords) {
    if (lower.includes(k)) score += 2;
    const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(text)) score += 1;
  }
  return score;
}

function daysAgo(iso?: string, now = Date.now()): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (now - t) / 86_400_000);
}

function applyTemporalDecay(score: number, days: number): number {
  if (days <= 0) return score;
  const halfLife = 30;
  return score * Math.pow(0.5, days / halfLife);
}

export function extractUserTopics(
  messages: Array<{ role?: string; content?: unknown }>,
  max = 5,
): string[] {
  const topics: string[] = [];
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const text = messagePlainText(m);
    if (!text.trim()) continue;
    if (text.includes('[Context compaction handoff]') || text.includes('<user_info>')) {
      const q = extractUserQuery(text);
      if (!q) continue;
      const line = q.replace(/\s+/g, ' ').trim().slice(0, 160);
      if (line.length >= 8) topics.push(line);
    } else if (!text.includes('<system-reminder>')) {
      const q = extractUserQuery(text) || text;
      const line = q.replace(/\s+/g, ' ').trim().slice(0, 160);
      if (line.length >= 8) topics.push(line);
    }
    if (topics.length >= max) break;
  }
  return topics;
}

export function shouldSaveSessionLog(topics: string[], userBytes: number): boolean {
  return topics.length >= MIN_SESSION_PROMPTS || userBytes >= MIN_SESSION_USER_BYTES;
}

function countRoles(messages: Array<{ role?: string; content?: unknown }>): {
  user: number;
  assistant: number;
  tool: number;
  userBytes: number;
} {
  let user = 0;
  let assistant = 0;
  let tool = 0;
  let userBytes = 0;
  for (const m of messages) {
    const text = messagePlainText(m);
    if (m.role === 'user') {
      if (Array.isArray(m.content) && (m.content as any[]).some((b) => b?.type === 'tool_result')) {
        tool += 1;
        continue;
      }
      user += 1;
      userBytes += text.length;
    } else if (m.role === 'assistant') {
      assistant += 1;
    }
  }
  return { user, assistant, tool, userBytes };
}

export function formatSessionLog(opts: {
  sessionId: string;
  cwd: string;
  identity: string;
  topics: string[];
  counts: { user: number; assistant: number; tool: number };
  now: Date;
  extra?: string;
}): string {
  const day = opts.now.toISOString().slice(0, 10);
  const time = opts.now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const lines = [
    `# Session ${day} ${opts.sessionId.slice(0, 8)}`,
    '',
    `- Date: ${time}`,
    `- Workspace: ${opts.cwd}`,
    `- Identity: ${opts.identity}`,
    `- User messages: ${opts.counts.user}`,
    `- Assistant messages: ${opts.counts.assistant}`,
    `- Tool results: ${opts.counts.tool}`,
    '',
    '## Topics',
    ...(opts.topics.length ? opts.topics.map((t, i) => `${i + 1}. ${t}`) : ['- (none)']),
  ];
  if (opts.extra?.trim()) {
    lines.push('', '## Notes', opts.extra.trim());
  }
  lines.push('');
  return lines.join('\n');
}

export async function writeSessionLog(
  input: SessionEndInput & { extra?: string; kind?: 'end' | 'flush' },
): Promise<string | null> {
  if (memoryDisabled()) return null;
  const topics = extractUserTopics(input.messages);
  const counts = countRoles(input.messages);
  if (input.kind !== 'flush' && !shouldSaveSessionLog(topics, counts.userBytes)) return null;

  const paths = await resolveMemoryPaths(input.cwd, input.baseDir);
  await mkdir(paths.sessionsDir, { recursive: true });
  const now = input.now || new Date();
  const day = now.toISOString().slice(0, 10);
  const slug = sanitizeSlug(path.basename(path.resolve(input.cwd)));
  const sid = input.sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'session';
  const file = path.join(
    paths.sessionsDir,
    `${day}-${slug}-${sid}${input.kind === 'flush' ? '-flush' : ''}.md`,
  );
  const body = formatSessionLog({
    sessionId: input.sessionId,
    cwd: input.cwd,
    identity: paths.identity,
    topics,
    counts,
    now,
    extra: input.extra,
  });
  await writeFile(file, body, 'utf8');
  return file;
}

async function readIfExists(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}

async function scoreMarkdownFile(
  file: string,
  keywords: string[],
  source: MemoryHit['source'],
  title: string,
  now: number,
): Promise<MemoryHit | null> {
  const text = await readIfExists(file);
  if (!text?.trim()) return null;
  const score = scoreText(text, keywords);
  if (score <= 0) return null;
  const mtime = file.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  const days = daysAgo(mtime, now);
  return {
    source,
    title,
    snippet: text.replace(/\s+/g, ' ').trim().slice(0, 280),
    score: applyTemporalDecay(score, source === 'session' ? days : 0),
    updated: mtime,
    stale: source === 'session' && days >= 14,
  };
}

export async function searchCrossSessionMemory(opts: {
  cwd: string;
  query: string;
  limit?: number;
  minScore?: number;
  baseDir?: string;
  includeSessionIndex?: boolean;
}): Promise<MemoryHit[]> {
  if (memoryDisabled()) return [];
  const keywords = tokenize(opts.query);
  if (keywords.length === 0) return [];
  const now = Date.now();
  const paths = await resolveMemoryPaths(opts.cwd, opts.baseDir);
  const hits: MemoryHit[] = [];

  const curatedRoot = path.join(homedir(), '.xibecode', 'memories');
  for (const [file, source, title] of [
    [paths.workspaceMemory, 'workspace', 'Workspace MEMORY.md'],
    [paths.globalMemory, 'global', 'Global MEMORY.md'],
    [path.join(curatedRoot, 'MEMORY.md'), 'global', 'Curated MEMORY.md'],
    [path.join(curatedRoot, 'USER.md'), 'global', 'USER.md'],
  ] as const) {
    const hit = await scoreMarkdownFile(file, keywords, source, title, now);
    if (hit) hits.push(hit);
  }

  try {
    const names = await readdir(paths.sessionsDir);
    const recent = names.filter((n) => n.endsWith('.md')).sort().slice(-20);
    for (const name of recent) {
      const hit = await scoreMarkdownFile(
        path.join(paths.sessionsDir, name),
        keywords,
        'session',
        name,
        now,
      );
      if (hit) hits.push(hit);
    }
  } catch {
    /* no session logs yet */
  }

  if (opts.includeSessionIndex !== false) {
  try {
    const indexHits: SessionHit[] = await searchSessions(opts.query, { limit: 6 });
    for (const h of indexHits) {
      const days = daysAgo(h.updated, now);
      hits.push({
        source: 'index',
        title: h.title || h.sessionId,
        snippet: (h.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 280),
        score: applyTemporalDecay(Math.max(h.score, 1), days),
        updated: h.updated,
        stale: days >= 14,
      });
    }
  } catch {
    /* index optional */
  }
  }

  const min = opts.minScore ?? FIRST_TURN_MIN_SCORE;
  const dedup = new Map<string, MemoryHit>();
  for (const hit of hits) {
    if (hit.score < min) continue;
    const key = `${hit.source}:${hit.title}:${hit.snippet.slice(0, 80)}`;
    const prev = dedup.get(key);
    if (!prev || hit.score > prev.score) dedup.set(key, hit);
  }
  return [...dedup.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? MAX_INJECTION_HITS);
}

export function formatMemoryInjection(hits: MemoryHit[]): string | null {
  if (hits.length === 0) return null;
  const groups: Record<string, MemoryHit[]> = {};
  for (const hit of hits) {
    (groups[hit.source] ||= []).push(hit);
  }
  const lines = [
    'Memory from earlier sessions. These notes may be stale — verify against the current workspace before relying on them.',
  ];
  const labels: Record<string, string> = {
    workspace: 'Workspace',
    global: 'Global / user',
    session: 'Recent sessions',
    index: 'Past conversations',
  };
  for (const key of ['workspace', 'global', 'session', 'index'] as const) {
    const list = groups[key];
    if (!list?.length) continue;
    lines.push('', `## ${labels[key]}`);
    for (const hit of list) {
      const stale = hit.stale ? ' (verify — older than 14 days)' : '';
      lines.push(`- ${hit.title}${stale}: ${hit.snippet}`);
    }
  }
  return lines.join('\n');
}

export async function firstTurnMemoryReminder(opts: {
  cwd: string;
  query: string;
  baseDir?: string;
  includeSessionIndex?: boolean;
}): Promise<string | null> {
  const hits = await searchCrossSessionMemory({
    cwd: opts.cwd,
    query: opts.query,
    minScore: FIRST_TURN_MIN_SCORE,
    baseDir: opts.baseDir,
    includeSessionIndex: opts.includeSessionIndex,
  });
  return formatMemoryInjection(hits);
}
