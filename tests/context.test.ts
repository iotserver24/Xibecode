import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextManager } from '../src/core/context.js';
import * as fs from 'fs/promises';
import * as path from 'path';

vi.mock('fs/promises');
vi.mock('path');

describe('ContextManager', () => {
  let contextManager: ContextManager;

  beforeEach(() => {
    contextManager = new ContextManager('/test/working/dir');
  });

  describe('constructor', () => {
    it('should initialize with default parameters', () => {
      expect(contextManager).toBeDefined();
    });

    it('should accept custom max tokens', () => {
      const manager = new ContextManager('/test', 50000);
      expect(manager).toBeDefined();
    });
  });

  describe('loadFile', () => {
    it('should load file successfully', async () => {
      const mockContent = 'const test = true;\nconsole.log(test);';
      vi.mocked(fs.readFile).mockResolvedValue(mockContent);
      vi.mocked(fs.stat).mockResolvedValue({ size: 100, mtime: new Date() } as any);

      const result = await contextManager.loadFile('test.js');

      expect(result).toEqual({
        path: 'test.js',
        content: mockContent,
        lines: 2,
        size: 100,
        language: 'javascript',
      });
      expect(fs.readFile).toHaveBeenCalledWith('/test/working/dir/test.js', 'utf-8');
    });

    it('should return null for non-existent files', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

      const result = await contextManager.loadFile('nonexistent.js');

      expect(result).toBeNull();
    });

    it('should skip files larger than 1MB', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('content');
      vi.mocked(fs.stat).mockResolvedValue({ size: 2 * 1024 * 1024, mtime: new Date() } as any);

      const result = await contextManager.loadFile('large.js');

      expect(result).toBeNull();
    });
  });

  describe('extractImports', () => {
    it('should extract ES6 imports', () => {
      const content = `import { User } from './models/User'
import fs from 'fs'`;

      // This will test the private method through a workaround
      const manager = new ContextManager('/test');
      const imports = (manager as any).extractImports(content);

      expect(imports).toContain('./models/User');
      expect(imports).toContain('fs');
    });

    it('should extract CommonJS requires', () => {
      const content = `const express = require('express');
const fs = require('fs');`;

      const manager = new ContextManager('/test');
      const imports = (manager as any).extractImports(content);

      expect(imports).toContain('express');
      expect(imports).toContain('fs');
    });

    it('should handle mixed import styles', () => {
      const content = `import fs from 'fs'
const express = require('express');`;

      const manager = new ContextManager('/test');
      const imports = (manager as any).extractImports(content);

      expect(imports).toContain('fs');
      expect(imports).toContain('express');
    });
  });

  describe('detectLanguage', () => {
    it('should detect TypeScript files', () => {
      const manager = new ContextManager('/test');
      const lang = (manager as any).detectLanguage('test.ts');
      expect(lang).toBe('typescript');
    });

    it('should detect JavaScript files', () => {
      const manager = new ContextManager('/test');
      const lang = (manager as any).detectLanguage('test.js');
      expect(lang).toBe('javascript');
    });

    it('should detect Python files', () => {
      const manager = new ContextManager('/test');
      const lang = (manager as any).detectLanguage('test.py');
      expect(lang).toBe('python');
    });

    it('should return plaintext for unknown extensions', () => {
      const manager = new ContextManager('/test');
      const lang = (manager as any).detectLanguage('test.unknown');
      expect(lang).toBe('plaintext');
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens correctly', () => {
      const manager = new ContextManager('/test');
      const tokens = (manager as any).estimateTokens('Hello world'); // 11 chars
      expect(tokens).toBe(3); // ceil(11/4)
    });

    it('should handle empty strings', () => {
      const manager = new ContextManager('/test');
      const tokens = (manager as any).estimateTokens('');
      expect(tokens).toBe(0);
    });
  });

  describe('buildContext', () => {
    it('should build context with primary files', async () => {
      const mockFile = {
        path: 'test.js',
        content: 'const test = true;',
        lines: 1,
        size: 17,
        language: 'javascript',
      };

      vi.mocked(fs.readFile).mockResolvedValue(mockFile.content);
      vi.mocked(fs.stat).mockResolvedValue({ size: 17, mtime: new Date() } as any);
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const context = await contextManager.buildContext(['test.js']);

      expect(context.files).toHaveLength(1);
      expect(context.files[0].path).toBe('test.js');
      expect(context.totalTokens).toBe(5); // ceil(17/4)
    });

    it('should respect max token limit', async () => {
      // Mock many files to test token limiting
      vi.mocked(fs.readFile).mockResolvedValue('x'.repeat(1000)); // 1000 chars = 250 tokens
      vi.mocked(fs.stat).mockResolvedValue({ size: 1000, mtime: new Date() } as any);
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const manager = new ContextManager('/test', 1000); // 1000 token limit
      const context = await manager.buildContext(['test1.js', 'test2.js', 'test3.js']);

      // Should stop at 80% capacity (800 tokens)
      expect(context.totalTokens).toBeLessThanOrEqual(800);
    });
  });
});