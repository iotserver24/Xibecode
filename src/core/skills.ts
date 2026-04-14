import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import matter from 'gray-matter';
import { crawlDocs, generateSkillFromDocs, type AISynthesisConfig } from './docs-scraper.js';
import { MarketplaceClient, type MarketplaceSkillResult } from './marketplace-client.js';
import { SkillsShClient, type SkillsShResult } from './skills-sh-client.js';
import { ProviderType } from '../utils/config.js';
import {
    extractDepTokens,
    selectRelevantBuiltInSkills,
    formatSelectionSummary,
    type SkillSelectionOptions,
} from './skill-selection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Skill {
    name: string;
    description: string;
    instructions: string;
    tags?: string[];
    provenance?: 'built-in' | 'user' | 'marketplace' | 'skills.sh' | 'mcp';
    filePath?: string;
}

export class SkillManager {
    private skills: Map<string, Skill> = new Map();
    /** Skills loaded from the shipped `skills/` directory (for system-prompt injection). */
    private builtInSkills: Skill[] = [];
    private builtInSkillsDir: string;
    private userSkillsDir: string;
    private marketplace: MarketplaceClient;
    private skillsSh: SkillsShClient;
    private aiConfig: AISynthesisConfig;

    constructor(workingDir: string = process.cwd(), apiKey?: string, baseUrl?: string, model?: string, provider?: ProviderType) {
        // Built-in skills shipped with XibeCode
        this.builtInSkillsDir = path.join(__dirname, '..', '..', 'skills');
        // User-defined skills in project
        this.userSkillsDir = path.join(workingDir, '.xibecode', 'skills');
        this.marketplace = new MarketplaceClient();
        this.skillsSh = new SkillsShClient();
        this.aiConfig = {
            apiKey: apiKey || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '',
            baseUrl,
            model,
            provider,
        };
    }

    async loadSkills(): Promise<void> {
        this.builtInSkills = [];
        // Load built-in skills
        await this.loadSkillsFromDirectory(this.builtInSkillsDir, 'built-in');

        // Load user skills (if directory exists)
        try {
            await fs.access(this.userSkillsDir);
            await this.loadSkillsFromDirectory(this.userSkillsDir, 'user');
        } catch {
            // User skills directory doesn't exist, skip
        }
    }

    private async loadSkillsFromDirectory(dir: string, source: 'built-in' | 'user'): Promise<void> {
        try {
            const files = await fs.readdir(dir);
            const skillFiles = files.filter(f => f.endsWith('.md'));

            for (const file of skillFiles) {
                const filePath = path.join(dir, file);
                const content = await fs.readFile(filePath, 'utf-8');
                const skill = this.parseSkillFile(content, file, {
                    provenance: source === 'built-in' ? 'built-in' : 'user',
                    filePath,
                });
                if (skill) {
                    this.skills.set(skill.name, skill);
                    if (source === 'built-in') {
                        this.builtInSkills.push(skill);
                    }
                }
            }
        } catch (error) {
            // Directory doesn't exist or can't be read
            if (source === 'built-in') {
                console.warn(`Warning: Could not load built-in skills from ${dir}`);
            }
        }
    }

