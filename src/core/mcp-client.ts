import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  Tool,
  Resource,
  Prompt,
  CallToolResult,
  ReadResourceResult,
  GetPromptResult,
} from '@modelcontextprotocol/sdk/types.js';

export interface MCPServerConfig {
  name: string;
  transport: 'stdio'; // Only stdio is currently supported
  command: string; // Command to execute
  args?: string[]; // Command arguments
  env?: Record<string, string>; // Environment variables
}

export interface MCPTool extends Tool {
  serverName: string;
}

export interface MCPResource extends Resource {
  serverName: string;
}

export interface MCPPrompt extends Prompt {
  serverName: string;
}

/**
 * Manages connections to MCP servers and provides unified access to their capabilities
 */
export class MCPClientManager {
  private clients: Map<string, Client> = new Map();
  private serverConfigs: Map<string, MCPServerConfig> = new Map();
  private tools: Map<string, MCPTool> = new Map();
  private resources: Map<string, MCPResource> = new Map();
  private prompts: Map<string, MCPPrompt> = new Map();

  /**
   * Connect to an MCP server
   */
  async connect(serverConfig: MCPServerConfig): Promise<void> {
    if (this.clients.has(serverConfig.name)) {
      throw new Error(`Already connected to MCP server: ${serverConfig.name}`);
    }

    try {
      const client = new Client({
        name: 'xibecode',
        version: '1.0.0',
      }, {
        capabilities: {},
      });

      if (serverConfig.transport !== 'stdio') {
        throw new Error(`Currently only 'stdio' transport is supported. Server: ${serverConfig.name}`);
      }

      if (!serverConfig.command) {
        throw new Error(`stdio transport requires 'command' for server ${serverConfig.name}`);
      }

      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args || [],
        env: serverConfig.env,
      });

      await client.connect(transport);

      // Store client and config
      this.clients.set(serverConfig.name, client);
      this.serverConfigs.set(serverConfig.name, serverConfig);

      // Discover and cache capabilities
      await this.discoverCapabilities(serverConfig.name);

    } catch (error) {
      throw new Error(
        `Failed to connect to MCP server ${serverConfig.name}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (!client) {
      return;
    }

    try {
      await client.close();
    } catch (error) {
      // Log but don't throw - we're disconnecting anyway
      console.error(`Error disconnecting from ${serverName}:`, error);
    }

    this.clients.delete(serverName);
    this.serverConfigs.delete(serverName);

    // Remove cached capabilities
    for (const [key, tool] of this.tools.entries()) {
      if (tool.serverName === serverName) {
        this.tools.delete(key);
      }
    }
    for (const [key, resource] of this.resources.entries()) {
      if (resource.serverName === serverName) {
        this.resources.delete(key);
      }
    }
    for (const [key, prompt] of this.prompts.entries()) {
      if (prompt.serverName === serverName) {
        this.prompts.delete(key);
      }
    }
  }

  /**
   * Disconnect from all MCP servers
   */
  async disconnectAll(): Promise<void> {
    const serverNames = Array.from(this.clients.keys());
    await Promise.all(serverNames.map(name => this.disconnect(name)));
  }

  /**
   * Discover and cache capabilities from a connected server
   */
  private async discoverCapabilities(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Not connected to server: ${serverName}`);
    }

    try {
      // Discover tools
      const toolsList = await client.listTools();
      if (toolsList.tools) {
        for (const tool of toolsList.tools) {
          const mcpTool: MCPTool = { ...tool, serverName };
          this.tools.set(`${serverName}::${tool.name}`, mcpTool);
        }
      }

      // Discover resources
      const resourcesList = await client.listResources();
      if (resourcesList.resources) {
        for (const resource of resourcesList.resources) {
          const mcpResource: MCPResource = { ...resource, serverName };
          this.resources.set(`${serverName}::${resource.uri}`, mcpResource);
        }
      }

      // Discover prompts
      const promptsList = await client.listPrompts();
      if (promptsList.prompts) {
        for (const prompt of promptsList.prompts) {
          const mcpPrompt: MCPPrompt = { ...prompt, serverName };
          this.prompts.set(`${serverName}::${prompt.name}`, mcpPrompt);
        }
      }

    } catch (error) {
      throw new Error(
        `Failed to discover capabilities for ${serverName}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get all available tools from all connected MCP servers
   */
  getAvailableTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all available resources from all connected MCP servers
   */
  getAvailableResources(): MCPResource[] {
    return Array.from(this.resources.values());
  }

  /**
   * Get all available prompts from all connected MCP servers
   */
  getAvailablePrompts(): MCPPrompt[] {
    return Array.from(this.prompts.values());
  }

  /**
   * Execute a tool from an MCP server
   */
  async executeMCPTool(toolName: string, args: Record<string, unknown>): Promise<any> {
    // Parse server name from toolName (format: "serverName::actualToolName")
    const parts = toolName.split('::');
    if (parts.length !== 2) {
      throw new Error(`Invalid MCP tool name format: ${toolName}. Expected format: serverName::toolName`);
    }

    const [serverName, actualToolName] = parts;
    const client = this.clients.get(serverName);
    
    if (!client) {
      throw new Error(`Not connected to MCP server: ${serverName}`);
    }

    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    try {
      const result = await client.callTool({
        name: actualToolName,
        arguments: args,
      });

      return result;
    } catch (error) {
      throw new Error(
        `Failed to execute MCP tool ${toolName}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Read a resource from an MCP server
   */
  async readResource(resourceUri: string): Promise<any> {
    // Parse server name from resourceUri (format: "serverName::actualUri")
    const parts = resourceUri.split('::');
    if (parts.length !== 2) {
      throw new Error(`Invalid MCP resource URI format: ${resourceUri}. Expected format: serverName::uri`);
    }

    const [serverName, actualUri] = parts;
    const client = this.clients.get(serverName);
    
    if (!client) {
      throw new Error(`Not connected to MCP server: ${serverName}`);
    }

    const resource = this.resources.get(resourceUri);
    if (!resource) {
      throw new Error(`Resource not found: ${resourceUri}`);
    }

    try {
      const result = await client.readResource({
        uri: actualUri,
      });

      return result;
    } catch (error) {
      throw new Error(
        `Failed to read MCP resource ${resourceUri}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get a prompt from an MCP server
   */
  async getPrompt(promptName: string, args?: Record<string, string>): Promise<any> {
    // Parse server name from promptName (format: "serverName::actualPromptName")
    const parts = promptName.split('::');
    if (parts.length !== 2) {
      throw new Error(`Invalid MCP prompt name format: ${promptName}. Expected format: serverName::promptName`);
    }

    const [serverName, actualPromptName] = parts;
    const client = this.clients.get(serverName);
    
    if (!client) {
      throw new Error(`Not connected to MCP server: ${serverName}`);
    }

    const prompt = this.prompts.get(promptName);
    if (!prompt) {
      throw new Error(`Prompt not found: ${promptName}`);
    }

    try {
      const result = await client.getPrompt({
        name: actualPromptName,
        arguments: args,
      });

      return result;
    } catch (error) {
      throw new Error(
        `Failed to get MCP prompt ${promptName}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get list of connected servers
   */
  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Check if connected to a specific server
   */
  isConnected(serverName: string): boolean {
    return this.clients.has(serverName);
  }

  /**
   * Get server configuration
   */
  getServerConfig(serverName: string): MCPServerConfig | undefined {
    return this.serverConfigs.get(serverName);
  }
}
