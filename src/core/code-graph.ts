import { Project, Node, SyntaxKind, SourceFile } from 'ts-morph';
import * as path from 'path';
import * as fs from 'fs';

export interface GraphSearchResult {
    name: string;
    kind: string;
    filePath: string;
    line: number;
    text: string;
    references?: number;
}

export class CodeGraph {
    private project: Project | null = null;
    private workingDir: string;
    private isInitialized = false;

    constructor(workingDir: string = process.cwd()) {
        this.workingDir = workingDir;
    }

    async init(): Promise<void> {
        if (this.isInitialized) return;

        const tsConfigPath = path.join(this.workingDir, 'tsconfig.json');
        if (fs.existsSync(tsConfigPath)) {
            this.project = new Project({
                tsConfigFilePath: tsConfigPath,
                skipAddingFilesFromTsConfig: false,
            });
        } else {
            // Fallback for non-TS projects or missing config
            this.project = new Project({
                compilerOptions: {
                    allowJs: true,
                }
            });
            this.project.addSourceFilesAtPaths([
                path.join(this.workingDir, 'src/**/*{.ts,.js,.tsx,.jsx}'),
            ]);
        }

        this.isInitialized = true;
    }

    async search(query: string): Promise<GraphSearchResult[]> {
        await this.init();
        if (!this.project) return [];

        const results: GraphSearchResult[] = [];
        const sourceFiles = this.project.getSourceFiles();

        // Simple substring search for now, could be enhanced with fuzzy search
        for (const sourceFile of sourceFiles) {
            // Check for classes, interfaces, functions, variables
            const declarations = [
                ...sourceFile.getClasses(),
                ...sourceFile.getInterfaces(),
                ...sourceFile.getFunctions(),
                ...sourceFile.getEnums(),
                ...sourceFile.getTypeAliases(),
                ...sourceFile.getVariableDeclarations()
            ];

            for (const decl of declarations) {
                const name = decl.getName();
                if (name && name.toLowerCase().includes(query.toLowerCase())) {
                    // It's a match
                    // Find references
                    // Note: findReferences is expensive, maybe make it optional or limit depth?
                    // For now, we'll skip finding references count to be fast, unless exact match?

                    let refCount = 0;
                    // Only count refs if it's an exact match to avoid perf hit on partials
                    // Or maybe just don't count refs for search list

                    results.push({
                        name: name,
                        kind: decl.getKindName(),
                        filePath: path.relative(this.workingDir, sourceFile.getFilePath()),
                        line: decl.getStartLineNumber(),
                        text: decl.getText().substring(0, 200).split('\n')[0], // First line preview
                        references: refCount
                    });
                }
            }
        }

        return results.slice(0, 20); // Limit results
    }

    async findReferences(symbolName: string): Promise<string> {
        await this.init();
        if (!this.project) return 'Project not initialized';

        const sourceFiles = this.project.getSourceFiles();
        let output = '';

        for (const sourceFile of sourceFiles) {
            const declarations = [
                ...sourceFile.getClasses(),
                ...sourceFile.getInterfaces(),
                ...sourceFile.getFunctions(),
                ...sourceFile.getVariableDeclarations()
            ];

            const match = declarations.find(d => d.getName() === symbolName);
            if (match) {
                // Found the definition
                output += `Definition: ${match.getKindName()} ${match.getName()} in ${path.relative(this.workingDir, sourceFile.getFilePath())}:${match.getStartLineNumber()}\n`;

                // Find usages
                // Note: referencedSymbols returns complex objects
                const refs = match.findReferencesAsNodes();
                output += `Found ${refs.length} references:\n`;

                for (const ref of refs) {
                    const refFile = ref.getSourceFile();
                    output += `- ${path.relative(this.workingDir, refFile.getFilePath())}:${ref.getStartLineNumber()} : ${ref.getParent()?.getText().substring(0, 50).replace(/\n/g, ' ')}...\n`;
                }
                return output; // Return after first strong match
            }
        }

        return `Symbol '${symbolName}' not found in logical definitions.`;
    }
}