    private parseSkillFile(
        content: string,
        filename: string,
        metaOverride?: { provenance?: Skill['provenance']; filePath?: string },
    ): Skill | null {
        try {
            const parsed = matter(content);
            const data = (parsed.data || {}) as any;
            const nameFromFile = filename.replace(/\.md$/i, '');
            const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : nameFromFile;
            const description = typeof data.description === 'string' ? data.description : '';
            const tags =
                Array.isArray(data.tags) ? data.tags.map(String) :
                typeof data.tags === 'string' ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean) :
                [];

            const instructions = (parsed.content || '').trim();
            if (!instructions) return null;

            return {
                name,
                description,
                instructions,
                tags,
                provenance: metaOverride?.provenance,
                filePath: metaOverride?.filePath,
            };
        } catch {
            return null;
        }
    }

    getSkill(name: string): Skill | undefined {
        return this.skills.get(name);
    }

    listSkills(): Skill[] {
        return Array.from(this.skills.values());
    }

    /**
     * Build the bundled-skills block for the system prompt by **selecting** skills that match
     * the task text and `package.json` dependencies (plus a small always-on core set).
     */
    async buildDefaultSkillsPromptForTask(
        taskPrompt: string,
        cwd: string,
        options?: SkillSelectionOptions
    ): Promise<string> {
        if (this.builtInSkills.length === 0) return '';

        let depTokens = new Set<string>();
        try {
            const raw = await fs.readFile(path.join(cwd, 'package.json'), 'utf-8');
            depTokens = extractDepTokens(JSON.parse(raw));
        } catch {
            /* no package.json */
        }

        const selected = selectRelevantBuiltInSkills(this.builtInSkills, taskPrompt, depTokens, options);
        const summary = formatSelectionSummary(selected, this.builtInSkills.length);
        const bundledBlock = this.formatSelectedBuiltInSkillsForPrompt(selected, summary);

        const catalog = this.formatSkillCatalogForPrompt({ maxChars: 2000 });
        return bundledBlock + (catalog ? `\n\n---\n\n${catalog}` : '');
    }

    private formatSkillCatalogForPrompt(opts: { maxChars: number }): string {
        const all = this.listSkills()
            .filter((s) => s.provenance !== 'built-in')
            .sort((a, b) => a.name.localeCompare(b.name));
        if (all.length === 0) return '';
        const lines = all.map((s) => `- ${s.name}${s.description ? ` — ${s.description}` : ''}`);
        let out = `## Available local skills\n\n${lines.join('\n')}`;
        if (out.length > opts.maxChars) {
            out = out.slice(0, opts.maxChars) + '\n\n[Skill list truncated]';
        }
        return out;
    }

    /**
     * @deprecated Prefer `buildDefaultSkillsPromptForTask` so selection scales with many bundled skills.
     * Formats every loaded built-in skill (no dependency-aware selection).
     */
    formatBuiltInSkillsForSystemPrompt(): string {
        if (this.builtInSkills.length === 0) return '';
        return this.formatSelectedBuiltInSkillsForPrompt(
            this.builtInSkills,
            formatSelectionSummary(this.builtInSkills, this.builtInSkills.length)
        );
    }

    private formatSelectedBuiltInSkillsForPrompt(selected: Skill[], selectionSummary: string): string {
        if (selected.length === 0) return '';
        const maxTotal = 28_000;
        const intro =
            selectionSummary +
            '\n\nApply the subsections below when they fit the work. For more domain skills, use `search_skills_sh` or add files under `.xibecode/skills`.\n\n';
        const sorted = [...selected].sort((a, b) => a.name.localeCompare(b.name));
        const parts = sorted.map((s) => `### ${s.name}\n*${s.description}*\n\n${s.instructions}`);
        let body = `## Default bundled skills\n\n${intro}` + parts.join('\n\n---\n\n');
        if (body.length > maxTotal) {
            body =
                body.slice(0, maxTotal) +
                '\n\n[Bundled skills truncated for length; follow the skill titles above and general best practices.]';
        }
        return body;
    }

    searchSkills(query: string): Skill[] {
        const lowerQuery = query.toLowerCase();
        return this.listSkills().filter(skill =>
            skill.name.toLowerCase().includes(lowerQuery) ||
            skill.description.toLowerCase().includes(lowerQuery) ||
            skill.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
        );
    }

    /**
     * Search the Skills Marketplace for community skills
     */
    async searchMarketplace(query: string = '', limit: number = 10): Promise<MarketplaceSkillResult[]> {
        try {
            const response = await this.marketplace.searchSkills(query, limit);
            return response.results;
        } catch (error: any) {
            throw new Error(`Marketplace search failed: ${error.message}`);
        }
    }

    /**
     * Install a skill from the marketplace by ID
     * Downloads the content and saves it to the user skills directory
     */
    async installFromMarketplace(
        id: string,
        skillName: string,
        onProgress?: (msg: string) => void,
    ): Promise<{ success: boolean; filePath: string; error?: string }> {
        try {
            onProgress?.('Downloading skill from marketplace...');
            const { content, name } = await this.marketplace.getSkillContent(id);

            // Ensure user skills directory exists
            await fs.mkdir(this.userSkillsDir, { recursive: true });

            // Sanitize filename
            const fileName = skillName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
            const filePath = path.join(this.userSkillsDir, `${fileName}.md`);

            // If the content doesn't have frontmatter, wrap it
            let finalContent = content;
            if (!content.startsWith('---')) {
                finalContent = `---\nname: ${name || skillName}\ndescription: Installed from Skills Marketplace\ntags: marketplace\n---\n\n${content}`;
            }

            await fs.writeFile(filePath, finalContent, 'utf-8');
            onProgress?.('Skill saved locally');

            // Register the skill locally
            const skill = this.parseSkillFile(finalContent, `${fileName}.md`, {
                provenance: 'marketplace',
                filePath,
            });
            if (skill) {
                this.skills.set(skill.name, skill);
            }

            return { success: true, filePath };
        } catch (error: any) {
            return { success: false, filePath: '', error: error.message };
        }
    }

    /**
     * Upload a skill to the marketplace
     */
    async uploadToMarketplace(
        content: string,
        skillName?: string,
        onProgress?: (msg: string) => void,
    ): Promise<{ success: boolean; skillId?: string; error?: string }> {
        try {
            onProgress?.('Uploading skill to marketplace...');
            const result = await this.marketplace.uploadSkill(content, skillName);
            onProgress?.(`Skill published to marketplace as "${result.skill.name}"`);
            return { success: true, skillId: result.skillId };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Learn a skill from documentation URL.
     * Crawls the docs site, scrapes pages, and generates a skill file.
     * Auto-uploads to the Skills Marketplace on success.
     */
    async learnFromDocs(
        name: string,
        url: string,
        maxPages: number = 25,
        onProgress?: (msg: string) => void,
    ): Promise<{ success: boolean; pagesScraped: number; filePath: string; error?: string; marketplaceId?: string }> {
        try {
            // Crawl docs
            const pages = await crawlDocs(url, maxPages, onProgress);

            if (pages.length === 0) {
                return { success: false, pagesScraped: 0, filePath: '', error: 'No pages could be scraped from that URL' };
            }

            // Generate skill content using AI synthesis
            const skillContent = await generateSkillFromDocs(name, url, pages, this.aiConfig, onProgress);

            // Ensure user skills directory exists
            await fs.mkdir(this.userSkillsDir, { recursive: true });

            // Save skill file
            const filePath = path.join(this.userSkillsDir, `${name}.md`);
            await fs.writeFile(filePath, skillContent, 'utf-8');

            // Parse and register the skill
            const skill = this.parseSkillFile(skillContent, `${name}.md`);
            if (skill) {
                this.skills.set(skill.name, skill);
            }

            // Auto-upload to marketplace
            let marketplaceId: string | undefined;
            try {
                onProgress?.('Publishing skill to marketplace...');
                const uploadResult = await this.marketplace.uploadSkill(skillContent, name);
                marketplaceId = uploadResult.skillId;
                onProgress?.(`Skill published to marketplace as "${uploadResult.skill.name}"`);
            } catch (uploadError: any) {
                onProgress?.(`Marketplace upload skipped: ${uploadError.message}`);
            }

            return { success: true, pagesScraped: pages.length, filePath, marketplaceId };
        } catch (error: any) {
            return { success: false, pagesScraped: 0, filePath: '', error: error.message };
        }
    }

    async autoInstallFromSkillsShForTask(
        taskPrompt: string,
        opts?: { enabled?: boolean; maxInstalls?: number; onProgress?: (msg: string) => void }
    ): Promise<{ installed: boolean; skillId?: string; installedSkillNames?: string[]; message?: string }> {
        const enabled = opts?.enabled ?? false;
        const maxInstalls = opts?.maxInstalls ?? 1;
        if (!enabled) return { installed: false };
        if (!taskPrompt.trim()) return { installed: false };
        if (maxInstalls <= 0) return { installed: false };

        // If the user already has relevant local skills, don’t auto-install new ones.
        // “Relevant” here is a cheap metadata search (name/description/tags) to avoid silent growth.
        try {
            const existingMd = (await fs.readdir(this.userSkillsDir)).filter((f) => f.endsWith('.md'));
            if (existingMd.length > 0) {
                const localMatches = this.searchSkills(taskPrompt).filter((s) => s.provenance !== 'built-in');
                if (localMatches.length > 0) return { installed: false, message: 'Local skills matched; skipping auto-install' };
            }
        } catch {
            // ignore
        }

        const beforeNames = new Set(this.listSkills().map((s) => s.name));

        opts?.onProgress?.('Searching skills.sh for relevant skills…');
        const results = await this.searchSkillsSh(taskPrompt);
        const first = results[0];
        if (!first) return { installed: false, message: 'No skills.sh results' };

        opts?.onProgress?.(`Installing skills.sh skill: ${first.id}`);
        const installResult = await this.installFromSkillsSh(first.id);
        if (!installResult.success) {
            return { installed: false, skillId: first.id, message: installResult.message };
        }

        const after = this.listSkills().map((s) => s.name);
        const added = after.filter((n) => !beforeNames.has(n));
        return { installed: true, skillId: first.id, installedSkillNames: added, message: installResult.message };
    }

    /**
     * Search skills.sh for skills
     */
    async searchSkillsSh(query: string): Promise<SkillsShResult[]> {
        return this.skillsSh.search(query);
    }

    /**
     * Install a skill from skills.sh
     */
    async installFromSkillsSh(skillId: string): Promise<{ success: boolean; message?: string; filePath?: string }> {
        // We'll install strictly to the user skills directory if possible
        // But npx skills add might install to a different location or just output the file
        // For now, we'll run it in the user skills directory
        try {
            await fs.mkdir(this.userSkillsDir, { recursive: true });
            const result = await this.skillsSh.install(skillId, this.userSkillsDir);

            // Reload skills to pick up the new one
            await this.loadSkillsFromDirectory(this.userSkillsDir, 'user');

            const installedPath = result && result.endsWith('.md') ? result : undefined;
            return {
                success: !!result,
                message: result || 'Installation failed',
                filePath: installedPath,
            };
        } catch (error: any) {
            return { success: false, message: error.message };
        }
    }
}
