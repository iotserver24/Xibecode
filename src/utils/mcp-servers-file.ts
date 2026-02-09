import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { MCPServerConfig } from './config.js';

export interface MCPServersFile {
  servers: MCPServerConfig[];
}

/**
 * Manages MCP servers configuration file
 */
export class MCPServersFileManager {
  private filePath: string;

  constructor() {
    const configDir = path.join(os.homedir(), '.xibecode');
    this.filePath = path.join(configDir, 'mcp-servers.json');
  }

  /**
   * Get the path to the MCP servers config file
   */
  getFilePath(): string {
    return this.filePath;
  }

  /**
   * Check if the file exists
   */
  async fileExists(): Promise<boolean> {
    try {
      await fs.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load MCP servers from file
   */
  async loadMCPServers(): Promise<MCPServerConfig[]> {
    try {
      if (!(await this.fileExists())) {
        return [];
      }

      const content = await fs.readFile(this.filePath, 'utf-8');
      const data: MCPServersFile = JSON.parse(content);

      // Validate structure
      if (!data.servers || !Array.isArray(data.servers)) {
        throw new Error('Invalid file format: "servers" must be an array');
      }

      // Validate each server
      const validatedServers: MCPServerConfig[] = [];
      for (const server of data.servers) {
        if (!server.name || !server.transport || !server.command) {
          throw new Error(`Invalid server config: missing required fields (name, transport, command)`);
        }
        if (server.transport !== 'stdio') {
          throw new Error(`Invalid transport type: only "stdio" is supported`);
        }
        validatedServers.push(server);
      }

      return validatedServers;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw new Error(`Failed to load MCP servers file: ${error.message}`);
    }
  }

  /**
   * Save MCP servers to file
   */
  async saveMCPServers(servers: MCPServerConfig[]): Promise<void> {
    try {
      const configDir = path.dirname(this.filePath);
      
      // Ensure directory exists
      await fs.mkdir(configDir, { recursive: true });

      const data: MCPServersFile = {
        servers,
      };

      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    } catch (error: any) {
      throw new Error(`Failed to save MCP servers file: ${error.message}`);
    }
  }

  /**
   * Create default config file with examples
   */
  async createDefaultFile(): Promise<void> {
    const defaultServers: MCPServerConfig[] = [
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
        args: ['--token', 'YOUR_GITHUB_TOKEN'],
      },
    ];

    await this.saveMCPServers(defaultServers);
  }

  /**
   * Validate the file format
   */
  async validateFile(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      if (!(await this.fileExists())) {
        return { valid: false, errors: ['File does not exist'] };
      }

      const content = await fs.readFile(this.filePath, 'utf-8');
      let data: MCPServersFile;

      try {
        data = JSON.parse(content);
      } catch (error: any) {
        errors.push(`Invalid JSON: ${error.message}`);
        return { valid: false, errors };
      }

      if (!data.servers) {
        errors.push('Missing "servers" field');
      } else if (!Array.isArray(data.servers)) {
        errors.push('"servers" must be an array');
      } else {
        // Validate each server
        data.servers.forEach((server, index) => {
          if (!server.name) {
            errors.push(`Server ${index + 1}: missing "name"`);
          }
          if (!server.transport) {
            errors.push(`Server ${index + 1}: missing "transport"`);
          } else if (server.transport !== 'stdio') {
            errors.push(`Server ${index + 1}: invalid transport "${server.transport}" (only "stdio" supported)`);
          }
          if (!server.command) {
            errors.push(`Server ${index + 1}: missing "command"`);
          }
        });

        // Check for duplicate names
        const names = data.servers.map(s => s.name).filter(Boolean);
        const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
        if (duplicates.length > 0) {
          errors.push(`Duplicate server names: ${[...new Set(duplicates)].join(', ')}`);
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error: any) {
      errors.push(`Failed to read file: ${error.message}`);
      return { valid: false, errors };
    }
  }
}
