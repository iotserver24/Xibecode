/**
 * Grok Build-style context envelope sent with each model turn.
 *
 * First turn:
 *   <user_info> + optional <git_status> + optional <rules> + <user_query>
 *
 * Later turns:
 *   <user_query> only
 *
 * After compaction, the prefix and last query are re-injected so the model
 * does not lose workspace, date, git snapshot, or project rules.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir, release, type as osType } from 'node:os';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export const GIT_STATUS_CHARACTER_LIMIT = 10_000;
export const RULE_FILE_CHARACTER_LIMIT = 80_000;
export const USER_INFO_DATE_MARKER = "Today's date:";

const AGENT_FILENAMES = [
  'Agents.md',
  'Claude.md',
  'CLAUDE.md',
  'CLAUDE.local.md',
  'AGENT.md',
  'AGENTS.md',
];

const RULES_SUBDIRS = ['.xibecode/rules', '.grok/rules', '.claude/rules'];

const RULES_SECTION_INTRO =
  'The rules section has a number of possible rules/memories/context that you should consider. In each subsection, we provide instructions about what information the subsection contains and how you should consider/follow the contents of the subsection.';

export interface RuleEntry {
  path: string;
  content: string;
}

export interface UserInfoParts {
  os?: string;
  shell?: string;
  cwd: string;
  date?: string;
}

export function wrapUserQuery(text: string): string {
  const trimmed = text.trim();
  if (/^<user_query\b[\s\S]*<\/user_query>\s*$/i.test(trimmed)) return trimmed;
  return `<user_query>\n${text}\n</user_query>`;
}

export function extractUserQuery(text: string): string | null {
  const matches = [...text.matchAll(/<user_query\b[^>]*>\s*([\s\S]*?)\s*<\/user_query>/gi)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]![1]!.trim();
  return last || null;
}

export function extractContextPrefix(text: string): string | null {
  if (!text.includes('<user_info>')) return null;
  const idx = text.search(/<user_query\b/i);
  const prefix = (idx >= 0 ? text.slice(0, idx) : text).trim();
  return prefix.includes('<user_info>') ? prefix : null;
}

export function messagePlainText(message: { content?: unknown }): string {
  const content = message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block: any) => {
      if (typeof block === 'string') return block;
      if (block?.type === 'text') return String(block.text || '');
      return '';
    })
    .join('\n');
}

function hasToolResult(message: { content?: unknown }): boolean {
  if (!Array.isArray(message.content)) return false;
  return (message.content as any[]).some((b) => b?.type === 'tool_result');
}

export function messagesHaveUserInfo(messages: Array<{ content?: unknown }>): boolean {
  return messages.some((m) => messagePlainText(m).includes('<user_info>'));
}

export function extractLastUserQuery(
  messages: Array<{ role?: string; content?: unknown }>,
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== 'user') continue;
    if (hasToolResult(m)) continue;
    const text = messagePlainText(m);
    if (!text.trim()) continue;
    if (
      text.includes('[Context compaction handoff]') ||
      text.includes('This session is being continued from a previous conversation')
    ) {
      continue;
    }
    const wrapped = extractUserQuery(text);
    if (wrapped) return wrapped;
    if (text.includes('<user_info>') && !text.includes('<user_query>')) continue;
    return text.trim();
  }
  return null;
}

export function osDisplayName(): string {
  const family =
    process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
  const rel = release();
  const kernel = osType() || family;
  return rel ? `${kernel} ${rel}`.trim() : family;
}

export function shellDisplayName(): string {
  if (process.platform === 'win32') {
    return process.env.ComSpec || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/sh';
}

export function localDateStamp(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function buildUserInfoBlock(parts: UserInfoParts): string {
  const os = parts.os || osDisplayName();
  const shell = parts.shell || shellDisplayName();
  const date = parts.date || localDateStamp();
  return [
    '<user_info>',
    `OS Version: ${os}`,
    `Shell: ${shell}`,
    `Workspace Path: ${parts.cwd}`,
    `${USER_INFO_DATE_MARKER} ${date}`,
    'Note: Prefer using relative paths over absolute paths as tool call args when possible.',
    '</user_info>',
  ].join('\n');
}

export function normalizeGitStatus(status: string): string | null {
  const trimmed = status.trim();
  if (!trimmed) return null;
  if (trimmed.length <= GIT_STATUS_CHARACTER_LIMIT) return trimmed;
  let end = GIT_STATUS_CHARACTER_LIMIT;
  while (end > 0 && trimmed.charCodeAt(end) >= 0xdc00 && trimmed.charCodeAt(end) <= 0xdfff) {
    end -= 1;
  }
  let body = trimmed.slice(0, end);
  const nl = body.lastIndexOf('\n');
  if (nl > 0) body = body.slice(0, nl);
  return `${body}\n\n... (git status truncated)`;
}

export function formatGitStatusBlock(status: string): string {
  return (
    `\n\n<git_status>\n` +
    `This is the git status at the start of the conversation. Note that this status ` +
    `is a snapshot in time, and will not update during the conversation.\n` +
    `${status}\n` +
    `</git_status>\n`
  );
}

function neutralizeFileRuleContent(content: string): string {
  return content
    .replace(/<\/rules>/gi, '&lt;/rules>')
    .replace(/<rules>/gi, '&lt;rules>')
    .replace(/<\/system-reminder>/gi, '&lt;/system-reminder>')
    .replace(/<system-reminder>/gi, '&lt;system-reminder>')
    .replace(/<\/system_reminder>/gi, '&lt;/system_reminder>')
    .replace(/<system_reminder>/gi, '&lt;system_reminder>');
}

function capRuleContent(content: string): string {
  if (content.length <= RULE_FILE_CHARACTER_LIMIT) return content;
  return `${content.slice(0, RULE_FILE_CHARACTER_LIMIT)}\n\n... (rule file truncated)`;
}

export function formatRulesSection(
  workspaceRules: RuleEntry[],
  userRules: RuleEntry[],
): string | null {
  if (workspaceRules.length === 0 && userRules.length === 0) return null;
  let out = `<rules>\n${RULES_SECTION_INTRO}\n\n\n`;
  if (workspaceRules.length > 0) {
    out +=
      '<always_applied_workspace_rules description="These are workspace-level rules that the agent must always follow.">\n';
    for (const [i, rule] of workspaceRules.entries()) {
      if (i > 0) out += '\n';
      out += `<always_applied_workspace_rule name="${rule.path}">`;
      out += neutralizeFileRuleContent(capRuleContent(rule.content).trim());
      out += '</always_applied_workspace_rule>\n';
    }
    out += '</always_applied_workspace_rules>';
    out += userRules.length === 0 ? '\n' : '\n\n';
  }
  if (userRules.length > 0) {
    out +=
      '<user_rules description="These are rules set by the user that you should follow if appropriate.">\n';
    for (const [i, rule] of userRules.entries()) {
      if (i > 0) out += '\n';
      out += '<user_rule>';
      out += rule.path
        ? neutralizeFileRuleContent(capRuleContent(rule.content))
        : capRuleContent(rule.content);
      out += '</user_rule>\n';
    }
    out += '</user_rules>\n';
  }
  out += '</rules>';
  return out;
}

export function formatMemoryReminder(lines: string[]): string | null {
  if (lines.length === 0) return null;
  return (
    'Neural Memory Recall — UNVERIFIED HINTS\n' +
    'These are recall hints, not guaranteed facts. Verify with read_file / grep_code / tests before relying on them.\n' +
    lines.join('\n')
  );
}

export function assembleUserTurnContent(opts: {
  prompt: string;
  prefix?: string | null;
  memoryReminder?: string | null;
}): string {
  const parts: string[] = [];
  if (opts.prefix?.trim()) parts.push(opts.prefix.trim());
  parts.push(wrapUserQuery(opts.prompt));
  if (opts.memoryReminder?.trim()) {
    parts.push(`<system-reminder>\n${opts.memoryReminder.trim()}\n</system-reminder>`);
  }
  return parts.join('\n\n');
}

function xibecodeHome(): string {
  return process.env.XIBECODE_HOME?.trim() || path.join(homedir(), '.xibecode');
}

async function gitRoot(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      timeout: 5000,
      maxBuffer: 64 * 1024,
    });
    const root = stdout.trim();
    return root || null;
  } catch {
    return null;
  }
}

async function gitStatusShort(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--short', '--branch'], {
      cwd,
      timeout: 5000,
      maxBuffer: 256 * 1024,
    });
    return normalizeGitStatus(stdout);
  } catch {
    return null;
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readRuleFile(filePath: string): Promise<RuleEntry | null> {
  try {
    const content = await readFile(filePath, 'utf8');
    if (!content.trim()) return null;
    return { path: filePath, content };
  } catch {
    return null;
  }
}

async function readNamedAgentFiles(dir: string, seen: Set<string>): Promise<RuleEntry[]> {
  const out: RuleEntry[] = [];
  for (const name of AGENT_FILENAMES) {
    const filePath = path.join(dir, name);
    const real = path.resolve(filePath);
    if (seen.has(real)) continue;
    if (!(await pathExists(filePath))) continue;
    const entry = await readRuleFile(filePath);
    if (!entry) continue;
    seen.add(real);
    out.push(entry);
  }
  const claude = path.join(dir, '.claude', 'CLAUDE.md');
  const claudeLocal = path.join(dir, '.claude', 'CLAUDE.local.md');
  for (const filePath of [claude, claudeLocal]) {
    const real = path.resolve(filePath);
    if (seen.has(real)) continue;
    if (!(await pathExists(filePath))) continue;
    const entry = await readRuleFile(filePath);
    if (!entry) continue;
    seen.add(real);
    out.push(entry);
  }
  return out;
}

async function readRulesDir(dir: string, seen: Set<string>): Promise<RuleEntry[]> {
  const out: RuleEntry[] = [];
  for (const sub of RULES_SUBDIRS) {
    const rulesDir = path.join(dir, sub);
    let names: string[] = [];
    try {
      names = await readdir(rulesDir);
    } catch {
      continue;
    }
    names.sort((a, b) => a.localeCompare(b));
    for (const name of names) {
      if (!name.toLowerCase().endsWith('.md')) continue;
      const filePath = path.join(rulesDir, name);
      const real = path.resolve(filePath);
      if (seen.has(real)) continue;
      const entry = await readRuleFile(filePath);
      if (!entry) continue;
      seen.add(real);
      out.push(entry);
    }
  }
  return out;
}

async function dirsCwdToRoot(cwd: string): Promise<string[]> {
  const start = path.resolve(cwd);
  const root = (await gitRoot(start)) || start;
  const dirs: string[] = [];
  let cur = start;
  const stop = path.resolve(root);
  for (;;) {
    dirs.push(cur);
    if (cur === stop) break;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return dirs.reverse();
}

export async function discoverRuleFiles(
  cwd: string,
): Promise<{ workspace: RuleEntry[]; user: RuleEntry[] }> {
  const seen = new Set<string>();
  const workspace: RuleEntry[] = [];
  const user: RuleEntry[] = [];

  const home = xibecodeHome();
  user.push(...(await readNamedAgentFiles(home, seen)));
  user.push(...(await readRulesDir(home, seen)));

  for (const dir of await dirsCwdToRoot(cwd)) {
    workspace.push(...(await readNamedAgentFiles(dir, seen)));
    workspace.push(...(await readRulesDir(dir, seen)));
  }

  return { workspace, user };
}

export async function buildUserContextPrefix(opts: {
  cwd: string;
  includeGit?: boolean;
  includeRules?: boolean;
  os?: string;
  shell?: string;
  date?: string;
}): Promise<string> {
  let prefix = buildUserInfoBlock({
    cwd: opts.cwd,
    os: opts.os,
    shell: opts.shell,
    date: opts.date,
  });

  if (opts.includeGit !== false) {
    const status = await gitStatusShort(opts.cwd);
    if (status) prefix += formatGitStatusBlock(status);
  }

  if (opts.includeRules !== false) {
    const { workspace, user } = await discoverRuleFiles(opts.cwd);
    const rules = formatRulesSection(workspace, user);
    if (rules) prefix += `\n\n${rules}`;
  }

  return prefix;
}

export function assembleCompactedMessages<T extends { role: string; content: unknown }>(opts: {
  prefix: string | null;
  lastUserQuery: string | null;
  recent: T[];
  summary: T;
  makeUser: (text: string) => T;
}): T[] {
  const out: T[] = [];
  if (opts.prefix?.trim()) {
    out.push(opts.makeUser(opts.prefix.trim()));
  }
  const query = opts.lastUserQuery?.trim();
  if (query) {
    const already = opts.recent.some((m) => {
      if (m.role !== 'user') return false;
      const text = messagePlainText(m);
      const wrapped = extractUserQuery(text);
      return wrapped === query || text.includes(wrapUserQuery(query)) || text.includes(query);
    });
    if (!already) out.push(opts.makeUser(wrapUserQuery(query)));
  }
  out.push(...opts.recent);
  out.push(opts.summary);
  return out;
}
