export default function InstallationPage() {
  return (
    <div>
      <h1>Installation</h1>
      <p>Get XibeCode up and running in under a minute.</p>

      <h2>Requirements</h2>
      <ul>
        <li><strong>Node.js 18.0.0</strong> or higher</li>
        <li>An <strong>Anthropic API key</strong> (for Claude AI)</li>
      </ul>

      <h2>Install from npm (Recommended)</h2>
      <pre><code>npm install -g xibecode</code></pre>
      <p>Or use your preferred package manager:</p>
      <pre><code>{`# pnpm (recommended)
pnpm add -g xibecode

# bun
bun add -g xibecode`}</code></pre>

      <h2>Install from Source</h2>
      <pre><code>{`git clone https://github.com/iotserver24/Xibecode
cd Xibecode
npm install
npm run build
npm link`}</code></pre>

      <h2>Set up API Key</h2>
      <p>XibeCode needs an Anthropic API key to communicate with Claude. You can set it up in three ways:</p>

      <h3>Option 1: Interactive Setup</h3>
      <pre><code>xibecode config</code></pre>

      <h3>Option 2: Direct Configuration</h3>
      <pre><code>xibecode config --set-key YOUR_ANTHROPIC_API_KEY</code></pre>

      <h3>Option 3: Environment Variable</h3>
      <pre><code>export ANTHROPIC_API_KEY=your_key_here</code></pre>

      <h2>Verify Installation</h2>
      <pre><code>xibecode --version</code></pre>

      <h2>Next Steps</h2>
      <p>
        Now that XibeCode is installed, head to the{' '}
        <a href="/docs/quickstart">Quick Start Guide</a> to run your first autonomous coding task.
      </p>
    </div>
  );
}
