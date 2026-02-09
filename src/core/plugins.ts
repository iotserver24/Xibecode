import * as fs from 'fs/promises';
import * as path from 'path';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import type { EnhancedAgent } from './agent.js';

/**
 * Plugin interface that all plugins must implement
 */
export interface XibeCodePlugin {
  /**
   * Plugin name
   */
  name: string;

  /**
   * Plugin version
   */
  version: string;

  /**
   * Optional description
   */
  description?: string;

  /**
   * Register custom tools
   */
  registerTools?(): ToolDefinition[];

  /**
   * Optional lifecycle hooks
   */
  registerHooks?(agent: EnhancedAgent): void;

  /**
   * Initialize the plugin (called when loaded)
   */
  initialize?(): Promise<void> | void;

  /**
   * Cleanup when plugin is unloaded
   */
  cleanup?(): Promise<void> | void;
}

/**
 * Plugin tool definition
 */
export interface ToolDefinition {
  /**
   * Tool schema (Anthropic format)
   */
  schema: Tool;

  /**
   * Tool execution handler
   */
  handler: (input: any) => Promise<any>;
}

/**
 * Plugin loader and manager
 */
export class PluginManager {
  private plugins: Map<string, XibeCodePlugin> = new Map();
  private tools: Map<string, ToolDefinition> = new Map();

  /**
   * Load plugins from a list of paths
   */
  async loadPlugins(pluginPaths: string[]): Promise<void> {
    for (const pluginPath of pluginPaths) {
      try {
        await this.loadPlugin(pluginPath);
      } catch (error: any) {
        console.warn(`Failed to load plugin from ${pluginPath}: ${error.message}`);
      }
    }
  }

  /**
   * Load a single plugin from a path
   */
  async loadPlugin(pluginPath: string): Promise<void> {
    // Try to resolve the plugin path
    let resolvedPath: string;

    // Check if it's an absolute path
    if (path.isAbsolute(pluginPath)) {
      resolvedPath = pluginPath;
    } else {
      // Try relative to cwd
      resolvedPath = path.resolve(process.cwd(), pluginPath);
    }

    // Check if file exists
    try {
      await fs.access(resolvedPath);
    } catch {
      throw new Error(`Plugin file not found: ${resolvedPath}`);
    }

    // Load the plugin module
    const pluginModule = await import(resolvedPath);
    const plugin: XibeCodePlugin = pluginModule.default || pluginModule;

    if (!plugin.name) {
      throw new Error('Plugin must have a name');
    }

    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} is already loaded`);
    }

    // Initialize the plugin
    if (plugin.initialize) {
      await plugin.initialize();
    }

    // Register tools
    if (plugin.registerTools) {
      const tools = plugin.registerTools();
      for (const tool of tools) {
        const toolName = tool.schema.name;
        if (this.tools.has(toolName)) {
          throw new Error(`Tool ${toolName} is already registered`);
        }
        this.tools.set(toolName, tool);
      }
    }

    this.plugins.set(plugin.name, plugin);
  }

  /**
   * Get all registered plugin tools
   */
  getPluginTools(): Tool[] {
    return Array.from(this.tools.values()).map(t => t.schema);
  }

  /**
   * Execute a plugin tool
   */
  async executePluginTool(toolName: string, input: any): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        error: true,
        success: false,
        message: `Plugin tool not found: ${toolName}`,
      };
    }

    try {
      const result = await tool.handler(input);
      return result;
    } catch (error: any) {
      return {
        error: true,
        success: false,
        message: `Plugin tool error: ${error.message}`,
      };
    }
  }

  /**
   * Check if a tool is a plugin tool
   */
  isPluginTool(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  /**
   * Register plugin hooks with the agent
   */
  registerHooks(agent: EnhancedAgent): void {
    for (const plugin of this.plugins.values()) {
      if (plugin.registerHooks) {
        plugin.registerHooks(agent);
      }
    }
  }

  /**
   * Get loaded plugins
   */
  getPlugins(): XibeCodePlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Unload all plugins
   */
  async unloadAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.cleanup) {
        await plugin.cleanup();
      }
    }
    this.plugins.clear();
    this.tools.clear();
  }

  /**
   * Unload a specific plugin
   */
  async unloadPlugin(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }

    // Cleanup
    if (plugin.cleanup) {
      await plugin.cleanup();
    }

    // Remove tools
    if (plugin.registerTools) {
      const tools = plugin.registerTools();
      for (const tool of tools) {
        this.tools.delete(tool.schema.name);
      }
    }

    this.plugins.delete(pluginName);
  }
}

/**
 * Example plugin template
 */
export const examplePlugin: XibeCodePlugin = {
  name: 'example-plugin',
  version: '1.0.0',
  description: 'An example plugin that demonstrates the plugin API',

  initialize() {
    console.log('Example plugin initialized');
  },

  registerTools() {
    return [
      {
        schema: {
          name: 'example_tool',
          description: 'An example custom tool',
          input_schema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'A message to process',
              },
            },
            required: ['message'],
          },
        },
        async handler(input: any) {
          return {
            success: true,
            message: `Processed: ${input.message}`,
          };
        },
      },
    ];
  },

  registerHooks(agent: EnhancedAgent) {
    agent.on('event', (event: any) => {
      if (event.type === 'tool_call' && event.data.name === 'example_tool') {
        console.log('Example plugin hook triggered!');
      }
    });
  },

  cleanup() {
    console.log('Example plugin cleaned up');
  },
};
