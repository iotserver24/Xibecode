export default function InstallationPage() {
  return (
    <div>
      <h1>Installation</h1>
      <p>Get XibeCode up and running in under a minute.</p>

      <h2>Requirements</h2>
      <ul>
        <li><strong>Node.js 18.0.0</strong> or higher</li>
        <li><strong>TypeScript 5.3+</strong> (for development)</li>
        <li>An <strong>AI provider API key</strong> (Anthropic, OpenAI, or compatible)</li>
      </ul>

      <h2>Install from npm (Recommended)</h2>
      <pre><code>npm install -g xibecode</code></pre>
      <p>Or use your preferred package manager:</p>
      <pre><code>{`# pnpm (recommended)
pnpm add -g xibecode

# bun
bun add -g xibecode

# yarn
yarn global add xibecode`}</code></pre>

      <h2>Install from Source</h2>
      <pre><code>{`git clone https://github.com/iotserver24/Xibecode
cd Xibecode
npm install
npm run build
npm link`}</code></pre>

      <h2>Set up API Key</h2>
      <p>XibeCode needs an AI provider API key (Anthropic, OpenAI, or compatible). You can set it up in three ways:</p>

      <h3>Option 1: Interactive Setup (Recommended)</h3>
      <pre><code>xibecode config</code></pre>
      <p>This opens an interactive menu where you can configure all settings including API key, model, and preferences.</p>

      <h3>Option 2: Direct Configuration</h3>
      <pre><code>{`# Set API key
xibecode config --set-key YOUR_ANTHROPIC_API_KEY

# Or for OpenAI
xibecode config --set-key YOUR_OPENAI_API_KEY`}</code></pre>

      <h3>Option 3: Environment Variable</h3>
      <pre><code>{`# Anthropic
export ANTHROPIC_API_KEY=your_key_here

# OpenAI
export OPENAI_API_KEY=your_key_here`}</code></pre>

      <h2>Verify Installation</h2>
      <pre><code>{`# Check version
xibecode --version

# View current configuration
xibecode config --show

# Run a simple test
xibecode chat`}</code></pre>

      <h2>Directory Structure</h2>
      <p>XibeCode creates the following directories:</p>
      <pre><code>{`~/.xibecode/           # Global configuration
  ├── config.json       # Main configuration file
  ├── mcp-servers.json  # MCP server configurations
  └── backups/          # File backups

.xibecode/             # Project-level (in your working directory)
  ├── memory.json       # Neural memory for this project
  └── skills/           # Custom skills for this project`}</code></pre>

      <h2>Supported Platforms</h2>
      <ul>
        <li><strong>macOS</strong> — Full support (Intel and Apple Silicon)</li>
        <li><strong>Linux</strong> — Full support (Ubuntu, Debian, Fedora, Arch)</li>
        <li><strong>Windows</strong> — Full support (PowerShell and WSL)</li>
      </ul>

      <h2>Troubleshooting</h2>

      <h3>Permission Denied on Global Install</h3>
      <pre><code>{`# Use sudo (not recommended)
sudo npm install -g xibecode

# Better: Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH`}</code></pre>

      <h3>Node.js Version Too Old</h3>
      <pre><code>{`# Using nvm (Node Version Manager)
nvm install 18
nvm use 18

# Verify
node --version`}</code></pre>

      <h3>API Key Not Working</h3>
      <pre><code>{`# Check if key is set
xibecode config --show

# Test API connection
xibecode chat
# Then type: "Hello" to test`}</code></pre>

      <h2>Next Steps</h2>
      <ul>
        <li><a href="/docs/quickstart">Quick Start Guide</a> — Run your first autonomous coding task</li>
        <li><a href="/docs/configuration">Configuration</a> — Customize XibeCode for your workflow</li>
        <li><a href="/docs/modes">Agent Modes</a> — Learn about the 13 specialized agent personas</li>
      </ul>
    </div>
  );
}
