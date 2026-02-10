import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { MCPServerConfig, MCPServersConfig, MCPServerConfigLegacy } from './config.js';

export interface MCPServersFile {
  mcpServers: MCPServersConfig;
}

// Legacy file format for backward compatibility
export interface MCPServersFileLegacy {
  servers: MCPServerConfigLegacy[];
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
   * Supports both new object-based format and legacy array-based format
   * Automatically migrates legacy format to new format
   */
  async loadMCPServers(): Promise<MCPServersConfig> {
    try {
      if (!(await this.fileExists())) {
        return {};
      }

      const content = await fs.readFile(this.filePath, 'utf-8');
      const data: any = JSON.parse(content);

      // Check if it's the new object-based format
      if (data.mcpServers && typeof data.mcpServers === 'object' && !Array.isArray(data.mcpServers)) {
        // New format - validate and return
        const validatedServers: MCPServersConfig = {};

        for (const [serverName, serverConfig] of Object.entries(data.mcpServers)) {
          const config = serverConfig as any;
          if (!config.command) {
            throw new Error(`Invalid server config for "${serverName}": missing required field "command"`);
          }
          validatedServers[serverName] = {
            command: config.command,
            args: config.args,
            env: config.env,
          };
        }

        return validatedServers;
      }

      // Check if it's the legacy array-based format
      if (data.servers && Array.isArray(data.servers)) {
        // Legacy format - migrate to new format
        const legacyData = data as MCPServersFileLegacy;
        const migratedServers: MCPServersConfig = {};

        for (const server of legacyData.servers) {
          if (!server.name || !server.command) {
            throw new Error(`Invalid server config in legacy format: missing required fields (name, command)`);
          }
          // Remove transport field and use name as key
          migratedServers[server.name] = {
            command: server.command,
            args: server.args,
            env: server.env,
          };
        }

        // Auto-migrate: save in new format
        console.log('Migrating MCP servers configuration to new format...');
        await this.saveMCPServers(migratedServers);

        return migratedServers;
      }

      throw new Error('Invalid file format: must contain "mcpServers" object or legacy "servers" array');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return {};
      }
      throw new Error(`Failed to load MCP servers file: ${error.message}`);
    }
  }

  /**
   * Save MCP servers to file
   * Uses new object-based format
   */
  async saveMCPServers(servers: MCPServersConfig): Promise<void> {
    try {
      const configDir = path.dirname(this.filePath);

      // Ensure directory exists
      await fs.mkdir(configDir, { recursive: true });

      const data: MCPServersFile = {
        mcpServers: servers,
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
    const defaultServers: MCPServersConfig = {
      'filesystem': {
        command: 'mcp-server-filesystem',
        args: ['--root', '/path/to/files'],
      },
      'github': {
        command: 'mcp-server-github',
        args: ['--token', 'YOUR_GITHUB_TOKEN'],
      },
    };

    await this.saveMCPServers(defaultServers);
  }

  /**
   * Validate the file format
   * Supports both new object-based and legacy array-based formats
   */
  async validateFile(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      if (!(await this.fileExists())) {
        return { valid: false, errors: ['File does not exist'] };
      }

      const content = await fs.readFile(this.filePath, 'utf-8');
      let data: any;

      try {
        data = JSON.parse(content);
      } catch (error: any) {
        errors.push(`Invalid JSON: ${error.message}`);
        return { valid: false, errors };
      }

      // Check for new object-based format
      if (data.mcpServers) {
        if (typeof data.mcpServers !== 'object' || Array.isArray(data.mcpServers)) {
          errors.push('"mcpServers" must be an object (not an array)');
        } else {
          // Validate each server
          for (const [serverName, serverConfig] of Object.entries(data.mcpServers)) {
            const config = serverConfig as any;
            if (!config || typeof config !== 'object') {
              errors.push(`Server "${serverName}": configuration must be an object`);
              continue;
            }
            if (!config.command) {
              errors.push(`Server "${serverName}": missing "command" field`);
            }
            if (config.args && !Array.isArray(config.args)) {
              errors.push(`Server "${serverName}": "args" must be an array`);
            }
            if (config.env && typeof config.env !== 'object') {
              errors.push(`Server "${serverName}": "env" must be an object`);
            }
          }
        }
      }
      // Check for legacy array-based format
      else if (data.servers) {
        if (!Array.isArray(data.servers)) {
          errors.push('Legacy format: "servers" must be an array');
        } else {
          // Validate legacy format
          data.servers.forEach((server: any, index: number) => {
            if (!server.name) {
              errors.push(`Server ${index + 1}: missing "name"`);
            }
            if (!server.command) {
              errors.push(`Server ${index + 1}: missing "command"`);
            }
            if (server.transport && server.transport !== 'stdio') {
              errors.push(`Server ${index + 1}: invalid transport "${server.transport}" (only "stdio" supported)`);
            }
          });

          // Check for duplicate names
          const names = data.servers.map((s: any) => s.name).filter(Boolean);
          const duplicates = names.filter((name: string, index: number) => names.indexOf(name) !== index);
          if (duplicates.length > 0) {
            errors.push(`Duplicate server names: ${[...new Set(duplicates)].join(', ')}`);
          }

          // Suggest migration
          if (errors.length === 0) {
            errors.push('Note: Using legacy array-based format. Will auto-migrate to new object-based format on load.');
          }
        }
      } else {
        errors.push('Missing "mcpServers" field (or legacy "servers" field)');
      }

      return {
        valid: errors.length === 0 || (errors.length === 1 && errors[0].startsWith('Note:')),
        errors,
      };
    } catch (error: any) {
      errors.push(`Failed to read file: ${error.message}`);
      return { valid: false, errors };
    }
  }
}
