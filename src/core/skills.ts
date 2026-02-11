import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { crawlDocs, generateSkillFromDocs, type AISynthesisConfig } from './docs-scraper.js';
import { MarketplaceClient, type MarketplaceSkillResult } from './marketplace-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Skill {
    name: string;
    description: string;
    instructions: string;
    tags?: string[];
}

export class SkillManager {
    private skills: Map<string, Skill> = new Map();
    private builtInSkillsDir: string;
    private userSkillsDir: string;
    private marketplace: MarketplaceClient;
    private aiConfig: AISynthesisConfig;

    constructor(workingDir: string = process.cwd(), apiKey?: string, baseUrl?: string, model?: string, provider?: 'anthropic' | 'openai') {
        // Built-in skills shipped with XibeCode
        this.builtInSkillsDir = path.join(__dirname, '..', '..', 'skills');
        // User-defined skills in project
        this.userSkillsDir = path.join(workingDir, '.xibecode', 'skills');
        this.marketplace = new MarketplaceClient();
        this.aiConfig = {
            apiKey: apiKey || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '',
            baseUrl,
            model,
            provider,
        };
    }

    async loadSkills(): Promise<void> {
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
                const skill = this.parseSkillFile(content, file);
                if (skill) {
                    this.skills.set(skill.name, skill);
                }
            }
        } catch (error) {
            // Directory doesn't exist or can't be read
            if (source === 'built-in') {
                console.warn(`Warning: Could not load built-in skills from ${dir}`);
            }
        }
    }

    private parseSkillFile(content: string, filename: string): Skill | null {
        // Parse YAML frontmatter + markdown content
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

        if (!frontmatterMatch) {
            return null;
        }

        const [, frontmatter, instructions] = frontmatterMatch;
        const name = filename.replace('.md', '');

        // Parse simple YAML (name: value format)
        const meta: Record<string, any> = {};
        frontmatter.split('\n').forEach(line => {
            const match = line.match(/^(\w+):\s*(.+)$/);
            if (match) {
                const [, key, value] = match;
                if (key === 'tags') {
                    meta[key] = value.split(',').map(t => t.trim());
                } else {
                    meta[key] = value;
                }
            }
        });

        return {
            name,
            description: meta.description || '',
            instructions: instructions.trim(),
            tags: meta.tags || [],
        };
    }

    getSkill(name: string): Skill | undefined {
        return this.skills.get(name);
    }

    listSkills(): Skill[] {
        return Array.from(this.skills.values());
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
            const skill = this.parseSkillFile(finalContent, `${fileName}.md`);
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
}
