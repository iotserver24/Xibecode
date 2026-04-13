import * as fs from 'fs/promises';
import * as path from 'path';
import { MCPServerConfig, MCPServersConfig, MCPServerConfigLegacy } from '../../utils/config.js';

export type McpServersJson =
  | { mcpServers: Record<string, MCPServerConfig> }
  | { servers: MCPServerConfigLegacy[] };

export function normalizeMcpServersConfig(raw: unknown, sourceLabel: string): MCPServersConfig {
  const data = raw as any;

  // New object-based format
  if (data && typeof data === 'object' && data.mcpServers && typeof data.mcpServers === 'object' && !Array.isArray(data.mcpServers)) {
    const validated: MCPServersConfig = {};
    for (const [serverName, serverConfig] of Object.entries(data.mcpServers)) {
      const cfg = serverConfig as any;
      if (!cfg?.command || typeof cfg.command !== 'string') {
        throw new Error(`[${sourceLabel}] Invalid MCP server "${serverName}": missing required field "command"`);
      }
      validated[serverName] = {
        command: cfg.command,
        args: Array.isArray(cfg.args) ? cfg.args.map(String) : undefined,
        env: cfg.env && typeof cfg.env === 'object' ? (cfg.env as Record<string, string>) : undefined,
      };
    }
    return validated;
  }

  // Legacy array-based format
  if (data && typeof data === 'object' && Array.isArray(data.servers)) {
    const migrated: MCPServersConfig = {};
    for (const server of data.servers as MCPServerConfigLegacy[]) {
      if (!server?.name || !server?.command) {
        throw new Error(`[${sourceLabel}] Invalid legacy MCP server entry: missing required fields (name, command)`);
      }
      if (server.transport && server.transport !== 'stdio') {
        throw new Error(`[${sourceLabel}] Invalid legacy MCP server "${server.name}": unsupported transport "${server.transport}"`);
      }
      migrated[server.name] = {
        command: server.command,
        args: server.args,
        env: server.env,
      };
    }
    return migrated;
  }

  throw new Error(`[${sourceLabel}] Invalid MCP config: expected {mcpServers:{...}} or legacy {servers:[...]}`);
}

export async function readMcpServersFromFile(filePath: string, sourceLabel?: string): Promise<MCPServersConfig> {
  const label = sourceLabel || filePath;
  const content = await fs.readFile(filePath, 'utf-8');
  const json = JSON.parse(content);
  return normalizeMcpServersConfig(json, label);
}

export async function findProjectMcpConfigFiles(startDir: string): Promise<string[]> {
  // Walk up to filesystem root collecting .mcp.json; return in root -> leaf order.
  const files: string[] = [];
  let current = path.resolve(startDir);

  while (true) {
    files.push(path.join(current, '.mcp.json'));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const existing: string[] = [];
  for (const fp of files.reverse()) {
    try {
      await fs.access(fp);
      existing.push(fp);
    } catch {
      // ignore
    }
  }
  return existing;
}

