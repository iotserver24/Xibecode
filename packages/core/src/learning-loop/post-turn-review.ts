/**
 * Background post-turn review .
 * Heuristic extraction + optional LLM aux review + write-approval staging.
 */

import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { CuratedMemoryStore } from './curated-memory.js';
import {
  draftSkillFromRun,
  saveLearnedSkill,
  shouldLearnSkill,
  type SkillLearnResult,
} from './skill-learner.js';
import type { NeuralMemory } from '../memory.js';
import {
  isWriteApprovalEnabledAsync,
  stageWrite,
} from './write-approval.js';
import {
  llmPostTurnReview,
  resolveReviewLlmConfig,
} from './llm-review.js';
import { indexSessionDocument } from './session-fts.js';

export interface ReviewStats {
  toolCalls: number;
  filesChanged: number;
  iterations: number;
  changedFiles?: string[];
  toolsUsed?: string[];
  initialPrompt?: string;
  finalText?: string;
  sessionPath?: string;
  sessionId?: string;
}

export interface ReviewResult {
  memoryAdds: string[];
  userAdds: string[];
  neuralLessons: number;
  skill?: SkillLearnResult;
  staged: number;
  notifications: string[];
  usedLlm: boolean;
}

function messageText(msg: MessageParam): string {
  if (typeof msg.content === 'string') return msg.content;
  if (!Array.isArray(msg.content)) return '';
  return msg.content
    .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
    .map((b: any) => b.text)
    .join('\n');
}

