import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { crawlDocs, generateSkillFromDocs } from './docs-scraper.js';

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

    constructor(workingDir: string = process.cwd()) {
        // Built-in skills shipped with XibeCode
        this.builtInSkillsDir = path.join(__dirname, '..', '..', 'skills');
        // User-defined skills in project
        this.userSkillsDir = path.join(workingDir, '.xibecode', 'skills');
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
     * Learn a skill from documentation URL.
     * Crawls the docs site, scrapes pages, and generates a skill file.
     */
    async learnFromDocs(
        name: string,
        url: string,
        maxPages: number = 25,
        onProgress?: (msg: string) => void,
    ): Promise<{ success: boolean; pagesScraped: number; filePath: string; error?: string }> {
        try {
            // Crawl docs
            const pages = await crawlDocs(url, maxPages, onProgress);

            if (pages.length === 0) {
                return { success: false, pagesScraped: 0, filePath: '', error: 'No pages could be scraped from that URL' };
            }

            // Generate skill content
            const skillContent = generateSkillFromDocs(name, url, pages);

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

            return { success: true, pagesScraped: pages.length, filePath };
        } catch (error: any) {
            return { success: false, pagesScraped: 0, filePath: '', error: error.message };
        }
    }
}
