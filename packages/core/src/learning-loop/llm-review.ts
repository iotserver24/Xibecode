/**
 * Optional LLM-assisted post-turn review (cheap aux model).
 * Falls back to null if no key / request fails — caller keeps heuristics.
 */

import fetch from 'node-fetch';

export interface LlmReviewSuggestion {
  memory?: string[];
  user?: string[];
  skill?: { name: string; description: string; content: string } | null;
  notes?: string;
}

export interface LlmReviewConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  /** openai chat completions path default */
  timeoutMs?: number;
}

function digiestMessages(messages: Array<{ role: string; content: string }>, max = 6000): string {
  let s = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');
  if (s.length > max) s = s.slice(-max);
  return s;
}

/**
 * Ask a small model to extract durable learnings from a coding turn.
 */
export async function llmPostTurnReview(
  messages: Array<{ role: string; content: string }>,
  stats: { toolCalls: number; filesChanged: number; prompt?: string },
  config: LlmReviewConfig,
): Promise<LlmReviewSuggestion | null> {
  if (!config.apiKey?.trim()) return null;

  const base = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = config.model || process.env.XIBECODE_REVIEW_MODEL || 'gpt-4o-mini';
  const url = base.includes('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;

  const system = `You are a coding-agent memory curator. Given a conversation digest, extract ONLY durable facts.
Return strict JSON:
{
  "memory": string[]  // env/project/lessons, each <= 180 chars, max 3
  "user": string[]    // user prefs only, max 2
  "skill": null | { "name": "slug", "description": "short", "content": "markdown procedure" }
  "notes": string
}
Rules:
- Skip trivial or one-off debugging noise.
- skill only if a reusable multi-step coding workflow was proven (toolCalls>=5 or filesChanged>=1).
- Prefer empty arrays over inventing facts.`;

  const user = [
    `Stats: tools=${stats.toolCalls} files=${stats.filesChanged}`,
    stats.prompt ? `Task: ${stats.prompt.slice(0, 300)}` : '',
    '',
    digiestMessages(messages),
  ]
    .filter(Boolean)
    .join('\n');

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), config.timeoutMs ?? 25_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: controller.signal as any,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const text =
      data.choices?.[0]?.message?.content ||
      data.content?.[0]?.text ||
      '';
    if (!text) return null;
    const parsed = JSON.parse(text) as LlmReviewSuggestion;
    return {
      memory: Array.isArray(parsed.memory) ? parsed.memory.slice(0, 3).map(String) : [],
      user: Array.isArray(parsed.user) ? parsed.user.slice(0, 2).map(String) : [],
      skill: parsed.skill || null,
      notes: parsed.notes ? String(parsed.notes) : undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Resolve aux review credentials from env. */
export function resolveReviewLlmConfig(): LlmReviewConfig | null {
  const apiKey =
    process.env.XIBECODE_REVIEW_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const baseUrl =
    process.env.XIBECODE_REVIEW_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    (process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : undefined);
  return {
    apiKey,
    baseUrl,
    model: process.env.XIBECODE_REVIEW_MODEL,
  };
}