function extractPreference(text: string): string | null {
  const m = text.match(
    /(?:I\s+prefer|always\s+use|never\s+(?:use|do)|please\s+always|don't\s+use)\s+(.{8,120})/i,
  );
  return m ? m[0].trim().slice(0, 200) : null;
}

function extractLesson(text: string): string | null {
  const m = text.match(
    /(?:the\s+issue\s+was|fixed\s+by|root\s+cause|workaround|lesson:)\s+(.{10,180})/i,
  );
  return m ? m[0].trim().slice(0, 220) : null;
}

function extractProjectFact(text: string): string | null {
  const m = text.match(
    /(?:this\s+project\s+uses|package\s+manager\s+is|tests\s+via|ci\s+runs)\s+(.{8,150})/i,
  );
  return m ? m[0].trim().slice(0, 200) : null;
}

async function maybeAddMemory(
  curated: CuratedMemoryStore,
  target: 'memory' | 'user',
  content: string,
  result: ReviewResult,
): Promise<void> {
  const approval = await isWriteApprovalEnabledAsync('memory');
  if (approval) {
    await stageWrite(
      'memory',
      `${target}: ${content.slice(0, 80)}`,
      { action: 'add', target, content },
      'post-turn-review',
    );
    result.staged++;
    return;
  }
  const r = await curated.add(target, content);
  if (r.success && !String(r.message || '').includes('duplicate')) {
    if (target === 'user') result.userAdds.push(content);
    else result.memoryAdds.push(content);
  }
}

/**
 * Run post-turn learning. Safe — never throws to callers.
 */
export async function runPostTurnReview(options: {
  messages: MessageParam[];
  stats: ReviewStats;
  curated?: CuratedMemoryStore;
  neural?: NeuralMemory | null;
  learnSkills?: boolean;
  /** Disable LLM aux (tests). */
  useLlm?: boolean;
}): Promise<ReviewResult> {
  const result: ReviewResult = {
    memoryAdds: [],
    userAdds: [],
    neuralLessons: 0,
    staged: 0,
    notifications: [],
    usedLlm: false,
  };

  try {
    const curated = options.curated || new CuratedMemoryStore();
    const recent = options.messages.slice(-12);
    const blob = recent.map(messageText).join('\n');

    // Index session for FTS
    if (options.stats.sessionPath || options.stats.sessionId) {
      try {
        await indexSessionDocument({
          id: options.stats.sessionId || 'session',
          path: options.stats.sessionPath || options.stats.sessionId || 'in-memory',
          title: (options.stats.initialPrompt || 'session').slice(0, 80),
          body: blob.slice(0, 50_000),
          updated: Date.now(),
        });
      } catch {
        /* ignore */
      }
    }

    // Heuristic USER preferences
    for (const msg of recent) {
      if (msg.role !== 'user') continue;
      const pref = extractPreference(messageText(msg));
      if (pref) await maybeAddMemory(curated, 'user', pref, result);
    }

    // Heuristic MEMORY
    const lesson = extractLesson(blob);
    if (lesson) await maybeAddMemory(curated, 'memory', lesson, result);
    const fact = extractProjectFact(blob);
    if (fact) await maybeAddMemory(curated, 'memory', fact, result);

    // LLM aux review (optional)
    if (options.useLlm !== false) {
      const llmCfg = resolveReviewLlmConfig();
      if (llmCfg) {
        const digest = recent.map((m) => ({
          role: String(m.role),
          content: messageText(m).slice(0, 1500),
        }));
        const llm = await llmPostTurnReview(
          digest,
          {
            toolCalls: options.stats.toolCalls,
            filesChanged: options.stats.filesChanged,
            prompt: options.stats.initialPrompt,
          },
          llmCfg,
        );
        if (llm) {
          result.usedLlm = true;
          for (const m of llm.memory || []) {
            if (m.trim()) await maybeAddMemory(curated, 'memory', m.trim().slice(0, 220), result);
          }
          for (const u of llm.user || []) {
            if (u.trim()) await maybeAddMemory(curated, 'user', u.trim().slice(0, 200), result);
          }
          if (llm.skill?.name && llm.skill.content && options.learnSkills !== false) {
            await maybeSaveSkill(
              {
                name: llm.skill.name,
                description: llm.skill.description || llm.skill.name,
                content: llm.skill.content,
                tags: ['learned', 'llm-review'],
              },
              result,
            );
          }
        }
      }
    }

    // Neural lesson
    if (options.neural && options.stats.filesChanged > 0 && options.stats.initialPrompt) {
      try {
        await options.neural.addMemory(
          options.stats.initialPrompt.slice(0, 200),
          `tools=${options.stats.toolCalls}, files=${options.stats.filesChanged}`,
          (options.stats.finalText || 'Completed coding task').slice(0, 200),
          ['learning-loop', 'auto'],
        );
        result.neuralLessons = 1;
      } catch {
        /* ignore */
      }
    }

    // Heuristic skill promotion
    if (
      options.learnSkills !== false &&
      !result.skill &&
      shouldLearnSkill({
        toolCalls: options.stats.toolCalls,
        filesChanged: options.stats.filesChanged,
        iterations: options.stats.iterations,
      })
    ) {
      const draft = draftSkillFromRun({
        prompt: options.stats.initialPrompt || 'coding task',
        finalText: options.stats.finalText,
        toolsUsed: options.stats.toolsUsed,
        filesChanged: options.stats.changedFiles,
      });
      await maybeSaveSkill(draft, result);
    }

    if (result.memoryAdds.length || result.userAdds.length) {
      result.notifications.push(
        `💾 Memory updated` +
          (result.memoryAdds.length ? ` (+${result.memoryAdds.length} notes)` : '') +
          (result.userAdds.length ? ` (+${result.userAdds.length} user)` : ''),
      );
    }
    if (result.staged > 0) {
      result.notifications.push(
        `⏳ ${result.staged} write(s) staged for approval (xibecode memory pending)`,
      );
    }
    if (result.skill?.created) {
      result.notifications.push(`💾 Skill '${result.skill.name}' created`);
    }
    if (result.usedLlm) {
      result.notifications.push('🧠 LLM review completed');
    }
  } catch {
    /* never break agent completion */
  }

  return result;
}

async function maybeSaveSkill(
  draft: {
    name: string;
    description: string;
    content: string;
    tags?: string[];
  },
  result: ReviewResult,
): Promise<void> {
  const approval = await isWriteApprovalEnabledAsync('skill');
  if (approval) {
    await stageWrite(
      'skill',
      `skill: ${draft.name} — ${draft.description.slice(0, 60)}`,
      { ...draft },
      'post-turn-review',
    );
    result.staged++;
    return;
  }
  result.skill = await saveLearnedSkill(draft);
}
