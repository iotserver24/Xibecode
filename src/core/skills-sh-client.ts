import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

import stripAnsi from 'strip-ansi';

const execAsync = promisify(exec);

export interface SkillsShResult {
    id: string;
    url: string;
}

export class SkillsShClient {
    /**
     * Search for skills using `npx skills find`
     */
    async search(query: string): Promise<SkillsShResult[]> {
        try {
            // Run npx skills find [query]
            // We use -y to skip confirmation
            const { stdout } = await execAsync(`npx -y skills find "${query}"`);

            return this.parseSearchResults(stripAnsi(stdout));
        } catch (error: any) {
            console.warn('Skills.sh search error:', error.message);
            return [];
        }
    }

    /**
     * Install a skill using `npx skills add`
     * Note: This CLI installs skills to the local project or global scope. 
     * We'll try to detect where it went or just let it install to the cwd by default 
     * and then move it if necessary, but for now we trust `npx skills add` to do its thing.
     */
    async install(skillId: string, targetDir: string): Promise<string | null> {
        try {
            // npx skills add <skillId> -y
            // The CLI might create a file in the current directory or .agent/skills
            // We'll run it in the target directory to be safe, or just in cwd and move it.
            // Let's try running in cwd.
            await execAsync(`npx -y skills add ${skillId} -y`, { cwd: targetDir });

            // We need to figure out what file was created. 
            // The CLI output might tell us, but for now we assume it creates a file based on the skill name.
            // Since we can't easily parse the output for the filename reliably without running it,
            // we might just return success and let the user/system discover the new file.
            return `Skill ${skillId} installed successfully.`;
        } catch (error: any) {
            console.error('Skills.sh install error:', error.message);
            return null;
        }
    }

    private parseSearchResults(stdout: string): SkillsShResult[] {
        const results: SkillsShResult[] = [];
        const lines = stdout.split('\n');

        // Example output:
        // vercel-labs/agent-skills@vercel-react-best-practices
        // └ https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices

        let currentId = '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith('└')) {
                // Link line
                const url = trimmed.substring(2).trim();
                if (currentId && url) {
                    results.push({ id: currentId, url });
                    currentId = '';
                }
            } else if (!trimmed.startsWith('Install with') && !trimmed.includes('skills.sh') && trimmed.includes('/')) {
                // Likely an ID line like "owner/repo@skill"
                currentId = trimmed;
            }
        }

        return results;
    }
}
