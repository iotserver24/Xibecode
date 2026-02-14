export default function MCPPage() {
  return (
    <div>
      <h1>MCP Integration</h1>
      <p>
        XibeCode supports the{' '}
        <a href="https://modelcontextprotocol.io/" target="_blank" rel="noopener noreferrer">
          Model Context Protocol (MCP)
        </a>
        , an open protocol that standardizes how applications provide context to LLMs.
        Connect to external servers for databases, APIs, file systems, and more.
      </p>

      <h2>What is MCP?</h2>
      <p>
        MCP (Model Context Protocol) is an open standard that allows AI applications to
        connect to external data sources and tools in a standardized way. It enables:
      </p>
      <ul>
        <li><strong>Extended Tools</strong> — Add tools from external servers (databases, APIs, etc.)</li>
        <li><strong>Access Resources</strong> — Read data from external sources</li>
        <li><strong>Prompt Templates</strong> — Use pre-built prompts from servers</li>
        <li><strong>Context Sharing</strong> — Share context between different AI tools</li>
      </ul>

      <h2>Quick Start</h2>
      <pre><code>{`# Initialize MCP configuration
xibecode mcp init

# Add a server
xibecode mcp add

# List configured servers
xibecode mcp list

# Reload after editing
xibecode mcp reload`}</code></pre>

      <h2>Adding MCP Servers</h2>

      <h3>File-Based Configuration (Recommended)</h3>
      <p>Edit the MCP servers configuration file directly:</p>
      <pre><code>{`# Show the config file path
xibecode mcp file

# Open in your default editor
xibecode mcp edit

# Or edit manually
nano ~/.xibecode/mcp-servers.json`}</code></pre>

      <h3>Configuration Format</h3>
      <p>The file uses a simple object-based format:</p>
      <pre><code>{`{
  "mcpServers": {
    "filesystem": {
      "command": "mcp-server-filesystem",
      "args": ["--root", "/path/to/files"]
    },
    "github": {
      "command": "mcp-server-github",
      "env": {
        "GITHUB_TOKEN": "your_token_here"
      }
    },
    "postgres": {
      "command": "mcp-server-postgres",
      "env": {
        "DATABASE_URL": "postgresql://user:pass@localhost/db"
      }
    }
  }
}`}</code></pre>

      <h2>MCP Commands</h2>
      <pre><code>{`# Initialize default config file with examples
xibecode mcp init

# Open file to add/edit servers
xibecode mcp add
xibecode mcp edit

# List all configured servers
xibecode mcp list

# Remove a server
xibecode mcp remove <server-name>

# Reload servers after editing
xibecode mcp reload

# Show file path and status
xibecode mcp file

# Check connection status
xibecode mcp status`}</code></pre>

      <h2>Using MCP Tools</h2>
      <p>
        Once configured, MCP tools are automatically available to XibeCode. Tools are
        prefixed with the server name for easy identification:
      </p>
      <pre><code>{`# Example tool names from configured servers:
filesystem::read_file
filesystem::write_file
github::create_issue
github::list_repos
postgres::query
slack::send_message`}</code></pre>
      <p>In chat mode, view available MCP tools:</p>
      <pre><code>{`xibecode chat
> /mcp              # Show MCP status and tools
> /mcp list         # List all MCP tools
> /mcp reload       # Reload MCP servers`}</code></pre>

      <h2>Server Configuration Options</h2>
      <table>
        <thead>
          <tr>
            <th>Option</th>
            <th>Description</th>
            <th>Required</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>command</code></td>
            <td>The command to start the MCP server</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td><code>args</code></td>
            <td>Array of command-line arguments</td>
            <td>No</td>
          </tr>
          <tr>
            <td><code>env</code></td>
            <td>Environment variables for the server process</td>
            <td>No</td>
          </tr>
          <tr>
            <td><code>cwd</code></td>
            <td>Working directory for the server</td>
            <td>No</td>
          </tr>
        </tbody>
      </table>

      <h2>Example Configurations</h2>

      <h3>GitHub MCP Server</h3>
      <pre><code>{`# 1. Install the GitHub MCP server
npm install -g @modelcontextprotocol/server-github

# 2. Add to configuration
{
  "mcpServers": {
    "github": {
      "command": "mcp-server-github",
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}

# 3. Reload and use
xibecode mcp reload
xibecode chat
> Create an issue about the login bug in the main repo`}</code></pre>

      <h3>PostgreSQL MCP Server</h3>
      <pre><code>{`# 1. Install
npm install -g @modelcontextprotocol/server-postgres

# 2. Configure
{
  "mcpServers": {
    "postgres": {
      "command": "mcp-server-postgres",
      "env": {
        "DATABASE_URL": "postgresql://user:pass@localhost:5432/mydb"
      }
    }
  }
}

# 3. Use
xibecode chat
> Query the users table for active accounts`}</code></pre>

      <h3>Filesystem MCP Server</h3>
      <pre><code>{`# 1. Install
npm install -g @modelcontextprotocol/server-filesystem

# 2. Configure
{
  "mcpServers": {
    "docs": {
      "command": "mcp-server-filesystem",
      "args": ["--root", "/path/to/documentation"]
    }
  }
}

# 3. Use
xibecode chat
> Search the documentation for authentication guides`}</code></pre>

      <h3>Slack MCP Server</h3>
      <pre><code>{`{
  "mcpServers": {
    "slack": {
      "command": "mcp-server-slack",
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-token",
        "SLACK_TEAM_ID": "T01234567"
      }
    }
  }
}`}</code></pre>

      <h2>Popular MCP Servers</h2>
      <table>
        <thead>
          <tr>
            <th>Server</th>
            <th>Description</th>
            <th>Package</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Filesystem</td>
            <td>File system access and operations</td>
            <td><code>@modelcontextprotocol/server-filesystem</code></td>
          </tr>
          <tr>
            <td>GitHub</td>
            <td>GitHub API integration (issues, PRs, repos)</td>
            <td><code>@modelcontextprotocol/server-github</code></td>
          </tr>
          <tr>
            <td>PostgreSQL</td>
            <td>PostgreSQL database access</td>
            <td><code>@modelcontextprotocol/server-postgres</code></td>
          </tr>
          <tr>
            <td>Slack</td>
            <td>Slack messaging integration</td>
            <td><code>@modelcontextprotocol/server-slack</code></td>
          </tr>
          <tr>
            <td>Google Drive</td>
            <td>Google Drive file access</td>
            <td><code>@modelcontextprotocol/server-gdrive</code></td>
          </tr>
          <tr>
            <td>SQLite</td>
            <td>SQLite database access</td>
            <td><code>@modelcontextprotocol/server-sqlite</code></td>
          </tr>
          <tr>
            <td>Puppeteer</td>
            <td>Browser automation</td>
            <td><code>@modelcontextprotocol/server-puppeteer</code></td>
          </tr>
        </tbody>
      </table>
      <p>
        You can also build custom MCP servers using the{' '}
        <a href="https://github.com/modelcontextprotocol/sdk" target="_blank" rel="noopener noreferrer">
          MCP SDK
        </a>.
      </p>

      <h2>Transport Types</h2>
      <p>
        XibeCode supports <strong>stdio transport</strong> — MCP servers that run
        as local subprocesses. This is the most common transport for development tools.
      </p>
      <p>
        The server communicates with XibeCode via standard input/output streams using
        JSON-RPC messages.
      </p>

      <h2>Debugging MCP Connections</h2>
      <pre><code>{`# Check server status
xibecode mcp status

# View server logs (verbose mode)
xibecode chat --verbose
> /mcp

# Test a specific tool
xibecode chat
> Use the github::list_repos tool to list my repositories`}</code></pre>

      <h2>Security Considerations</h2>
      <ul>
        <li>Store sensitive tokens in environment variables, not in config files</li>
        <li>Use read-only database credentials when possible</li>
        <li>Limit filesystem access to specific directories</li>
        <li>Review MCP server permissions before installation</li>
      </ul>

      <h2>Building Custom MCP Servers</h2>
      <p>
        You can create custom MCP servers for your specific needs using the MCP SDK:
      </p>
      <pre><code>{`// custom-server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server({
  name: "my-custom-server",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {}
  }
});

// Register your custom tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [{
      name: "my_custom_tool",
      description: "Does something custom",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string" }
        }
      }
    }]
  };
});

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);`}</code></pre>

      <h2>Next Steps</h2>
      <ul>
        <li><a href="/docs/plugins">Create custom plugins</a> for simpler tool extensions</li>
        <li><a href="/docs/examples">See example workflows</a></li>
        <li><a href="/docs/configuration">Configure XibeCode</a></li>
      </ul>
    </div>
  );
}
