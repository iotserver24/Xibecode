export default function ConfigurationPage() {
  return (
    <div>
      <h1>Configuration</h1>
      <p>
        XibeCode stores its configuration in <code>~/.xibecode/</code>. You can manage settings
        via the CLI or by editing the config file directly.
      </p>

      <h2>Interactive Setup</h2>
      <pre><code>xibecode config</code></pre>
      <p>This opens an interactive menu to configure all settings.</p>

      <h2>Quick Commands</h2>
      <pre><code>{`# Set API key
xibecode config --set-key YOUR_ANTHROPIC_API_KEY

# Set custom API endpoint
xibecode config --set-url https://your-custom-endpoint.com

# Set default model
xibecode config --set-model claude-sonnet-4-5-20250929

# View current config
xibecode config --show

# Reset all settings
xibecode config --reset`}</code></pre>

      <h2>Configuration Options</h2>
      <table>
        <thead>
          <tr>
            <th>Setting</th>
            <th>Description</th>
            <th>Default</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>apiKey</code></td>
            <td>Your Anthropic API key</td>
            <td>—</td>
          </tr>
          <tr>
            <td><code>baseUrl</code></td>
            <td>Custom API endpoint (Azure, AWS, etc.)</td>
            <td>Anthropic default</td>
          </tr>
          <tr>
            <td><code>model</code></td>
            <td>Default Claude model</td>
            <td><code>claude-sonnet-4-5-20250929</code></td>
          </tr>
          <tr>
            <td><code>maxIterations</code></td>
            <td>Maximum autonomous iterations</td>
            <td><code>50</code></td>
          </tr>
          <tr>
            <td><code>defaultVerbose</code></td>
            <td>Enable verbose logging by default</td>
            <td><code>false</code></td>
          </tr>
          <tr>
            <td><code>preferredPackageManager</code></td>
            <td>Package manager: pnpm, bun, or npm</td>
            <td><code>pnpm</code></td>
          </tr>
          <tr>
            <td><code>enableDryRunByDefault</code></td>
            <td>Run in dry-run mode by default</td>
            <td><code>false</code></td>
          </tr>
          <tr>
            <td><code>gitCheckpointStrategy</code></td>
            <td>Git checkpoint method: stash or commit</td>
            <td><code>stash</code></td>
          </tr>
          <tr>
            <td><code>testCommandOverride</code></td>
            <td>Custom test command</td>
            <td>Auto-detected</td>
          </tr>
          <tr>
            <td><code>plugins</code></td>
            <td>Array of plugin file paths</td>
            <td><code>[]</code></td>
          </tr>
          <tr>
            <td><code>mcpServers</code></td>
            <td>MCP server configurations</td>
            <td><code>{'{}'}</code></td>
          </tr>
        </tbody>
      </table>

      <h2>Environment Variables</h2>
      <p>You can also configure XibeCode via environment variables:</p>
      <pre><code>{`ANTHROPIC_API_KEY=your_key        # API key
ANTHROPIC_BASE_URL=https://...    # Custom endpoint
XIBECODE_MODEL=claude-opus-4-...  # Default model`}</code></pre>

      <h2>Priority Order</h2>
      <p>Configuration is resolved in this order (highest priority first):</p>
      <ol>
        <li>CLI flags (e.g., <code>--api-key</code>, <code>--model</code>)</li>
        <li>Environment variables</li>
        <li>Config file (<code>~/.xibecode/config.json</code>)</li>
      </ol>

      <h2>Custom API Endpoints</h2>
      <p>
        XibeCode supports custom API endpoints, making it compatible with Azure OpenAI,
        AWS Bedrock, or any Claude-compatible API:
      </p>
      <pre><code>{`# Via config
xibecode config --set-url https://your-custom-endpoint.com

# Via CLI flag
xibecode run "task" --base-url https://your-custom-endpoint.com`}</code></pre>

      <h2>Package Manager Detection</h2>
      <p>XibeCode automatically detects your preferred package manager by checking for lock files:</p>
      <ol>
        <li><code>pnpm-lock.yaml</code> → pnpm</li>
        <li><code>bun.lockb</code> → bun</li>
        <li><code>package-lock.json</code> → npm</li>
      </ol>
      <p>Override this with the <code>preferredPackageManager</code> setting.</p>

      <h2>Next Steps</h2>
      <ul>
        <li><a href="/docs/mcp">Set up MCP integration</a></li>
        <li><a href="/docs/plugins">Create custom plugins</a></li>
      </ul>
    </div>
  );
}
