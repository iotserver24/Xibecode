import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ConflictBlock {
    index: number;
    startLine: number;
    endLine: number;
    ours: string; // Content between <<<<<<< and =======
    theirs: string; // Content between ======= and >>>>>>>
    base?: string; // Content between ||||||| and ======= (diff3)
    fullText: string;
}

export interface ConflictFile {
    filePath: string;
    conflicts: ConflictBlock[];
}

export class ConflictSolver {
    constructor(private workingDir: string) { }

    /**
     * Find files with conflict markers
     */
    async findConflictingFiles(): Promise<string[]> {
        try {
            // Try git first strictly for unmerged files
            const { stdout } = await execAsync('git diff --name-only --diff-filter=U', { cwd: this.workingDir });
            if (stdout.trim()) {
                return stdout.trim().split('\n').filter(f => f);
            }
        } catch (e) {
            // Fallback to grep if not git or error
        }

        try {
            // Recursive grep for marker
            // Exclude node_modules, .git
            const { stdout } = await execAsync('grep -r -l "<<<<<<<" . --exclude-dir=node_modules --exclude-dir=.git', { cwd: this.workingDir });
            return stdout.trim().split('\n').filter(f => f);
        } catch {
            return [];
        }
    }

    /**
     * Parse conflicts in a file
     */
    async parseConflicts(filePath: string): Promise<ConflictFile | null> {
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(this.workingDir, filePath);

        try {
            const content = await fs.readFile(absolutePath, 'utf-8');
            if (!content.includes('<<<<<<<')) return null;

            const lines = content.split('\n');
            const conflicts: ConflictBlock[] = [];

            let inConflict = false;
            let startLine = 0;
            let currentSection: 'ours' | 'base' | 'theirs' | null = null;
            let ours = '';
            let theirs = '';
            let base = '';
            let fullText = '';

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                if (line.startsWith('<<<<<<<')) {
                    inConflict = true;
                    startLine = i + 1;
                    currentSection = 'ours';
                    ours = '';
                    theirs = '';
                    base = '';
                    fullText = line + '\n';
                } else if (line.startsWith('|||||||')) {
                    currentSection = 'base';
                    fullText += line + '\n';
                } else if (line.startsWith('=======')) {
                    currentSection = 'theirs';
                    fullText += line + '\n';
                } else if (line.startsWith('>>>>>>>')) {
                    inConflict = false;
                    fullText += line + '\n';

                    conflicts.push({
                        index: conflicts.length + 1,
                        startLine,
                        endLine: i + 1,
                        ours: ours.trim(),
                        theirs: theirs.trim(),
                        base: base.trim() || undefined,
                        fullText
                    });
                } else if (inConflict) {
                    fullText += line + '\n';
                    if (currentSection === 'ours') ours += line + '\n';
                    else if (currentSection === 'base') base += line + '\n';
                    else if (currentSection === 'theirs') theirs += line + '\n';
                }
            }

            if (conflicts.length === 0) return null;

            return {
                filePath: path.relative(this.workingDir, absolutePath),
                conflicts
            };

        } catch (error) {
            console.error(`Error parsing conflicts in ${filePath}:`, error);
            return null;
        }
    }
}
