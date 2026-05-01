/** Minimal skill shape for selection (matches `Skill` from skills.ts). */
export interface SkillLike {
    name: string;
    description: string;
    tags?: string[];
    instructions: string;
}

/** Always injected — safe CLI/automation habits regardless of task wording. */
export const CORE_BUNDLED_SKILL_NAMES = ['sandbox-autonomous'] as const;

const PROMPT_STOPWORDS = new Set([
    'the',
    'and',
    'for',
    'with',
    'this',
    'that',
    'from',
    'your',
    'have',
    'has',
    'are',
    'was',
    'were',
    'will',
    'can',
    'not',
    'you',
    'into',
    'about',
    'when',
    'what',
    'which',
    'their',
    'them',
    'then',
    'than',
    'also',
    'just',
    'add',
    'all',
    'get',
    'use',
    'using',
    'new',
    'how',
    'out',
    'our',
    'but',
    'any',
    'its',
    'may',
    'now',
    'one',
    'two',
    'way',
    'who',
    'did',
    'let',
]);

export interface SkillSelectionOptions {
    /** Max skills including core (default 12). */
    maxSkills?: number;
    /** Minimum skills when the catalog has enough entries (pads with next-best scores). Default 5. */
    minSkills?: number;
    /** Include skills at or above this relevance score before padding (default 2). */
    minScore?: number;
}

export function tokenizeTaskPrompt(taskPrompt: string): string[] {
    const lower = taskPrompt.toLowerCase();
    return lower
        .split(/[^a-z0-9]+/g)
        .filter((t) => t.length >= 3 && !PROMPT_STOPWORDS.has(t));
}

/** dependency + devDependency names (and scoped short names) from package.json */
export function extractDepTokens(pkg: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
}): Set<string> {
    const out = new Set<string>();
    const addKey = (k: string) => {
        const key = k.toLowerCase();
        out.add(key);
        if (key.startsWith('@')) {
            const parts = key.split('/');
            const short = parts[parts.length - 1];
            if (short && short.length > 1) out.add(short);
            if (parts.length >= 2) out.add(parts.slice(0, 2).join('/'));
        }
    };
    const merge = (obj?: Record<string, string>) => {
        if (!obj) return;
        for (const k of Object.keys(obj)) addKey(k);
    };
    merge(pkg.dependencies);
    merge(pkg.devDependencies);
    merge(pkg.peerDependencies);
    merge(pkg.optionalDependencies);
    return out;
}

/**
 * Score how relevant a bundled skill is to the task prompt and dependency tokens.
 */
export function scoreSkillRelevance(skill: SkillLike, promptTokens: string[], depTokens: Set<string>): number {
    const text = [skill.name, skill.description, ...(skill.tags || [])].join(' ').toLowerCase();
    const nameLower = skill.name.toLowerCase().replace(/-/g, ' ');
    let score = 0;

    for (const t of promptTokens) {
        if (t.length < 3) continue;
        if (text.includes(t) || nameLower.includes(t)) score += 3;
    }

    for (const d of depTokens) {
        if (d.length < 2) continue;
        if (text.includes(d)) score += 5;
        if (skill.name.toLowerCase().includes(d.replace(/[@/]/g, '-'))) score += 4;
    }

    // Light synonym hints when deps are empty but prompt mentions stacks
    if (depTokens.size === 0 && promptTokens.length > 0) {
        const joined = promptTokens.join(' ');
        if (joined.includes('react') && (skill.name.includes('react') || text.includes('react'))) score += 2;
        if (joined.includes('next') && skill.name.includes('next')) score += 2;
    }

    return score;
}

/**
 * Pick a subset of bundled skills: core names first, then prompt/dependency matches (score ≥ threshold),
 * then pad to minSkills with next-best entries. Does not fill to maxSkills with unrelated skills.
 */
export function selectRelevantBuiltInSkills(
    builtInSkills: SkillLike[],
    taskPrompt: string,
    depTokens: Set<string>,
    options?: SkillSelectionOptions
): SkillLike[] {
    const maxSkills = Math.max(1, options?.maxSkills ?? 12);
    const minSkills = Math.min(maxSkills, Math.max(1, options?.minSkills ?? 5));
    const minScore = options?.minScore ?? 2;

    if (builtInSkills.length === 0) return [];

    const byName = new Map(builtInSkills.map((s) => [s.name, s]));
    const promptTokens = tokenizeTaskPrompt(taskPrompt);

    const scored = builtInSkills.map((s) => ({
        skill: s,
        score: scoreSkillRelevance(s, promptTokens, depTokens),
    }));

    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.skill.name.localeCompare(b.skill.name);
    });

    const selected: SkillLike[] = [];
    const seen = new Set<string>();

    for (const name of CORE_BUNDLED_SKILL_NAMES) {
        const sk = byName.get(name);
        if (sk && !seen.has(sk.name)) {
            selected.push(sk);
            seen.add(sk.name);
        }
    }

    for (const { skill, score } of scored) {
        if (seen.has(skill.name)) continue;
        if (selected.length >= maxSkills) break;
        if (score >= minScore) {
            selected.push(skill);
            seen.add(skill.name);
        }
    }

    for (const { skill } of scored) {
        if (selected.length >= minSkills || selected.length >= maxSkills) break;
        if (seen.has(skill.name)) continue;
        selected.push(skill);
        seen.add(skill.name);
    }

    return selected.slice(0, maxSkills);
}

export function formatSelectionSummary(selected: SkillLike[], totalBundled: number): string {
    if (totalBundled === 0) return '';
    return `Selected **${selected.length}** of **${totalBundled}** bundled skills for this run (from your task wording and \`package.json\` dependencies).`;
}
