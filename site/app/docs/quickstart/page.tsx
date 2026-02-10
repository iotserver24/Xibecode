export default function QuickStartPage() {
  return (
    <div>
      <h1>Quick Start</h1>
      <p>
        Get productive with XibeCode in minutes. This guide walks you through your first
        autonomous coding session.
      </p>

      <h2>Your First Task</h2>
      <p>
        The <code>run</code> command lets XibeCode autonomously complete coding tasks.
        Just describe what you want:
      </p>
      <pre><code>xibecode run &quot;Create a Python script that prints hello world&quot;</code></pre>
      <p>
        XibeCode will read your project, create the file, and verify it works — all autonomously.
      </p>

      <h2>Interactive Chat</h2>
      <p>
        For iterative development and quick questions, use chat mode:
      </p>
      <pre><code>xibecode chat</code></pre>
      <p>In chat mode you can:</p>
      <ul>
        <li>Ask questions about your codebase</li>
        <li>Request code changes step by step</li>
        <li>Toggle tool execution with <code>tools on/off</code></li>
        <li>Type <code>exit</code> or <code>quit</code> to leave</li>
      </ul>

      <h2>Run Command Options</h2>
      <pre><code>{`xibecode run [prompt] [options]

Options:
  -f, --file <path>           Read prompt from a file
  -m, --model <model>         AI model to use (default: claude-sonnet-4-5-20250929)
  -b, --base-url <url>        Custom API base URL
  -k, --api-key <key>         API key (overrides config)
  -d, --max-iterations <num>  Maximum iterations (default: 50)
  -v, --verbose               Show detailed logs
  --dry-run                   Preview changes without making them
  --changed-only              Focus only on git-changed files`}</code></pre>

      <h2>Example Tasks</h2>

      <h3>Build a Feature</h3>
      <pre><code>{`xibecode run "Add user authentication to the Express API:
- POST /auth/register
- POST /auth/login
- JWT token generation
- Middleware to protect routes"`}</code></pre>

      <h3>Fix a Bug</h3>
      <pre><code>{`xibecode run "The tests in test/user.test.js are failing.
Debug and fix the issues." --verbose`}</code></pre>

      <h3>Refactor Code</h3>
      <pre><code>{`xibecode run "Refactor src/ to use TypeScript:
- Convert all .js files to .ts
- Add type annotations
- Create types.ts for shared types"`}</code></pre>

      <h3>Generate Tests</h3>
      <pre><code>{`xibecode run "Write comprehensive tests for userController.js:
- Test all endpoints
- Test error cases
- Use Jest
- Achieve >80% coverage"`}</code></pre>

      <h3>Preview Changes (Dry Run)</h3>
      <pre><code>xibecode run &quot;Refactor authentication module&quot; --dry-run</code></pre>

      <h3>Focus on Changed Files</h3>
      <pre><code>xibecode run &quot;Fix linting errors in changed files&quot; --changed-only</code></pre>

      <h2>How XibeCode Works</h2>
      <p>When you give XibeCode a task, it follows this loop:</p>
      <ol>
        <li><strong>Read</strong> — Analyzes your project structure, reads relevant files</li>
        <li><strong>Plan</strong> — Breaks down the task into steps</li>
        <li><strong>Execute</strong> — Creates/edits files, runs commands</li>
        <li><strong>Verify</strong> — Runs tests, checks for errors</li>
        <li><strong>Iterate</strong> — Fixes any issues until the task is complete</li>
      </ol>
      <p>
        The entire process is autonomous — XibeCode continues iterating until the task is
        done or it reaches the maximum iteration limit.
      </p>

      <h2>Next Steps</h2>
      <ul>
        <li><a href="/docs/configuration">Configure XibeCode</a> for your workflow</li>
        <li><a href="/docs/mcp">Set up MCP integration</a> for extended capabilities</li>
        <li><a href="/docs/examples">See more examples</a> of real-world tasks</li>
      </ul>
    </div>
  );
}
