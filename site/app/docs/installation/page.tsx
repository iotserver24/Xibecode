export default function InstallationPage() {
  return (
    <div>
      <h1>Installation</h1>

      <h2>Requirements</h2>
      <ul>
        <li>Node.js 18.0.0 or higher</li>
        <li>An Anthropic API key</li>
      </ul>

      <h2>Install from npm</h2>
      <pre><code>npm install -g xibecode</code></pre>

      <h2>Install from Source</h2>
      <pre><code>{`git clone https://github.com/iotserver24/Xibecode
cd Xibecode
npm install
npm run build
npm link`}</code></pre>

      <h2>Set up API Key</h2>
      <pre><code>{`# Interactive setup
xibecode config

# Or set directly
xibecode config --set-key YOUR_ANTHROPIC_API_KEY

# Or use environment variable
export ANTHROPIC_API_KEY=your_key_here`}</code></pre>

      <h2>Verify Installation</h2>
      <pre><code>xibecode --version</code></pre>

      <h2>Next Steps</h2>
      <p>Now that you have Xoding AI Tool installed, check out the <a href="/docs/quickstart">Quick Start Guide</a> to run your first task!</p>
    </div>
  );
}
