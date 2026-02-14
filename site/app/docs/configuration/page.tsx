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
      <p>This opens an interactive menu to configure all settings including:</p>
      <ul>
        <li>API key and provider selection</li>
        <li>Default model</li>
        <li>Package manager preference</li>
        <li>Default agent mode</li>
        <li>Safety settings</li>
      </ul>

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

      <h2>Configuration File</h2>
      <p>The main configuration file is located at <code>~/.xibecode/config.json</code>:</p>
      <pre><code>{`{
  "apiKey": "sk-ant-...",
  "baseUrl": "https://api.anthropic.com",
  "model": "claude-sonnet-4-5-20250929",
  "maxIterations": 50,
  "defaultVerbose": false,
  "preferredPackageManager": "pnpm",
  "enableDryRunByDefault": false,
  "gitCheckpointStrategy": "stash",
  "defaultMode": "agent",
  "autoApprovalPolicy": "always",
  "plugins": [],
  "mcpServers": {}
}`}</code></pre>

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
            <td>Your AI provider API key (Anthropic, OpenAI)</td>
            <td>—</td>
          </tr>
          <tr>
            <td><code>baseUrl</code></td>
            <td>Custom API endpoint (Azure, AWS Bedrock, etc.)</td>
            <td>Anthropic default</td>
          </tr>
          <tr>
            <td><code>model</code></td>
            <td>Default AI model to use</td>
            <td><code>claude-sonnet-4-5-20250929</code></td>
          </tr>
          <tr>
            <td><code>maxIterations</code></td>
            <td>Maximum autonomous iterations before stopping</td>
            <td><code>50</code></td>
          </tr>
          <tr>
            <td><code>defaultVerbose</code></td>
            <td>Enable verbose logging by default</td>
            <td><code>false</code></td>
          </tr>
          <tr>
            <td><code>preferredPackageManager</code></td>
            <td>Package manager: pnpm, bun, npm, or yarn</td>
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
            <td><code>defaultMode</code></td>
            <td>Default agent mode to start in</td>
            <td><code>agent</code></td>
          </tr>
          <tr>
            <td><code>autoApprovalPolicy</code></td>
            <td>Mode transition approval: always, prompt-only, never</td>
            <td><code>always</code></td>
          </tr>
          <tr>
            <td><code>testCommandOverride</code></td>
            <td>Custom test command (overrides auto-detection)</td>
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
      <pre><code>{`# API Keys
ANTHROPIC_API_KEY=your_key        # Anthropic API key
OPENAI_API_KEY=your_key           # OpenAI API key

# API Configuration
ANTHROPIC_BASE_URL=https://...    # Custom endpoint
XIBECODE_MODEL=claude-opus-4-...  # Default model

# Behavior
XIBECODE_DRY_RUN=true             # Enable dry-run by default
XIBECODE_VERBOSE=true             # Enable verbose logging
XIBECODE_MODE=plan                # Default agent mode`}</code></pre>

      <h2>Priority Order</h2>
      <p>Configuration is resolved in this order (highest priority first):</p>
      <ol>
        <li>CLI flags (e.g., <code>--api-key</code>, <code>--model</code>)</li>
        <li>Environment variables</li>
        <li>Project-level config (<code>.xibecode/config.json</code>)</li>
        <li>Global config file (<code>~/.xibecode/config.json</code>)</li>
      </ol>

      <h2>Agent Mode Configuration</h2>
      <p>
        Configure how XibeCode handles mode transitions and approvals:
      </p>
      <pre><code>{`{
  "defaultMode": "agent",
  "autoApprovalPolicy": "prompt-only"
}`}</code></pre>
      <p>Auto-approval policies:</p>
      <ul>
        <li><code>always</code> — Auto-approve all mode transitions</li>
        <li><code>prompt-only</code> — Require confirmation for escalation (read → write)</li>
        <li><code>always-for-debugger</code> — Auto-approve only debugger transitions</li>
        <li><code>never</code> — Always require confirmation</li>
      </ul>

      <h2>Custom API Endpoints</h2>
      <p>
        XibeCode supports custom API endpoints, making it compatible with Azure OpenAI,
        AWS Bedrock, or any Claude-compatible API:
      </p>
      <pre><code>{`# Via config
xibecode config --set-url https://your-custom-endpoint.com

# Via CLI flag
xibecode run "task" --base-url https://your-custom-endpoint.com

# Via environment variable
export ANTHROPIC_BASE_URL=https://your-custom-endpoint.com`}</code></pre>

      <h3>Azure OpenAI Example</h3>
      <pre><code>{`{
  "baseUrl": "https://your-resource.openai.azure.com",
  "apiKey": "your-azure-api-key",
  "model": "your-deployment-name"
}`}</code></pre>

      <h3>AWS Bedrock Example</h3>
      <pre><code>{`{
  "baseUrl": "https://bedrock-runtime.us-east-1.amazonaws.com",
  "apiKey": "your-aws-credentials",
  "model": "anthropic.claude-3-sonnet-20240229-v1:0"
}`}</code></pre>

      <h2>Package Manager Detection</h2>
      <p>XibeCode automatically detects your preferred package manager by checking for lock files:</p>
      <ol>
        <li><code>pnpm-lock.yaml</code> → pnpm</li>
        <li><code>bun.lockb</code> → bun</li>
        <li><code>yarn.lock</code> → yarn</li>
        <li><code>package-lock.json</code> → npm</li>
      </ol>
      <p>Override this with the <code>preferredPackageManager</code> setting.</p>

      <h2>Test Runner Configuration</h2>
      <p>XibeCode auto-detects test runners by checking your project:</p>
      <ul>
        <li><strong>Vitest</strong> — vitest.config.ts or vitest in package.json</li>
        <li><strong>Jest</strong> — jest.config.js or jest in package.json</li>
        <li><strong>Mocha</strong> — .mocharc.js or mocha in package.json</li>
        <li><strong>pytest</strong> — pytest.ini or pyproject.toml</li>
        <li><strong>Go test</strong> — go.mod file present</li>
        <li><strong>Cargo test</strong> — Cargo.toml file present</li>
      </ul>
      <p>Override with a custom test command:</p>
      <pre><code>{`{
  "testCommandOverride": "npm run test:unit"
}`}</code></pre>

      <h2>Git Checkpoint Strategies</h2>
      <p>Choose how XibeCode creates checkpoints before making changes:</p>
      <ul>
        <li><code>stash</code> — Uses git stash (recommended, lightweight)</li>
        <li><code>commit</code> — Creates a commit (persistent history)</li>
      </ul>
      <pre><code>{`{
  "gitCheckpointStrategy": "stash"
}`}</code></pre>

      <h2>Project-Level Configuration</h2>
      <p>
        Create a <code>.xibecode/config.json</code> in your project root for project-specific settings:
      </p>
      <pre><code>{`# .xibecode/config.json
{
  "testCommandOverride": "pnpm test",
  "defaultMode": "tester",
  "plugins": ["./custom-plugin.js"]
}`}</code></pre>

      <h2>Backup Configuration</h2>
      <p>
        XibeCode automatically backs up files before editing. Backups are stored in
        <code>~/.xibecode/backups/</code> with timestamps:
      </p>
      <pre><code>{`~/.xibecode/backups/
  ├── src_app.ts_2024-01-15T10-30-00.bak
  ├── src_utils_helper.ts_2024-01-15T10-31-00.bak
  └── ...`}</code></pre>

      <h2>Next Steps</h2>
      <ul>
        <li><a href="/docs/modes">Agent Modes</a> — Learn about all 13 personas</li>
        <li><a href="/docs/mcp">Set up MCP integration</a></li>
        <li><a href="/docs/plugins">Create custom plugins</a></li>
      </ul>
    </div>
  );
}
