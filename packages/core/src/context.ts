import * as fs from 'fs/promises';
import * as path from 'path';
import fg from 'fast-glob';

export interface FileContext {
  path: string;
  content: string;
  lines: number;
  size: number;
  language?: string;
}

export interface ContextWindow {
  files: FileContext[];
  totalTokens: number;
  maxTokens: number;
}

export class ContextManager {
  private workingDir: string;
  private maxContextTokens: number = 100000; // ~100k tokens
  private loadedFiles: Map<string, FileContext> = new Map();
  
  // Files to exclude from context
  private excludePatterns = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**',
    '**/*.min.js',
    '**/*.map',
    '**/package-lock.json',
    '**/yarn.lock',
  ];

  constructor(workingDir: string, maxTokens?: number) {
    this.workingDir = workingDir;
    if (maxTokens) this.maxContextTokens = maxTokens;
  }

  /**
   * Smart context builder - automatically includes relevant files
   */
  async buildContext(primaryFiles: string[] = []): Promise<ContextWindow> {
    const context: ContextWindow = {
      files: [],
      totalTokens: 0,
      maxTokens: this.maxContextTokens,
    };

    // Load primary files first (highest priority)
    for (const filePath of primaryFiles) {
      const fileContext = await this.loadFile(filePath);
      if (fileContext) {
        context.files.push(fileContext);
        context.totalTokens += this.estimateTokens(fileContext.content);
      }
    }

    // Auto-discover related files
    const relatedFiles = await this.findRelatedFiles(primaryFiles);
    
    for (const filePath of relatedFiles) {
      if (context.totalTokens >= this.maxContextTokens * 0.8) {
        break; // Stop at 80% capacity
      }
      
      if (!this.loadedFiles.has(filePath)) {
        const fileContext = await this.loadFile(filePath);
        if (fileContext) {
          context.files.push(fileContext);
          context.totalTokens += this.estimateTokens(fileContext.content);
        }
      }
    }

    return context;
  }

  /**
   * Load a single file with metadata
   */
  async loadFile(filePath: string): Promise<FileContext | null> {
    const fullPath = path.resolve(this.workingDir, filePath);
    
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const stats = await fs.stat(fullPath);
      
      // Skip binary files or very large files
      if (stats.size > 1024 * 1024) { // 1MB limit
        return null;
      }

      const fileContext: FileContext = {
        path: filePath,
        content,
        lines: content.split('\n').length,
        size: stats.size,
        language: this.detectLanguage(filePath),
      };

      this.loadedFiles.set(filePath, fileContext);
      return fileContext;
      
    } catch (error) {
      return null;
    }
  }

  /**
   * Find files related to the given files (imports, configs, tests)
   */
  private async findRelatedFiles(files: string[]): Promise<string[]> {
    const related: Set<string> = new Set();

    for (const file of files) {
      const fileContext = this.loadedFiles.get(file);
      if (!fileContext) continue;

      // Find imports/requires
      const imports = this.extractImports(fileContext.content);
      for (const imp of imports) {
        const resolved = await this.resolveImport(imp, file);
        if (resolved) related.add(resolved);
      }

      // Find test files
      const testFile = this.findTestFile(file);
      if (testFile) {
        const exists = await this.fileExists(testFile);
        if (exists) related.add(testFile);
      }

      // Find config files in same directory
      const dir = path.dirname(file);
      const configs = await this.findConfigFiles(dir);
      configs.forEach(c => related.add(c));
    }

    return Array.from(related);
  }

  /**
   * Extract import statements from code
   */
  private extractImports(content: string): string[] {
    const imports: string[] = [];
    
    // ES6 imports
    const es6Regex = /import\s+.*?\s+from\s+['"](.+?)['"]/g;
    let match;
    while ((match = es6Regex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // CommonJS requires
    const cjsRegex = /require\s*\(\s*['"](.+?)['"]\s*\)/g;
    while ((match = cjsRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  /**
   * Resolve import path to actual file
   */
  private async resolveImport(importPath: string, fromFile: string): Promise<string | null> {
    // Skip node_modules
    if (!importPath.startsWith('.')) return null;

    const dir = path.dirname(fromFile);
    const extensions = ['.ts', '.tsx', '.js', '.jsx', ''];
    
    for (const ext of extensions) {
      const resolved = path.join(dir, importPath + ext);
      if (await this.fileExists(resolved)) {
        return resolved;
      }
    }

    return null;
  }

  /**
   * Find test file for a given source file
   */
  private findTestFile(filePath: string): string | null {
    const parsed = path.parse(filePath);
    const testPatterns = [
      `${parsed.name}.test${parsed.ext}`,
      `${parsed.name}.spec${parsed.ext}`,
      path.join('__tests__', `${parsed.name}${parsed.ext}`),
    ];

    for (const pattern of testPatterns) {
      const testPath = path.join(parsed.dir, pattern);
      return testPath;
    }

    return null;
  }

  /**
   * Find config files in directory
   */
  private async findConfigFiles(dir: string): Promise<string[]> {
    const configPatterns = [
      'package.json',
      'tsconfig.json',
      '.eslintrc*',
      '.prettierrc*',
    ];

    const configs: string[] = [];
    for (const pattern of configPatterns) {
      const configPath = path.join(dir, pattern);
      if (await this.fileExists(configPath)) {
        configs.push(configPath);
      }
    }

    return configs;
  }

  /**
   * Search for files matching pattern
   */
  async searchFiles(pattern: string, options?: { maxResults?: number }): Promise<string[]> {
    const maxResults = options?.maxResults || 100;
    
    try {
      const files = await fg(pattern, {
        cwd: this.workingDir,
        ignore: this.excludePatterns,
        absolute: false,
        onlyFiles: true,
      });

      return files.slice(0, maxResults);
    } catch (error) {
      return [];
    }
  }

  /**
   * Get file chunk for large files (prevents token overflow)
   */
  async getFileChunk(filePath: string, startLine: number, endLine: number): Promise<string> {
    const fullPath = path.resolve(this.workingDir, filePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const lines = content.split('\n');
    
    const chunk = lines.slice(startLine - 1, endLine).join('\n');
    return chunk;
  }

  /**
   * Detect programming language from file extension
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.go': 'go',
      '.rs': 'rust',
      '.rb': 'ruby',
      '.php': 'php',
      '.swift': 'swift',
      '.kt': 'kotlin',
    };

    return langMap[ext] || 'plaintext';
  }

  /**
   * Estimate token count (rough approximation: 1 token ≈ 4 chars)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    const fullPath = path.resolve(this.workingDir, filePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear loaded files cache
   */
  clearCache() {
    this.loadedFiles.clear();
  }

  /**
   * Get loaded files summary
   */
  getSummary(): { fileCount: number; totalSize: number; files: string[] } {
    let totalSize = 0;
    const files: string[] = [];

    for (const [path, context] of this.loadedFiles) {
      files.push(path);
      totalSize += context.size;
    }

    return { fileCount: files.length, totalSize, files };
  }
}
