export default function ExamplesPage() {
  return (
    <div>
      <h1>Examples &amp; Workflows</h1>
      <p>
        Real-world examples showing how to use XibeCode for common development tasks.
      </p>

      <h2>Building Features</h2>

      <h3>Add Authentication</h3>
      <pre><code>{`xibecode run "Add JWT authentication:
1. Install jsonwebtoken and bcrypt
2. Create auth middleware
3. Add /login and /register endpoints
4. Protect existing routes
5. Add tests"`}</code></pre>
      <p>XibeCode will autonomously:</p>
      <ol>
        <li>Install dependencies</li>
        <li>Create the auth middleware file</li>
        <li>Read your existing app structure</li>
        <li>Add auth routes matching your code style</li>
        <li>Write and run tests to verify</li>
      </ol>

      <h3>Create a REST API</h3>
      <pre><code>xibecode run &quot;Create a REST API with Express for a todo app&quot;</code></pre>

      <h3>Add Database Integration</h3>
      <pre><code>{`xibecode run "Add PostgreSQL database integration:
- Set up connection pool
- Create user and post models
- Add migration scripts"`}</code></pre>

      <h2>Fixing Bugs</h2>

      <h3>Debug Failing Tests</h3>
      <pre><code>xibecode run &quot;The tests in test/user.test.js are failing. Debug and fix.&quot; --verbose</code></pre>
      <p>XibeCode will:</p>
      <ol>
        <li>Run the tests to see the exact error</li>
        <li>Read the test file and source code</li>
        <li>Identify the root cause</li>
        <li>Apply a fix</li>
        <li>Re-run tests to verify</li>
      </ol>

      <h3>Fix a Production Error</h3>
      <pre><code>{`xibecode run "Production error: 'Cannot read property x of undefined'
in userController.js line 42. Fix it." --verbose`}</code></pre>

      <h3>Fix Linting Errors</h3>
      <pre><code>xibecode run &quot;Fix linting errors in changed files&quot; --changed-only</code></pre>

      <h2>Refactoring</h2>

      <h3>Convert to TypeScript</h3>
      <pre><code>{`xibecode run "Refactor src/ to use TypeScript:
- Convert all .js files to .ts
- Add type annotations
- Create types.ts for shared types
- Update tsconfig.json"`}</code></pre>

      <h3>Improve Code Quality</h3>
      <pre><code>xibecode run &quot;Refactor the authentication module to follow SOLID principles&quot;</code></pre>

      <h2>Git Workflows</h2>

      <h3>Safe Refactoring with Checkpoints</h3>
      <pre><code>xibecode run &quot;Refactor the database layer (create checkpoint first)&quot;</code></pre>
      <p>
        XibeCode creates a git checkpoint before making changes, so you can revert
        if anything goes wrong.
      </p>

      <h3>Focus on Changed Files</h3>
      <pre><code>xibecode run &quot;Review and fix issues in changed files only&quot; --changed-only</code></pre>

      <h3>Prepare for Code Review</h3>
      <pre><code>{`xibecode run "Prepare this branch for code review:
- Run tests
- Fix linting errors
- Generate a summary of changes"`}</code></pre>

      <h2>Using Dry-Run Mode</h2>
      <p>Preview changes before they&apos;re made:</p>
      <pre><code>xibecode run &quot;Refactor the auth module&quot; --dry-run</code></pre>
      <p>Output will show:</p>
      <pre><code>{`[DRY RUN] Would replace lines 15-20 with 8 new lines
[DRY RUN] Would write 150 lines to src/auth/index.ts
[DRY RUN] Would create stash checkpoint: "before auth refactor"`}</code></pre>

      <h2>Smart Context in Action</h2>
      <p>
        When you ask XibeCode to modify a file, it automatically discovers related files:
      </p>
      <pre><code>xibecode run &quot;Add error handling to userController.js&quot;</code></pre>
      <p>XibeCode will:</p>
      <ol>
        <li>Read <code>userController.js</code></li>
        <li>Extract and follow imports (User model, auth middleware)</li>
        <li>Find related test files</li>
        <li>Check config files (package.json, tsconfig.json)</li>
        <li>Make edits with full understanding of the codebase</li>
      </ol>

      <h2>Tips &amp; Best Practices</h2>
      <ul>
        <li>
          <strong>Be specific about files</strong> — <code>&quot;Fix src/api/users.js&quot;</code> is
          better than <code>&quot;Fix the users file&quot;</code>
        </li>
        <li>
          <strong>Mention line numbers for large files</strong> — <code>&quot;Bug around line 500 in
          data-processor.js&quot;</code>
        </li>
        <li>
          <strong>Use verbose mode for complex tasks</strong> — <code>--verbose</code> shows every
          tool call
        </li>
        <li>
          <strong>Break down huge tasks</strong> — Instead of &quot;Build entire platform&quot;, do it
          module by module
        </li>
        <li>
          <strong>Let AI discover context</strong> — Don&apos;t manually list imports, XibeCode
          finds them automatically
        </li>
      </ul>

      <h2>Next Steps</h2>
      <ul>
        <li><a href="/docs/configuration">Configure XibeCode</a> for your workflow</li>
        <li><a href="/docs/plugins">Create custom plugins</a></li>
        <li><a href="/updates">See what&apos;s coming next</a></li>
      </ul>
    </div>
  );
}
