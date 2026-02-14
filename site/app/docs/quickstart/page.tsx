export default function QuickStartPage() {
  return (
    <div>
      <h1>Quick Start</h1>
      <p>
        Get productive with XibeCode in minutes. This guide walks you through your first
        autonomous coding session and introduces you to the key features.
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
        <li>Switch between agent personas with <code>/mode</code></li>
        <li>Toggle tool execution with <code>tools on/off</code></li>
        <li>Type <code>exit</code> or <code>quit</code> to leave</li>
      </ul>

      <h2>Agent Modes (Personas)</h2>
      <p>
        XibeCode features 13 specialized agent personas, each optimized for different tasks.
        Switch modes to get specialized assistance:
      </p>
      <pre><code>{`# In chat mode, switch personas
/mode plan      # Aria the Architect - planning and analysis
/mode agent     # Blaze the Builder - full coding capabilities
/mode debugger  # Dex the Detective - bug hunting and fixing
/mode tester    # Tess the QA Engineer - testing and quality
/mode security  # Sentinel the Guardian - security audits
/mode review    # Nova the Critic - code reviews`}</code></pre>

      <h3>Key Personas</h3>
      <table>
        <thead>
          <tr>
            <th>Mode</th>
            <th>Persona</th>
            <th>Best For</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>agent</code></td>
            <td>Blaze the Builder</td>
            <td>Full-stack development, building features</td>
          </tr>
          <tr>
            <td><code>plan</code></td>
            <td>Aria the Architect</td>
            <td>Understanding codebases, planning implementations</td>
          </tr>
          <tr>
            <td><code>debugger</code></td>
            <td>Dex the Detective</td>
            <td>Finding and fixing bugs</td>
          </tr>
          <tr>
            <td><code>tester</code></td>
            <td>Tess the QA Engineer</td>
            <td>Writing tests, ensuring quality</td>
          </tr>
          <tr>
            <td><code>security</code></td>
            <td>Sentinel the Guardian</td>
            <td>Security audits, vulnerability detection</td>
          </tr>
        </tbody>
      </table>

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
  --changed-only              Focus only on git-changed files
  --mode <mode>               Start in a specific agent mode`}</code></pre>

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

      <h3>Use a Specific Mode</h3>
      <pre><code>{`# Start in planning mode
xibecode run "Analyze this codebase and suggest improvements" --mode plan

# Start in debugging mode
xibecode run "Find the bug causing the API timeout" --mode debugger`}</code></pre>

      <h2>How XibeCode Works</h2>
      <p>When you give XibeCode a task, it follows this autonomous loop:</p>
      <ol>
        <li><strong>Read</strong> — Analyzes your project structure, reads relevant files</li>
        <li><strong>Plan</strong> — Breaks down the task into steps</li>
        <li><strong>Execute</strong> — Creates/edits files, runs commands using 95+ tools</li>
        <li><strong>Verify</strong> — Runs tests, checks for errors</li>
        <li><strong>Iterate</strong> — Fixes any issues until the task is complete</li>
      </ol>
      <p>
        The entire process is autonomous — XibeCode continues iterating until the task is
        done or it reaches the maximum iteration limit. It has built-in loop detection to
        prevent infinite loops.
      </p>

      <h2>Key Features</h2>

      <h3>Smart Context Discovery</h3>
      <p>
        XibeCode automatically discovers related files by following imports, finding tests,
        and understanding project configuration.
      </p>

      <h3>Automatic Backups</h3>
      <p>
        Every file edit creates a timestamped backup. You can revert to any previous state:
      </p>
      <pre><code>{`# In chat mode
/revert src/app.ts  # Revert to previous version`}</code></pre>

      <h3>Git Integration</h3>
      <p>
        XibeCode can create checkpoints before making changes:
      </p>
      <pre><code>xibecode run &quot;Refactor the database layer (create checkpoint first)&quot;</code></pre>

      <h3>Test Integration</h3>
      <p>
        XibeCode auto-detects your test runner (Vitest, Jest, pytest, Go test, etc.)
        and runs tests to verify changes.
      </p>

      <h3>Safety Controls</h3>
      <p>
        Dangerous commands are blocked, and risky operations are flagged:
      </p>
      <ul>
        <li>Dry-run mode for safe previews</li>
        <li>Risk assessment before execution</li>
        <li>Command blocking for destructive operations</li>
        <li>Safer alternatives suggested when possible</li>
      </ul>

      <h2>Neural Memory</h2>
      <p>
        XibeCode learns from your project over time. It remembers patterns, preferences,
        and lessons learned:
      </p>
      <pre><code>{`# The agent automatically stores lessons
# You can also manually teach it
xibecode chat
> Remember that we use Prisma for database access in this project`}</code></pre>

      <h2>Next Steps</h2>
      <ul>
        <li><a href="/docs/modes">Agent Modes</a> — Deep dive into all 13 personas</li>
        <li><a href="/docs/configuration">Configure XibeCode</a> for your workflow</li>
        <li><a href="/docs/tools">Tools Reference</a> — Explore all 95+ available tools</li>
        <li><a href="/docs/mcp">Set up MCP integration</a> for extended capabilities</li>
        <li><a href="/docs/examples">See more examples</a> of real-world tasks</li>
      </ul>
    </div>
  );
}
