import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

export interface MemoryItem {
    id: string;
    timestamp: number;
    trigger: string; // The context/error that triggered this memory
    action: string;  // What was done
    outcome: string; // The result (e.g., "Fixed build error", "Optimized query")
    tags: string[];
    embedding?: number[]; // Reserved for future vector search
}

export interface MemoryStore {
    items: MemoryItem[];
    lastUpdated: number;
}

export class NeuralMemory {
    private memoryFile: string;
    private memory: MemoryStore = { items: [], lastUpdated: 0 };
    private initialized: boolean = false;

    constructor(private workingDir: string = process.cwd()) {
        const xibeDir = path.join(workingDir, '.xibecode');
        this.memoryFile = path.join(xibeDir, 'memory.json');
    }

    async init(): Promise<void> {
        if (this.initialized) return;

        try {
            const xibeDir = path.dirname(this.memoryFile);
            if (!existsSync(xibeDir)) {
                await fs.mkdir(xibeDir, { recursive: true });
            }

            if (existsSync(this.memoryFile)) {
                const content = await fs.readFile(this.memoryFile, 'utf-8');
                this.memory = JSON.parse(content);
            }
            this.initialized = true;
        } catch (error) {
            console.warn('Failed to initialize memory:', error);
            // Start with empty memory on failure
            this.memory = { items: [], lastUpdated: 0 };
            this.initialized = true;
        }
    }

    async addMemory(trigger: string, action: string, outcome: string, tags: string[] = []): Promise<void> {
        await this.init();

        const id = createHash('md5').update(`${trigger}:${action}:${Date.now()}`).digest('hex');
        const item: MemoryItem = {
            id,
            timestamp: Date.now(),
            trigger,
            action,
            outcome,
            tags
        };

        this.memory.items.push(item);
        this.memory.lastUpdated = Date.now();
        await this.persist();
    }

    /**
     * Retrieve relevant memories based on a query string (context or error message).
     * Currently uses keyword matching. Future: Vector search.
     */
    async retrieve(query: string, limit: number = 5): Promise<MemoryItem[]> {
        await this.init();

        const queryLower = query.toLowerCase();
        const keywords = queryLower.split(/\s+/).filter(w => w.length > 3);

        const scored = this.memory.items.map(item => {
            let score = 0;
            const content = `${item.trigger} ${item.outcome} ${item.tags.join(' ')}`.toLowerCase();

            // Exact phrase match (high weight)
            if (content.includes(queryLower)) score += 10;

            // Keyword match
            for (const word of keywords) {
                if (content.includes(word)) score += 1;
            }

            // Recency boost (decay over 30 days)
            const daysOld = (Date.now() - item.timestamp) / (1000 * 60 * 60 * 24);
            const recencyScore = Math.max(0, 1 - daysOld / 30);
            score += recencyScore * 2;

            return { item, score };
        });

        // Filter zero scores and sort
        const results = scored
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(r => r.item);

        return results;
    }

    async getAll(): Promise<MemoryItem[]> {
        await this.init();
        return this.memory.items;
    }

    private async persist(): Promise<void> {
        try {
            await fs.writeFile(this.memoryFile, JSON.stringify(this.memory, null, 2), 'utf-8');
        } catch (error) {
            console.error('Failed to save memory:', error);
        }
    }
}
