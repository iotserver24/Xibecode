import * as ts from 'typescript';
import * as fs from 'fs/promises';
import * as path from 'path';
import glob from 'fast-glob';
import { createHash } from 'crypto';

export interface CodeChunk {
    id: string;
    filePath: string;
    startLine: number;
    endLine: number;
    type: 'function' | 'class' | 'interface' | 'variable';
    name: string;
    content: string;
    signature: string; // Simplified structure for comparison
}

export interface PatternCluster {
    id: string;
    description: string;
    chunks: CodeChunk[];
    frequency: number;
}

export class PatternMiner {
    private projectRoot: string;

    constructor(projectRoot: string = process.cwd()) {
        this.projectRoot = projectRoot;
    }

    /**
     * Main entry point: Scans the project and returns pattern clusters
     */
    async mine(excludePatterns: string[] = ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/*.spec.ts']): Promise<PatternCluster[]> {
        const files = await this.scanFiles(excludePatterns);
        const chunks: CodeChunk[] = [];

        console.log(`Scanning ${files.length} files for patterns...`);

        for (const file of files) {
            const fileChunks = await this.extractChunks(file);
            chunks.push(...fileChunks);
        }

        console.log(`Extracted ${chunks.length} code chunks. Analyzing similarities...`);
        return this.clusterChunks(chunks);
    }

    /**
     * Find all relevant TypeScript files
     */
    private async scanFiles(excludes: string[]): Promise<string[]> {
        return glob(['src/**/*.ts', 'src/**/*.tsx'], {
            cwd: this.projectRoot,
            ignore: excludes,
            absolute: true
        });
    }

    /**
     * Parse file and extract interesting AST nodes
     */
    private async extractChunks(filePath: string): Promise<CodeChunk[]> {
        const content = await fs.readFile(filePath, 'utf-8');
        const sourceFile = ts.createSourceFile(
            filePath,
            content,
            ts.ScriptTarget.Latest,
            true
        );

        const chunks: CodeChunk[] = [];

        const visit = (node: ts.Node) => {
            // Function Declarations
            if (ts.isFunctionDeclaration(node) && node.name) {
                chunks.push(this.createChunk(node, sourceFile, filePath, 'function', node.name.text));
            }
            // Class Declarations
            else if (ts.isClassDeclaration(node) && node.name) {
                chunks.push(this.createChunk(node, sourceFile, filePath, 'class', node.name.text));
            }
            // Interface Declarations
            else if (ts.isInterfaceDeclaration(node) && node.name) {
                chunks.push(this.createChunk(node, sourceFile, filePath, 'interface', node.name.text));
            }

            ts.forEachChild(node, visit);
        };

        visit(sourceFile);
        return chunks;
    }

    private createChunk(node: ts.Node, sourceFile: ts.SourceFile, filePath: string, type: CodeChunk['type'], name: string): CodeChunk {
        const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        const content = node.getText(sourceFile);

        return {
            id: createHash('md5').update(`${filePath}:${start.line}:${name}`).digest('hex'),
            filePath,
            startLine: start.line + 1,
            endLine: end.line + 1,
            type,
            name,
            content,
            signature: this.generateStructuralSignature(node) // The magic sauce for similarity
        };
    }

    /**
     * Generates a "structural fingerprint" used to find patterns.
     * It strips names, literals, and comments, keeping only keywords and structure.
     */
    private generateStructuralSignature(node: ts.Node): string {
        // Simple structural hashing: walk the tree and record syntax kinds
        const tokens: number[] = [];
        const visit = (n: ts.Node) => {
            tokens.push(n.kind);
            ts.forEachChild(n, visit);
        };
        visit(node);
        // Turn the array of SyntaxKinds into a string hash/string
        // This is a naive implementation; 
        // A better one would normalize identifiers to 'ID' but keep structure.
        return tokens.join(',');
    }

    /**
     * Groups chunks by similarity
     */
    private clusterChunks(chunks: CodeChunk[]): PatternCluster[] {
        const clusters: Map<string, CodeChunk[]> = new Map();

        // Exact Structural Match Clustering
        // TODO: Implement fuzzy matching (Jaccard) for V2
        for (const chunk of chunks) {
            // We ignore very small chunks to avoid noise
            if (chunk.content.length < 50) continue;

            const key = `${chunk.type}:${chunk.signature}`;
            if (!clusters.has(key)) {
                clusters.set(key, []);
            }
            clusters.get(key)!.push(chunk);
        }

        // Filter for meaningful clusters (e.g., duplicates > 1)
        const results: PatternCluster[] = [];
        clusters.forEach((clusterChunks, key) => {
            if (clusterChunks.length >= 2) {
                results.push({
                    id: createHash('md5').update(key).digest('hex'),
                    description: `Repeated ${clusterChunks[0].type} pattern found in ${clusterChunks.length} locations`,
                    chunks: clusterChunks,
                    frequency: clusterChunks.length
                });
            }
        });

        return results.sort((a, b) => b.frequency - a.frequency);
    }
}
