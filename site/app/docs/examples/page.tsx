export default function ExamplesPage() {
  return (
    <div>
      <h1>Examples &amp; Workflows</h1>
      <p>
        Real-world examples showing how to use XibeCode for common development tasks.
        Each example demonstrates autonomous AI-assisted coding.
      </p>

      <h2>Building Features</h2>

      <h3>Add User Authentication</h3>
      <pre><code>{`xibecode run "Add JWT authentication:
1. Install jsonwebtoken and bcrypt
2. Create auth middleware
3. Add /login and /register endpoints
4. Protect existing routes
5. Add tests"`}</code></pre>
      <p>XibeCode will autonomously:</p>
      <ol>
        <li>Install dependencies using your preferred package manager</li>
        <li>Create the auth middleware file matching your code style</li>
        <li>Read your existing app structure</li>
        <li>Add auth routes with proper error handling</li>
        <li>Write and run tests to verify</li>
      </ol>

      <h3>Create a REST API</h3>
      <pre><code>{`xibecode run "Create a REST API with Express for a todo app:
- GET /todos - List all todos
- POST /todos - Create a todo
- PUT /todos/:id - Update a todo
- DELETE /todos/:id - Delete a todo
- Add input validation
- Include error handling"`}</code></pre>

      <h3>Add Database Integration</h3>
      <pre><code>{`xibecode run "Add PostgreSQL database integration:
- Set up Prisma ORM
- Create user and post models
- Add migration scripts
- Create seed data"`}</code></pre>

      <h3>Build a React Component</h3>
      <pre><code>{`xibecode run "Create a DataTable component in React:
- Sortable columns
- Pagination
- Search/filter functionality
- Loading and empty states
- Use TypeScript and Tailwind CSS"`}</code></pre>

      <h2>Fixing Bugs</h2>

      <h3>Debug Failing Tests</h3>
      <pre><code>xibecode run &quot;The tests in test/user.test.js are failing. Debug and fix.&quot; --verbose --mode debugger</code></pre>
      <p>XibeCode (as Dex the Debugger) will:</p>
      <ol>
        <li>Run the tests to see the exact error</li>
        <li>Read the test file and source code</li>
        <li>Identify the root cause</li>
        <li>Apply a minimal, targeted fix</li>
        <li>Re-run tests to verify the fix works</li>
      </ol>

      <h3>Fix a Production Error</h3>
      <pre><code>{`xibecode run "Production error: 'Cannot read property x of undefined'
in userController.js line 42. Fix it." --verbose --mode debugger`}</code></pre>

      <h3>Fix Type Errors</h3>
      <pre><code>{`xibecode run "Fix all TypeScript errors in the src/ directory" --verbose`}</code></pre>

      <h3>Fix Linting Errors</h3>
      <pre><code>xibecode run &quot;Fix linting errors in changed files&quot; --changed-only</code></pre>

      <h3>Memory Leak Investigation</h3>
      <pre><code>{`xibecode run "There's a memory leak in the WebSocket handler.
Investigate and fix it." --mode debugger --verbose`}</code></pre>

      <h2>Refactoring</h2>

      <h3>Convert to TypeScript</h3>
      <pre><code>{`xibecode run "Refactor src/ to use TypeScript:
- Convert all .js files to .ts
- Add type annotations
- Create types.ts for shared types
- Update tsconfig.json
- Fix any type errors"`}</code></pre>

      <h3>Improve Code Quality</h3>
      <pre><code>xibecode run &quot;Refactor the authentication module to follow SOLID principles&quot;</code></pre>

      <h3>Extract Common Logic</h3>
      <pre><code>{`xibecode run "Extract duplicate validation logic into a shared utils file:
- Find all validation patterns
- Create a validation.ts utility
- Update all files to use the new utility
- Add tests for the utility"`}</code></pre>

      <h3>Modernize Legacy Code</h3>
      <pre><code>{`xibecode run "Modernize the callback-based API to use async/await:
- Convert callbacks to Promises
- Use async/await syntax
- Maintain backwards compatibility
- Update tests"`}</code></pre>

      <h2>Testing</h2>

      <h3>Generate Tests for a Module</h3>
      <pre><code>{`xibecode run "Write comprehensive tests for userController.js:
- Test all endpoints
- Test error cases and edge cases
- Test validation
- Use Jest
- Achieve >80% coverage" --mode tester`}</code></pre>

      <h3>Add Integration Tests</h3>
      <pre><code>{`xibecode run "Add integration tests for the checkout flow:
- Test the complete purchase flow
- Test payment processing
- Test inventory updates
- Test email notifications" --mode tester`}</code></pre>

      <h3>Fix Flaky Tests</h3>
      <pre><code>{`xibecode run "The test 'should handle concurrent requests' is flaky.
Investigate and fix it." --mode debugger`}</code></pre>

      <h2>Code Review &amp; Security</h2>

      <h3>Security Audit</h3>
      <pre><code>{`xibecode run "Perform a security audit on the auth module:
- Check for injection vulnerabilities
- Review authentication flow
- Check for data exposure risks
- Suggest improvements" --mode security`}</code></pre>

      <h3>Code Review</h3>
      <pre><code>{`xibecode run "Review the recent changes in the payment module:
- Check code quality
- Identify potential issues
- Suggest improvements" --mode review`}</code></pre>

      <h3>Dependency Audit</h3>
      <pre><code>{`xibecode run "Check all dependencies for security vulnerabilities
and suggest updates" --mode security`}</code></pre>

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
- Add missing documentation
- Generate a summary of changes"`}</code></pre>

      <h2>Using Different Modes</h2>

      <h3>Planning Mode</h3>
      <pre><code>{`xibecode run "Analyze the codebase and create a plan for adding
real-time notifications" --mode plan`}</code></pre>
      <p>Aria the Architect will analyze the codebase and create a detailed plan without making changes.</p>

      <h3>Debug Mode</h3>
      <pre><code>{`xibecode run "The API is returning 500 errors intermittently.
Investigate and fix." --mode debugger`}</code></pre>
      <p>Dex the Debugger will systematically investigate and apply targeted fixes.</p>

      <h3>Team Leader Mode</h3>
      <pre><code>{`xibecode run "Build a complete user management system with
registration, login, and profile editing" --mode team_leader`}</code></pre>
      <p>Arya the Team Leader will coordinate tasks and delegate to specialized agents.</p>

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

      <h2>Multi-Step Workflows</h2>

      <h3>Full Feature Implementation</h3>
      <pre><code>{`xibecode run "Implement a complete user profile system:
1. Create database schema for profiles
2. Add API endpoints (GET, PUT)
3. Create React components
4. Add form validation
5. Write tests
6. Update documentation"`}</code></pre>

      <h3>Migration Workflow</h3>
      <pre><code>{`xibecode run "Migrate from Express to Fastify:
1. Set up Fastify with similar middleware
2. Convert routes one by one
3. Update error handling
4. Update tests
5. Verify all endpoints work"`}</code></pre>

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
          <strong>Use the right mode</strong> — <code>--mode debugger</code> for bugs,
          <code>--mode tester</code> for tests
        </li>
        <li>
          <strong>Use verbose mode for complex tasks</strong> — <code>--verbose</code> shows every
          tool call
        </li>
        <li>
          <strong>Preview with dry-run</strong> — <code>--dry-run</code> for risky changes
        </li>
        <li>
          <strong>Break down huge tasks</strong> — Instead of &quot;Build entire platform&quot;, do it
          module by module
        </li>
        <li>
          <strong>Let AI discover context</strong> — Don&apos;t manually list imports, XibeCode
          finds them automatically
        </li>
        <li>
          <strong>Use checkpoints</strong> — Ask for checkpoints before major refactors
        </li>
      </ul>

      <h2>Next Steps</h2>
      <ul>
        <li><a href="/docs/modes">Agent Modes</a> — Learn about all 13 personas</li>
        <li><a href="/docs/tools">Tools Reference</a> — Explore all 95+ tools</li>
        <li><a href="/docs/configuration">Configure XibeCode</a> for your workflow</li>
        <li><a href="/docs/plugins">Create custom plugins</a></li>
        <li><a href="/updates">See what&apos;s coming next</a></li>
      </ul>
    </div>
  );
}
