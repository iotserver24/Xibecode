import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPServersFileManager } from '../src/utils/mcp-servers-file.js';
import * as fs from 'fs/promises';
import * as os from 'os';

vi.mock('fs/promises');
vi.mock('os', () => ({
  homedir: () => '/home/user',
}));

describe('MCPServersFileManager', () => {
  let fileManager: MCPServersFileManager;

  beforeEach(() => {
    vi.clearAllMocks();
    fileManager = new MCPServersFileManager();
  });

  describe('loadMCPServers', () => {
    it('should load servers from new object-based format', async () => {
      const mockFileContent = JSON.stringify({
        mcpServers: {
          'filesystem': {
            command: 'mcp-server-filesystem',
            args: ['--root', '/path/to/files'],
          },
          'github': {
            command: 'mcp-server-github',
            args: ['--token', 'TOKEN'],
            env: { GITHUB_TOKEN: 'token' },
          },
        },
      });

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(mockFileContent);

      const servers = await fileManager.loadMCPServers();

      expect(servers).toEqual({
        'filesystem': {
          command: 'mcp-server-filesystem',
          args: ['--root', '/path/to/files'],
        },
        'github': {
          command: 'mcp-server-github',
          args: ['--token', 'TOKEN'],
          env: { GITHUB_TOKEN: 'token' },
        },
      });
    });

    it('should migrate from legacy array-based format', async () => {
      const mockLegacyContent = JSON.stringify({
        servers: [
          {
            name: 'filesystem',
            transport: 'stdio',
            command: 'mcp-server-filesystem',
            args: ['--root', '/path/to/files'],
          },
          {
            name: 'github',
            transport: 'stdio',
            command: 'mcp-server-github',
            args: ['--token', 'TOKEN'],
          },
        ],
      });

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(mockLegacyContent);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const servers = await fileManager.loadMCPServers();

      expect(servers).toEqual({
        'filesystem': {
          command: 'mcp-server-filesystem',
          args: ['--root', '/path/to/files'],
        },
        'github': {
          command: 'mcp-server-github',
          args: ['--token', 'TOKEN'],
        },
      });

      // Verify that the file was saved in new format
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should return empty object when file does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const servers = await fileManager.loadMCPServers();

      expect(servers).toEqual({});
    });

    it('should throw error for invalid JSON', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue('invalid json');

      await expect(fileManager.loadMCPServers()).rejects.toThrow();
    });
  });

  describe('saveMCPServers', () => {
    it('should save servers in new object-based format', async () => {
      const servers = {
        'filesystem': {
          command: 'mcp-server-filesystem',
          args: ['--root', '/path/to/files'],
        },
        'github': {
          command: 'mcp-server-github',
          args: ['--token', 'TOKEN'],
        },
      };

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await fileManager.saveMCPServers(servers);

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"mcpServers"'),
        'utf-8'
      );

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const writtenContent = JSON.parse(writeCall[1] as string);

      expect(writtenContent).toHaveProperty('mcpServers');
      expect(writtenContent.mcpServers).toEqual(servers);
    });
  });

  describe('validateFile', () => {
    it('should validate new object-based format', async () => {
      const mockFileContent = JSON.stringify({
        mcpServers: {
          'filesystem': {
            command: 'mcp-server-filesystem',
            args: ['--root', '/path/to/files'],
          },
        },
      });

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(mockFileContent);

      const result = await fileManager.validateFile();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept legacy array-based format with note', async () => {
      const mockLegacyContent = JSON.stringify({
        servers: [
          {
            name: 'filesystem',
            transport: 'stdio',
            command: 'mcp-server-filesystem',
          },
        ],
      });

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(mockLegacyContent);

      const result = await fileManager.validateFile();

      expect(result.valid).toBe(true);
      expect(result.errors.some(e => e.startsWith('Note:'))).toBe(true);
    });

    it('should report error for missing command field', async () => {
      const mockFileContent = JSON.stringify({
        mcpServers: {
          'filesystem': {
            args: ['--root', '/path/to/files'],
          },
        },
      });

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(mockFileContent);

      const result = await fileManager.validateFile();

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('missing "command"'))).toBe(true);
    });
  });
});
