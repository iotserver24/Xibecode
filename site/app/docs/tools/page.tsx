export default function ToolsPage() {
  return (
    <div>
      <h1>Tools Reference</h1>
      <p>
        XibeCode provides 95+ built-in tools across 8 categories for autonomous coding operations.
        These tools are automatically available to the AI agent based on the current mode&apos;s
        permissions.
      </p>

      <h2>Tool Categories Overview</h2>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Tools</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>File Operations</td>
            <td>8</td>
            <td>Read, write, edit, delete files</td>
          </tr>
          <tr>
            <td>Directory Operations</td>
            <td>4</td>
            <td>List, search, create, move</td>
          </tr>
          <tr>
            <td>Git Operations</td>
            <td>7</td>
            <td>Status, diff, checkpoints, revert</td>
          </tr>
          <tr>
            <td>Shell Commands</td>
            <td>1</td>
            <td>Execute shell commands</td>
          </tr>
          <tr>
            <td>Code Search</td>
            <td>1</td>
            <td>Grep/ripgrep code search</td>
          </tr>
          <tr>
            <td>Web Operations</td>
            <td>2</td>
            <td>Search, fetch URLs</td>
          </tr>
          <tr>
            <td>Test Operations</td>
            <td>2</td>
            <td>Run tests, get status</td>
          </tr>
          <tr>
            <td>Memory Operations</td>
            <td>2</td>
            <td>Neural memory updates</td>
          </tr>
          <tr>
            <td>Browser Operations</td>
            <td>8</td>
            <td>Screenshots, testing, performance, accessibility</td>
          </tr>
          <tr>
            <td>Context Operations</td>
            <td>2</td>
            <td>Smart context, revert</td>
          </tr>
          <tr>
            <td>Skills Operations</td>
            <td>2</td>
            <td>Search and install skills</td>
          </tr>
        </tbody>
      </table>

      <h2>File Operations</h2>

      <h3>read_file</h3>
      <p>Read the contents of a file.</p>
      <pre><code>{`{
  "path": "src/app.ts",
  "start_line": 1,      // Optional: start line
  "end_line": 100       // Optional: end line
}`}</code></pre>

      <h3>read_multiple_files</h3>
      <p>Read multiple files at once for context.</p>
      <pre><code>{`{
  "paths": ["src/app.ts", "src/utils.ts", "package.json"]
}`}</code></pre>

      <h3>write_file</h3>
      <p>Write content to a file (creates or overwrites).</p>
      <pre><code>{`{
  "path": "src/new-file.ts",
  "content": "export const hello = 'world';"
}`}</code></pre>

      <h3>edit_file</h3>
      <p>Edit a file using search and replace.</p>
      <pre><code>{`{
  "path": "src/app.ts",
  "search": "const oldValue = 1;",
  "replace": "const newValue = 2;"
}`}</code></pre>

      <h3>edit_lines</h3>
      <p>Edit specific line ranges in a file.</p>
      <pre><code>{`{
  "path": "src/app.ts",
  "start_line": 10,
  "end_line": 15,
  "content": "// New content for lines 10-15"
}`}</code></pre>

      <h3>insert_at_line</h3>
      <p>Insert content at a specific line.</p>
      <pre><code>{`{
  "path": "src/app.ts",
  "line": 5,
  "content": "import { newModule } from './module';"
}`}</code></pre>

      <h3>verified_edit</h3>
      <p>Edit with verification - ensures the search pattern exists before replacing.</p>
      <pre><code>{`{
  "path": "src/app.ts",
  "search": "exact content to find",
  "replace": "replacement content"
}`}</code></pre>

      <h3>delete_file</h3>
      <p>Delete a file.</p>
      <pre><code>{`{
  "path": "src/deprecated.ts"
}`}</code></pre>

      <h2>Directory Operations</h2>

      <h3>list_directory</h3>
      <p>List files and directories in a path.</p>
      <pre><code>{`{
  "path": "src/",
  "recursive": false   // Optional: list recursively
}`}</code></pre>

      <h3>search_files</h3>
      <p>Search for files by name pattern.</p>
      <pre><code>{`{
  "pattern": "*.ts",
  "path": "src/"        // Optional: search directory
}`}</code></pre>

      <h3>create_directory</h3>
      <p>Create a new directory.</p>
      <pre><code>{`{
  "path": "src/new-feature/"
}`}</code></pre>

      <h3>move_file</h3>
      <p>Move or rename a file.</p>
      <pre><code>{`{
  "source": "src/old-name.ts",
  "destination": "src/new-name.ts"
}`}</code></pre>

      <h2>Git Operations</h2>

      <h3>get_git_status</h3>
      <p>Get current git status.</p>
      <pre><code>{`{}`}</code></pre>
      <p>Returns staged, unstaged, and untracked files.</p>

      <h3>get_git_diff_summary</h3>
      <p>Get a summary of git changes.</p>
      <pre><code>{`{
  "staged": true      // Optional: show staged changes only
}`}</code></pre>

      <h3>get_git_changed_files</h3>
      <p>Get list of files changed in the current branch.</p>
      <pre><code>{`{}`}</code></pre>

      <h3>create_git_checkpoint</h3>
      <p>Create a checkpoint before making changes.</p>
      <pre><code>{`{
  "message": "before auth refactor",
  "strategy": "stash"   // "stash" or "commit"
}`}</code></pre>

      <h3>revert_to_git_checkpoint</h3>
      <p>Revert to a previous checkpoint.</p>
      <pre><code>{`{
  "checkpoint_id": "stash@{0}"
}`}</code></pre>

      <h3>git_show_diff</h3>
      <p>Show diff for a specific file.</p>
      <pre><code>{`{
  "path": "src/app.ts"
}`}</code></pre>

      <h3>get_mcp_status</h3>
      <p>Get MCP (Model Context Protocol) server status.</p>
      <pre><code>{`{}`}</code></pre>

      <h2>Shell Commands</h2>

      <h3>run_command</h3>
      <p>Execute a shell command.</p>
      <pre><code>{`{
  "command": "npm install express",
  "cwd": "./",                    // Optional: working directory
  "timeout": 30000,               // Optional: timeout in ms
  "stdin": "input data"           // Optional: stdin input
}`}</code></pre>
      <p><strong>Safety:</strong> Dangerous commands are blocked (rm -rf, etc.)</p>

      <h2>Code Search</h2>

      <h3>grep_code</h3>
      <p>Search code using ripgrep (falls back to grep).</p>
      <pre><code>{`{
  "pattern": "function.*async",
  "path": "src/",
  "include": "*.ts",           // Optional: file pattern
  "case_sensitive": false      // Optional: case sensitivity
}`}</code></pre>

      <h2>Web Operations</h2>

      <h3>web_search</h3>
      <p>Search the web using DuckDuckGo.</p>
      <pre><code>{`{
  "query": "typescript best practices 2024",
  "num_results": 5              // Optional: number of results
}`}</code></pre>

      <h3>fetch_url</h3>
      <p>Fetch content from a URL.</p>
      <pre><code>{`{
  "url": "https://api.example.com/data",
  "method": "GET",              // Optional: HTTP method
  "headers": {},                // Optional: custom headers
  "body": null                  // Optional: request body
}`}</code></pre>

      <h2>Test Operations</h2>

      <h3>run_tests</h3>
      <p>Run tests (auto-detects test runner).</p>
      <pre><code>{`{
  "path": "src/",               // Optional: test path
  "filter": "auth",             // Optional: test filter
  "verbose": true               // Optional: verbose output
}`}</code></pre>
      <p>Supports: Vitest, Jest, Mocha, pytest, Go test, Cargo test</p>

      <h3>get_test_status</h3>
      <p>Get the status of the last test run.</p>
      <pre><code>{`{}`}</code></pre>
      <p>Returns passed, failed, and skipped test counts.</p>

      <h2>Memory Operations</h2>

      <h3>update_memory</h3>
      <p>Update the neural memory with learned information.</p>
      <pre><code>{`{
  "key": "project_structure",
  "value": "This project uses Next.js with TypeScript"
}`}</code></pre>

      <h3>remember_lesson</h3>
      <p>Store a lesson learned during the session.</p>
      <pre><code>{`{
  "lesson": "Always run npm install after pulling changes",
  "context": "Build failures after git pull"
}`}</code></pre>

      <h2>Browser Operations</h2>
      <p>
        XibeCode uses Playwright for browser automation, providing comprehensive testing
        capabilities for UI, UX, performance, and accessibility.
      </p>

      <h3>take_screenshot</h3>
      <p>Take a screenshot of a webpage.</p>
      <pre><code>{`{
  "url": "http://localhost:3000",
  "path": "screenshot.png",
  "full_page": true            // Optional: full page screenshot
}`}</code></pre>

      <h3>get_console_logs</h3>
      <p>Get browser console logs and errors from a page. Useful for debugging frontend issues.</p>
      <pre><code>{`{
  "url": "http://localhost:3000"
}`}</code></pre>

      <h3>run_visual_test</h3>
      <p>Run visual regression testing by comparing screenshots against a baseline.</p>
      <pre><code>{`{
  "url": "http://localhost:3000",
  "baseline_path": "baselines/homepage.png",
  "output_dir": ".playwright-baselines"  // Optional
}`}</code></pre>
      <p>Creates baseline on first run, then compares subsequent screenshots to detect visual changes.</p>

      <h3>check_accessibility</h3>
      <p>Run accessibility audit on a webpage. Checks WCAG compliance.</p>
      <pre><code>{`{
  "url": "http://localhost:3000"
}`}</code></pre>
      <p>Checks for:</p>
      <ul>
        <li>Missing alt text on images</li>
        <li>Form inputs without labels</li>
        <li>Empty links</li>
        <li>Missing document language</li>
        <li>Heading hierarchy issues</li>
        <li>Color contrast problems</li>
      </ul>

      <h3>measure_performance</h3>
      <p>Measure Core Web Vitals and performance metrics.</p>
      <pre><code>{`{
  "url": "http://localhost:3000"
}`}</code></pre>
      <p>Returns:</p>
      <ul>
        <li>First Contentful Paint (FCP)</li>
        <li>Largest Contentful Paint (LCP)</li>
        <li>Cumulative Layout Shift (CLS)</li>
        <li>Time to Interactive (TTI)</li>
        <li>DOM Content Loaded time</li>
      </ul>

      <h3>test_responsive</h3>
      <p>Test a page across multiple viewport sizes.</p>
      <pre><code>{`{
  "url": "http://localhost:3000",
  "output_dir": ".responsive-screenshots",  // Optional
  "viewports": [                            // Optional custom viewports
    { "name": "mobile", "width": 375, "height": 667 },
    { "name": "tablet", "width": 768, "height": 1024 },
    { "name": "desktop", "width": 1280, "height": 800 }
  ]
}`}</code></pre>
      <p>Takes screenshots at each breakpoint and reports any JavaScript errors.</p>

      <h3>capture_network</h3>
      <p>Capture all network requests made during page load.</p>
      <pre><code>{`{
  "url": "http://localhost:3000"
}`}</code></pre>
      <p>Returns URLs, methods, status codes, resource types, and timing for each request.</p>

      <h3>run_playwright_test</h3>
      <p>Execute a Playwright test file.</p>
      <pre><code>{`{
  "test_path": "tests/homepage.spec.ts",
  "headed": false,                         // Optional: show browser
  "browser": "chromium",                   // Optional: chromium, firefox, webkit
  "timeout": 120000                        // Optional: timeout in ms
}`}</code></pre>

      <h2>Context Operations</h2>

      <h3>get_context</h3>
      <p>Get smart context for a file (imports, tests, related files).</p>
      <pre><code>{`{
  "path": "src/app.ts"
}`}</code></pre>
      <p>Returns:</p>
      <ul>
        <li>File imports and dependencies</li>
        <li>Related test files</li>
        <li>Configuration files</li>
        <li>Type definitions</li>
      </ul>

      <h3>revert_file</h3>
      <p>Revert a file to its last backed-up state.</p>
      <pre><code>{`{
  "path": "src/app.ts"
}`}</code></pre>

      <h2>Skills Operations</h2>

      <h3>search_skills_sh</h3>
      <p>Search for skills on skills.sh marketplace.</p>
      <pre><code>{`{
  "query": "docker deployment"
}`}</code></pre>

      <h3>install_skill_from_skills_sh</h3>
      <p>Install a skill from skills.sh.</p>
      <pre><code>{`{
  "skill_name": "docker-deploy"
}`}</code></pre>

      <h2>Tool Permissions by Mode</h2>
      <p>
        Tools are grouped into categories, and each mode has access to specific categories:
      </p>
      <ul>
        <li><strong>read_only</strong>: read_file, read_multiple_files, list_directory, search_files</li>
        <li><strong>write_fs</strong>: write_file, edit_file, edit_lines, insert_at_line, delete_file, move_file, create_directory</li>
        <li><strong>git_read</strong>: get_git_status, get_git_diff_summary, get_git_changed_files, git_show_diff</li>
        <li><strong>git_mutation</strong>: create_git_checkpoint, revert_to_git_checkpoint</li>
        <li><strong>shell_command</strong>: run_command</li>
        <li><strong>tests</strong>: run_tests, get_test_status</li>
        <li><strong>network</strong>: web_search, fetch_url</li>
        <li><strong>context</strong>: grep_code, get_context</li>
      </ul>

      <h2>Safety Features</h2>
      <ul>
        <li><strong>Command Blocking</strong>: Dangerous commands like <code>rm -rf /</code> are blocked</li>
        <li><strong>Risk Assessment</strong>: High-risk operations are flagged with warnings</li>
        <li><strong>Automatic Backups</strong>: Files are backed up before editing</li>
        <li><strong>Dry-Run Mode</strong>: Preview changes without executing</li>
        <li><strong>Mode Permissions</strong>: Tools are restricted based on current mode</li>
      </ul>

      <h2>Extending Tools</h2>
      <p>You can add custom tools via:</p>
      <ul>
        <li><a href="/docs/plugins">Plugins</a> — JavaScript/TypeScript modules</li>
        <li><a href="/docs/mcp">MCP Servers</a> — External tool servers</li>
      </ul>

      <h2>Next Steps</h2>
      <ul>
        <li><a href="/docs/modes">Agent Modes</a> — Learn about mode permissions</li>
        <li><a href="/docs/plugins">Plugins</a> — Create custom tools</li>
        <li><a href="/docs/examples">Examples</a> — See tools in action</li>
      </ul>
    </div>
  );
}
