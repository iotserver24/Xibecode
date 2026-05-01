import * as fs from 'fs/promises';
import * as path from 'path';

export interface PromotedMemory {
  key: string;
  value: string;
  promotedAt: string;
  source: 'session' | 'manual' | 'auto';
}

export class MemoryPromotions {
  private readonly filePath: string;

  constructor(private readonly workingDir: string = process.cwd()) {
    this.filePath = path.join(workingDir, '.xibecode', 'memory-promotions.json');
  }

  async promote(key: string, value: string, source: PromotedMemory['source'] = 'session'): Promise<void> {
    const entries = await this.list();
    const existing = entries.find((entry) => entry.key === key);
    const now = new Date().toISOString();
    if (existing) {
      existing.value = value;
      existing.source = source;
      existing.promotedAt = now;
    } else {
      entries.push({ key, value, source, promotedAt: now });
    }
    await this.save(entries);
  }

  async list(): Promise<PromotedMemory[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(raw) as PromotedMemory[];
    } catch {
      return [];
    }
  }

  private async save(entries: PromotedMemory[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(entries, null, 2), 'utf8');
  }
}
