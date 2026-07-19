/**
 * Autonomous skill creation after complex successful coding tasks.
 * Writes agent-learned skills under ~/.xibecode/skills/learned/
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';

export interface LearnedSkillDraft {
  name: string;
  description: string;
  content: string; // body markdown without frontmatter
  tags?: string[];
}

export interface SkillLearnResult {
  created: boolean;
  path?: string;
  name?: string;
  reason?: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'learned-skill';
}

export function learnedSkillsDir(): string {
  return path.join(os.homedir(), '.xibecode', 'skills', 'learned');
}

/**
 * Heuristic: should we promote this run to a skill?
 */
export function shouldLearnSkill(stats: {
  toolCalls: number;
  filesChanged: number;
  iterations: number;
  hadErrors?: boolean;
}): boolean {
  // Complex successful work: multiple tools + file changes
  if (stats.toolCalls >= 5 && stats.filesChanged >= 1) return true;
  if (stats.toolCalls >= 8 && stats.iterations >= 4) return true;
  return false;
}

/**
 * Build a skill draft from conversation snippets (no LLM required).
 */
export function draftSkillFromRun(input: {
  prompt: string;
  finalText?: string;
  toolsUsed?: string[];
  filesChanged?: string[];
}): LearnedSkillDraft {
  const prompt = input.prompt.trim().slice(0, 200);
  const hash = createHash('md5').update(prompt + Date.now()).digest('hex').slice(0, 6);
  const name = slugify(
    prompt
      .replace(/^(fix|add|implement|update|create|refactor)\s+/i, '')
      .split(/[.!?\n]/)[0] || 'coding-workflow',
  ).slice(0, 40) || `workflow-${hash}`;

  const tools = (input.toolsUsed || []).slice(0, 12);
  const files = (input.filesChanged || []).slice(0, 15);

  const description = `Learned workflow: ${prompt.slice(0, 80)}`.slice(0, 120);
  const content = [
    `## When to Use`,
    `Similar task: ${prompt}`,
    ``,
    `## Procedure`,
    `1. Confirm project workdir and read relevant files.`,
    `2. Reproduce issue / understand requirements.`,
    tools.length
      ? `3. Preferred tools from this run: ${tools.map((t) => `\`${t}\``).join(', ')}.`
      : `3. Use read/edit/run_command/test tools as needed.`,
    `4. Apply minimal correct changes; run tests if available.`,
    `5. Summarize what changed and how to verify.`,
    ``,
    files.length ? `## Files touched in source run\n${files.map((f) => `- \`${f}\``).join('\n')}\n` : '',
    `## Notes`,
    (input.finalText || '').slice(0, 600) || '_No final summary captured._',
    ``,
    `## Pitfalls`,
    `- Do not re-apply the same edits blindly; re-read files first.`,
    `- Prefer verified_edit / exact search-replace after reading.`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    name: `learned-${name}-${hash}`,
    description,
    content,
    tags: ['learned', 'coding', ...(tools.slice(0, 3))],
  };
}

export async function saveLearnedSkill(draft: LearnedSkillDraft): Promise<SkillLearnResult> {
  // Flat .md so SkillManager.loadSkillsFromDirectory picks them up
  const dir = learnedSkillsDir();
  try {
    await fs.mkdir(dir, { recursive: true });
    const skillMd =
      `---\n` +
      `name: ${draft.name}\n` +
      `description: ${JSON.stringify(draft.description)}\n` +
      `version: 0.1.0\n` +
      `tags: [${(draft.tags || []).map((t) => JSON.stringify(t)).join(', ')}]\n` +
      `---\n\n` +
      `# ${draft.name}\n\n` +
      draft.content +
      `\n`;
    const filePath = path.join(dir, `${draft.name}.md`);
    await fs.writeFile(filePath, skillMd, 'utf-8');
    return { created: true, path: filePath, name: draft.name };
  } catch (err: any) {
    return { created: false, reason: err?.message || String(err) };
  }
}
