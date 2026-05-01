/**
 * MCP server configuration types.
 *
 * @module types/mcp
 */

export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  oauth?: {
    authorizationUrl?: string;
    tokenUrl?: string;
    protectedResourceMetadataUrl?: string;
    authServerMetadataUrl?: string;
    clientId?: string;
    scopes?: string[];
  };
}

export interface MCPServersConfig {
  [serverName: string]: MCPServerConfig;
}

export interface MCPServerConfigLegacy {
  name: string;
  transport: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}
