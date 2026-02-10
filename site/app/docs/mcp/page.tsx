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
      <p>MCP lets you extend XibeCode with capabilities from external servers:</p>
      <ul>
        <li><strong>Extended Tools</strong> — Add tools from external servers (databases, APIs, etc.)</li>
        <li><strong>Access Resources</strong> — Read data from external sources</li>
        <li><strong>Prompt Templates</strong> — Use pre-built prompts from servers</li>
      </ul>

      <h2>Adding MCP Servers</h2>

      <h3>File-Based Configuration (Recommended)</h3>
      <p>Edit the MCP servers configuration file directly:</p>
      <pre><code>{`# Show the config file path
xibecode mcp file

# Open in your editor
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
      "args": ["--token", "YOUR_TOKEN"],
      "env": {
        "GITHUB_TOKEN": "your_token_here"
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
xibecode mcp file`}</code></pre>

      <h2>Using MCP Tools</h2>
      <p>
        Once configured, MCP tools are automatically available to XibeCode. Tools are
        prefixed with the server name:
      </p>
      <pre><code>{`# Example tool names:
filesystem::read_file
github::create_issue
database::query`}</code></pre>
      <p>In chat mode, view available MCP tools:</p>
      <pre><code>{`xibecode chat
> /mcp`}</code></pre>

      <h2>Example: GitHub MCP Server</h2>
      <pre><code>{`# 1. Install the GitHub MCP server
npm install -g @modelcontextprotocol/server-github

# 2. Add to configuration
xibecode mcp edit
# Add:
# {
#   "mcpServers": {
#     "github": {
#       "command": "mcp-server-github",
#       "args": ["--token", "YOUR_GITHUB_TOKEN"]
#     }
#   }
# }

# 3. Reload
xibecode mcp reload

# 4. Use it
xibecode chat
> Create an issue about the bug we found`}</code></pre>

      <h2>Popular MCP Servers</h2>
      <table>
        <thead>
          <tr>
            <th>Server</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>@modelcontextprotocol/server-filesystem</code></td>
            <td>File system access</td>
          </tr>
          <tr>
            <td><code>@modelcontextprotocol/server-github</code></td>
            <td>GitHub API integration</td>
          </tr>
          <tr>
            <td><code>@modelcontextprotocol/server-postgres</code></td>
            <td>PostgreSQL database access</td>
          </tr>
          <tr>
            <td><code>@modelcontextprotocol/server-slack</code></td>
            <td>Slack integration</td>
          </tr>
        </tbody>
      </table>
      <p>You can also build custom MCP servers using the <a href="https://github.com/modelcontextprotocol/sdk" target="_blank" rel="noopener noreferrer">MCP SDK</a>.</p>

      <h2>Transport Types</h2>
      <p>
        Currently, XibeCode supports <strong>stdio transport</strong> — MCP servers that run
        as local subprocesses. This is the most common transport for development tools.
      </p>

      <h2>Next Steps</h2>
      <ul>
        <li><a href="/docs/plugins">Create custom plugins</a></li>
        <li><a href="/docs/examples">See example workflows</a></li>
      </ul>
    </div>
  );
}
