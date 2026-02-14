export default function ModesPage() {
  return (
    <div>
      <h1>Agent Modes</h1>
      <p>
        XibeCode features 13 specialized agent modes (personas), each optimized for different
        types of tasks. Each mode has a unique personality, set of allowed tools, and behavioral
        characteristics.
      </p>

      <h2>Quick Reference</h2>
      <table>
        <thead>
          <tr>
            <th>Mode</th>
            <th>Persona</th>
            <th>Best For</th>
            <th>Can Modify</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>agent</code></td>
            <td>Blaze the Builder</td>
            <td>Full-stack development</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td><code>plan</code></td>
            <td>Aria the Architect</td>
            <td>Planning, analysis</td>
            <td>No</td>
          </tr>
          <tr>
            <td><code>debugger</code></td>
            <td>Dex the Detective</td>
            <td>Bug hunting, fixing</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td><code>tester</code></td>
            <td>Tess the QA Engineer</td>
            <td>Testing, quality</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td><code>security</code></td>
            <td>Sentinel the Guardian</td>
            <td>Security audits</td>
            <td>No</td>
          </tr>
          <tr>
            <td><code>review</code></td>
            <td>Nova the Critic</td>
            <td>Code reviews</td>
            <td>No</td>
          </tr>
          <tr>
            <td><code>engineer</code></td>
            <td>Alex the Implementer</td>
            <td>Feature implementation</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td><code>architect</code></td>
            <td>Anna the Designer</td>
            <td>System design</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td><code>team_leader</code></td>
            <td>Arya the Leader</td>
            <td>Task orchestration</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td><code>researcher</code></td>
            <td>Sanvi the Scholar</td>
            <td>Deep research</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td><code>seo</code></td>
            <td>Siri the Optimizer</td>
            <td>SEO, web optimization</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td><code>product</code></td>
            <td>Agni the Strategist</td>
            <td>Product strategy</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td><code>data</code></td>
            <td>David the Analyst</td>
            <td>Data analysis</td>
            <td>Yes</td>
          </tr>
        </tbody>
      </table>

      <h2>Switching Modes</h2>
      <pre><code>{`# Via CLI flag
xibecode run "task" --mode plan
xibecode run "task" --mode debugger

# In chat mode
xibecode chat
> /mode plan
> /mode agent`}</code></pre>

      <h2>Development Modes</h2>

      <h3>Agent Mode (Default)</h3>
      <p><strong>Persona:</strong> Blaze the Builder 🤖</p>
      <p><strong>Description:</strong> Full autonomous coding with all capabilities enabled.</p>
      <p><strong>Best For:</strong></p>
      <ul>
        <li>Building new features</li>
        <li>Full-stack development</li>
        <li>Multi-step coding tasks</li>
        <li>Installing dependencies</li>
        <li>Running tests and commands</li>
      </ul>
      <p><strong>Capabilities:</strong></p>
      <ul>
        <li>Read and modify files</li>
        <li>Create new files and directories</li>
        <li>Run shell commands</li>
        <li>Execute tests</li>
        <li>Git operations (read and write)</li>
        <li>Web search and fetch</li>
      </ul>
      <pre><code>xibecode run &quot;Add a user authentication system&quot; --mode agent</code></pre>

      <h3>Engineer Mode</h3>
      <p><strong>Persona:</strong> Alex the Implementer 🛠️</p>
      <p><strong>Description:</strong> Focused implementation mode for building features.</p>
      <p><strong>Best For:</strong></p>
      <ul>
        <li>Implementing specific features</li>
        <li>Writing clean, maintainable code</li>
        <li>Following specifications</li>
        <li>Writing tests for implementations</li>
      </ul>
      <pre><code>xibecode run &quot;Implement the checkout flow&quot; --mode engineer</code></pre>

      <h2>Planning &amp; Analysis Modes</h2>

      <h3>Plan Mode</h3>
      <p><strong>Persona:</strong> Aria the Architect 📋</p>
      <p><strong>Description:</strong> Read-only mode for planning and analysis without modifications.</p>
      <p><strong>Best For:</strong></p>
      <ul>
        <li>Understanding codebases</li>
        <li>Creating implementation plans</li>
        <li>Architectural analysis</li>
        <li>Risk assessment</li>
        <li>Technical documentation</li>
      </ul>
      <p><strong>Restrictions:</strong> Cannot modify files, dry-run enabled by default.</p>
      <pre><code>xibecode run &quot;Analyze this codebase and suggest improvements&quot; --mode plan</code></pre>

      <h3>Architect Mode</h3>
      <p><strong>Persona:</strong> Anna the Designer 🏛️</p>
      <p><strong>Description:</strong> System design and high-level architecture planning.</p>
      <p><strong>Best For:</strong></p>
      <ul>
        <li>System design documents</li>
        <li>Component architecture</li>
        <li>Tech stack selection</li>
        <li>Design patterns</li>
        <li>Scalability planning</li>
      </ul>
      <pre><code>xibecode run &quot;Design the microservices architecture&quot; --mode architect</code></pre>

      <h3>Researcher Mode</h3>
      <p><strong>Persona:</strong> Sanvi the Scholar 📚</p>
      <p><strong>Description:</strong> Deep research and investigation mode.</p>
      <p><strong>Best For:</strong></p>
      <ul>
        <li>Investigating complex topics</li>
        <li>Reading documentation</li>
        <li>Analyzing papers and specs</li>
        <li>Synthesizing information</li>
      </ul>
      <pre><code>xibecode run &quot;Research best practices for API rate limiting&quot; --mode researcher</code></pre>

      <h2>Quality &amp; Testing Modes</h2>

      <h3>Debugger Mode</h3>
      <p><strong>Persona:</strong> Dex the Detective 🐛</p>
      <p><strong>Description:</strong> Systematic debugging and root cause analysis.</p>
      <p><strong>Best For:</strong></p>
      <ul>
        <li>Finding and fixing bugs</li>
        <li>Analyzing error messages</li>
        <li>Root cause investigation</li>
        <li>Targeted, surgical fixes</li>
      </ul>
      <p><strong>Approach:</strong></p>
      <ol>
        <li>Reproduce the issue</li>
        <li>Isolate the root cause</li>
        <li>Apply minimal fix</li>
        <li>Verify the fix works</li>
      </ol>
      <pre><code>xibecode run &quot;The login form is not working. Fix it.&quot; --mode debugger</code></pre>

      <h3>Tester Mode</h3>
      <p><strong>Persona:</strong> Tess the QA Engineer 🧪</p>
      <p><strong>Description:</strong> Comprehensive testing and quality assurance.</p>
      <p><strong>Best For:</strong></p>
      <ul>
        <li>Writing unit tests</li>
        <li>Integration testing</li>
        <li>Test coverage improvement</li>
        <li>TDD workflows</li>
      </ul>
      <pre><code>xibecode run &quot;Write tests for the user service&quot; --mode tester</code></pre>

      <h3>Review Mode</h3>
      <p><strong>Persona:</strong> Nova the Critic 👀</p>
      <p><strong>Description:</strong> Code review and quality analysis (read-only).</p>
      <p><strong>Best For:</strong></p>
      <ul>
        <li>Code quality review</li>
        <li>Best practices check</li>
        <li>Performance analysis</li>
        <li>Maintainability assessment</li>
      </ul>
      <p><strong>Restrictions:</strong> Cannot modify files.</p>
      <pre><code>xibecode run &quot;Review the authentication module&quot; --mode review</code></pre>

      <h3>Security Mode</h3>
      <p><strong>Persona:</strong> Sentinel the Guardian 🔒</p>
      <p><strong>Description:</strong> Security analysis and vulnerability detection (read-only).</p>
      <p><strong>Best For:</strong></p>
      <ul>
        <li>Security audits</li>
        <li>Vulnerability scanning</li>
        <li>Injection attack detection</li>
        <li>Authentication review</li>
        <li>Data exposure analysis</li>
      </ul>
      <p><strong>Restrictions:</strong> Cannot modify files, requires confirmation.</p>
      <pre><code>xibecode run &quot;Perform a security audit&quot; --mode security</code></pre>

      <h2>Specialized Modes</h2>

      <h3>Team Leader Mode</h3>
      <p><strong>Persona:</strong> Arya the Leader 👑</p>
      <p><strong>Description:</strong> Task coordination and delegation to other modes.</p>
      <p><strong>Best For:</strong></p>
      <ul>
        <li>Complex multi-step projects</li>
        <li>Coordinating multiple concerns</li>
        <li>Breaking down large tasks</li>
      </ul>
      <p>
        The Team Leader delegates tasks to specialized agents (Engineer, Architect, Tester, etc.)
        rather than implementing directly.
      </p>
      <pre><code>xibecode run &quot;Build a complete e-commerce system&quot; --mode team_leader</code></pre>

      <h3>Product Mode</h3>
      <p><strong>Persona:</strong> Agni the Strategist 🔥</p>
      <p><strong>Description:</strong> Product requirements and user stories.</p>
      <p><strong>Best For:</strong></p>
      <ul>
        <li>Requirements gathering</li>
        <li>User stories</li>
        <li>Feature prioritization</li>
        <li>PRD creation</li>
      </ul>
      <pre><code>xibecode run &quot;Create user stories for the dashboard&quot; --mode product</code></pre>

      <h3>SEO Mode</h3>
      <p><strong>Persona:</strong> Siri the Optimizer 🌐</p>
      <p><strong>Description:</strong> SEO and web optimization.</p>
      <p><strong>Best For:</strong></p>
      <ul>
        <li>Keyword research</li>
        <li>On-page SEO</li>
        <li>Meta tag optimization</li>
        <li>Web performance</li>
      </ul>
      <pre><code>xibecode run &quot;Optimize the landing page for SEO&quot; --mode seo</code></pre>

      <h3>Data Mode</h3>
      <p><strong>Persona:</strong> David the Analyst 📊</p>
      <p><strong>Description:</strong> Data processing and analysis.</p>
      <p><strong>Best For:</strong></p>
      <ul>
        <li>Data analysis</li>
        <li>Log processing</li>
        <li>Metrics definition</li>
        <li>Data visualization prep</li>
      </ul>
      <pre><code>xibecode run &quot;Analyze the server logs for errors&quot; --mode data</code></pre>

      <h2>Tool Permissions by Mode</h2>
      <p>
        Each mode has access to specific tool categories:
      </p>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Description</th>
            <th>Modes with Access</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>read_only</code></td>
            <td>Read files</td>
            <td>All modes</td>
          </tr>
          <tr>
            <td><code>write_fs</code></td>
            <td>Write/edit files</td>
            <td>agent, engineer, tester, debugger, architect, team_leader, product, seo, data, researcher</td>
          </tr>
          <tr>
            <td><code>git_read</code></td>
            <td>Git status, diff</td>
            <td>All modes</td>
          </tr>
          <tr>
            <td><code>git_mutation</code></td>
            <td>Git commit, reset</td>
            <td>agent, engineer, tester, debugger</td>
          </tr>
          <tr>
            <td><code>shell_command</code></td>
            <td>Run commands</td>
            <td>agent, engineer, debugger, security, data</td>
          </tr>
          <tr>
            <td><code>tests</code></td>
            <td>Run tests</td>
            <td>agent, engineer, tester, debugger, security, review</td>
          </tr>
          <tr>
            <td><code>network</code></td>
            <td>Web search, fetch</td>
            <td>agent, engineer, seo, researcher</td>
          </tr>
          <tr>
            <td><code>context</code></td>
            <td>Code search</td>
            <td>All modes</td>
          </tr>
        </tbody>
      </table>

      <h2>Mode Transitions</h2>
      <p>
        Modes can automatically transition based on the task. For example:
      </p>
      <ul>
        <li>Plan mode may suggest switching to Agent mode for implementation</li>
        <li>Team Leader delegates to Engineer for coding tasks</li>
        <li>Agent can switch to Debugger when encountering bugs</li>
      </ul>
      <p>
        Configure auto-approval policy in your config:
      </p>
      <pre><code>{`{
  "autoApprovalPolicy": "always"  // always, prompt-only, never
}`}</code></pre>

      <h2>Best Practices</h2>
      <ul>
        <li>
          <strong>Start with Plan mode</strong> for complex tasks to understand the codebase first
        </li>
        <li>
          <strong>Use Debugger mode</strong> for bugs rather than Agent mode for more targeted fixes
        </li>
        <li>
          <strong>Use Security mode</strong> before deploying to production
        </li>
        <li>
          <strong>Use Review mode</strong> for code quality checks without modifications
        </li>
        <li>
          <strong>Use Team Leader</strong> for complex projects that span multiple concerns
        </li>
      </ul>

      <h2>Next Steps</h2>
      <ul>
        <li><a href="/docs/tools">Tools Reference</a> — Explore all 95+ tools</li>
        <li><a href="/docs/configuration">Configuration</a> — Configure mode behavior</li>
        <li><a href="/docs/examples">Examples</a> — See modes in action</li>
      </ul>
    </div>
  );
}
