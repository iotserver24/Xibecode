import * as fs from 'fs/promises';
import * as path from 'path';

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;
  modified?: Date;
}

export class FileService {
  async readFile(filePath: string): Promise<{ content: string; error?: string }> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return { content };
    } catch (err: any) {
      return { content: '', error: err.message };
    }
  }

  async writeFile(filePath: string, content: string): Promise<{ success: boolean; error?: string }> {
    try {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async listDirectory(dirPath: string): Promise<{ entries: FileEntry[]; error?: string }> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const result: FileEntry[] = [];

      const filteredEntries = entries.filter((entry) => {
        return !(entry.name.startsWith('.') && entry.name !== '.env.example');
      });

      // ⚡ Bolt: Implemented bounded concurrency (chunk size 50) instead of sequential `await`s.
      // This reduces I/O bottlenecks when statting many files in a directory, avoiding OS EMFILE limits.
      const CONCURRENCY_LIMIT = 50;
      for (let i = 0; i < filteredEntries.length; i += CONCURRENCY_LIMIT) {
        const chunk = filteredEntries.slice(i, i + CONCURRENCY_LIMIT);

        const chunkResults = await Promise.all(
          chunk.map(async (entry) => {
            const fullPath = path.join(dirPath, entry.name);
            let size: number | undefined;
            let modified: Date | undefined;

            try {
              const stat = await fs.stat(fullPath);
              size = stat.size;
              modified = stat.mtime;
            } catch {
              // Skip entries we can't stat
            }

            return {
              name: entry.name,
              path: fullPath,
              isDirectory: entry.isDirectory(),
              isFile: entry.isFile(),
              size,
              modified,
            };
          })
        );

        result.push(...chunkResults);
      }

      result.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return { entries: result };
    } catch (err: any) {
      return { entries: [], error: err.message };
    }
  }

  async stat(filePath: string): Promise<{ exists: boolean; isDirectory?: boolean; isFile?: boolean; size?: number; error?: string }> {
    try {
      const stat = await fs.stat(filePath);
      return {
        exists: true,
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile(),
        size: stat.size,
      };
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return { exists: false };
      }
      return { exists: false, error: err.message };
    }
  }
}
