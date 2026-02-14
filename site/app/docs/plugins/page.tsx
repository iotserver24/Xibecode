export default function PluginsPage() {
  return (
    <div>
      <h1>Plugin System</h1>
      <p>
        XibeCode&apos;s plugin system lets you extend the AI with custom tools and
        domain-specific logic. Plugins are JavaScript/TypeScript modules that register new tool
        definitions that the AI can use during autonomous execution.
      </p>

      <h2>Why Use Plugins?</h2>
      <ul>
        <li><strong>Custom Tools</strong> — Add tools specific to your workflow</li>
        <li><strong>Domain Logic</strong> — Integrate with internal APIs and services</li>
        <li><strong>Automation</strong> — Create deployment, testing, or CI/CD tools</li>
        <li><strong>Data Access</strong> — Connect to databases, APIs, or file systems</li>
      </ul>

      <h2>Quick Start</h2>
      <pre><code>{`# 1. Create a plugin file
touch my-plugin.js

# 2. Add it to your config
xibecode config --show
# Edit ~/.xibecode/config.json to add:
# "plugins": ["/path/to/my-plugin.js"]

# 3. Reload XibeCode
xibecode chat
> /reload`}</code></pre>

      <h2>Creating a Plugin</h2>
      <p>
        A plugin is a JavaScript/TypeScript file that exports a default object with
        metadata and a <code>registerTools()</code> method:
      </p>
      <pre><code>{`// my-plugin.js
export default {
  name: 'my-custom-plugin',
  version: '1.0.0',
  description: 'Adds custom tools for my workflow',

  registerTools() {
    return [
      {
        schema: {
          name: 'deploy_to_staging',
          description: 'Deploy the app to staging environment',
          input_schema: {
            type: 'object',
            properties: {
              branch: {
                type: 'string',
                description: 'Branch to deploy'
              },
              force: {
                type: 'boolean',
                description: 'Force deploy even if tests fail'
              }
            },
            required: ['branch']
          }
        },
        async handler(input) {
          // Your custom logic here
          console.log(\`Deploying \${input.branch} to staging...\`);

          // Simulate deployment
          await new Promise(resolve => setTimeout(resolve, 2000));

          return {
            success: true,
            deployed: true,
            branch: input.branch,
            url: 'https://staging.example.com'
          };
        }
      }
    ];
  },

  // Optional: Called when plugin is loaded
  initialize() {
    console.log('My plugin loaded!');
  },

  // Optional: Called when plugin is unloaded
  cleanup() {
    console.log('My plugin unloaded!');
  }
};`}</code></pre>

      <h2>Loading Plugins</h2>
      <p>Add plugin paths to your XibeCode configuration:</p>
      <pre><code>{`// ~/.xibecode/config.json
{
  "plugins": [
    "/absolute/path/to/my-plugin.js",
    "./relative/path/to/plugin.js",
    "~/plugins/deploy-plugin.js"
  ]
}`}</code></pre>
      <p>View your current config:</p>
      <pre><code>xibecode config --show</code></pre>

      <h2>Plugin API</h2>
      <table>
        <thead>
          <tr>
            <th>Property</th>
            <th>Type</th>
            <th>Required</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>name</code></td>
            <td><code>string</code></td>
            <td>Yes</td>
            <td>Unique plugin identifier</td>
          </tr>
          <tr>
            <td><code>version</code></td>
            <td><code>string</code></td>
            <td>Yes</td>
            <td>Semver version string</td>
          </tr>
          <tr>
            <td><code>description</code></td>
            <td><code>string</code></td>
            <td>Yes</td>
            <td>What the plugin does</td>
          </tr>
          <tr>
            <td><code>registerTools()</code></td>
            <td><code>Tool[]</code></td>
            <td>Yes</td>
            <td>Returns array of tool definitions</td>
          </tr>
          <tr>
            <td><code>initialize()</code></td>
            <td><code>void</code></td>
            <td>No</td>
            <td>Setup hook (connections, state)</td>
          </tr>
          <tr>
            <td><code>cleanup()</code></td>
            <td><code>void</code></td>
            <td>No</td>
            <td>Cleanup hook (close connections)</td>
          </tr>
        </tbody>
      </table>

      <h2>Tool Schema</h2>
      <p>Each tool follows the Anthropic tool use schema:</p>
      <pre><code>{`{
  schema: {
    name: 'tool_name',           // Unique identifier (snake_case)
    description: 'What it does', // Shown to the AI - be descriptive!
    input_schema: {
      type: 'object',
      properties: {
        param1: {
          type: 'string',
          description: 'Description of param1'
        },
        param2: {
          type: 'number',
          description: 'Description of param2'
        },
        param3: {
          type: 'boolean',
          description: 'Description of param3'
        },
        param4: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of strings'
        }
      },
      required: ['param1']  // Required parameters
    }
  },
  handler: async (input) => {
    // Execution logic
    // Return result as object or string
    return { result: '...' };
  }
}`}</code></pre>

      <h2>Plugin Examples</h2>

      <h3>Deployment Plugin</h3>
      <pre><code>{`export default {
  name: 'deploy-plugin',
  version: '1.0.0',
  description: 'Deployment tools for staging and production',

  registerTools() {
    return [
      {
        schema: {
          name: 'deploy_to_staging',
          description: 'Deploy the current branch to staging',
          input_schema: {
            type: 'object',
            properties: {
              branch: { type: 'string', description: 'Branch name' }
            },
            required: ['branch']
          }
        },
        async handler(input) {
          const { execSync } = await import('child_process');
          execSync(\`git push origin \${input.branch}:staging\`);
          return { success: true, environment: 'staging' };
        }
      },
      {
        schema: {
          name: 'check_deployment_status',
          description: 'Check if deployment is complete',
          input_schema: {
            type: 'object',
            properties: {
              environment: { type: 'string', enum: ['staging', 'production'] }
            },
            required: ['environment']
          }
        },
        async handler(input) {
          // Check deployment status
          return { status: 'deployed', environment: input.environment };
        }
      }
    ];
  }
};`}</code></pre>

      <h3>Database Migration Plugin</h3>
      <pre><code>{`export default {
  name: 'migration-plugin',
  version: '1.0.0',
  description: 'Database migration tools',

  registerTools() {
    return [
      {
        schema: {
          name: 'run_migration',
          description: 'Run database migration',
          input_schema: {
            type: 'object',
            properties: {
              direction: {
                type: 'string',
                enum: ['up', 'down'],
                description: 'Migration direction'
              },
              steps: {
                type: 'number',
                description: 'Number of migrations to run'
              }
            },
            required: ['direction']
          }
        },
        async handler(input) {
          const { execSync } = await import('child_process');
          const cmd = input.direction === 'up'
            ? 'npx prisma migrate deploy'
            : 'npx prisma migrate reset --skip-seed';
          execSync(cmd, { stdio: 'inherit' });
          return { success: true, direction: input.direction };
        }
      },
      {
        schema: {
          name: 'generate_migration',
          description: 'Generate a new migration',
          input_schema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Migration name' }
            },
            required: ['name']
          }
        },
        async handler(input) {
          const { execSync } = await import('child_process');
          execSync(\`npx prisma migrate dev --name \${input.name}\`);
          return { success: true, migration: input.name };
        }
      }
    ];
  }
};`}</code></pre>

      <h3>Internal API Integration</h3>
      <pre><code>{`export default {
  name: 'internal-api-plugin',
  version: '1.0.0',
  description: 'Connect to internal company APIs',

  initialize() {
    // Set up API client
    this.apiBase = process.env.INTERNAL_API_URL;
    this.apiKey = process.env.INTERNAL_API_KEY;
  },

  registerTools() {
    const apiBase = this.apiBase;
    const apiKey = this.apiKey;

    return [
      {
        schema: {
          name: 'query_internal_api',
          description: 'Query internal company API',
          input_schema: {
            type: 'object',
            properties: {
              endpoint: { type: 'string', description: 'API endpoint' },
              method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
              body: { type: 'object', description: 'Request body (for POST/PUT)' }
            },
            required: ['endpoint']
          }
        },
        async handler(input) {
          const res = await fetch(\`\${apiBase}\${input.endpoint}\`, {
            method: input.method || 'GET',
            headers: {
              'Authorization': \`Bearer \${apiKey}\`,
              'Content-Type': 'application/json'
            },
            body: input.body ? JSON.stringify(input.body) : undefined
          });
          return await res.json();
        }
      }
    ];
  }
};`}</code></pre>

      <h3>Notification Plugin</h3>
      <pre><code>{`export default {
  name: 'notification-plugin',
  version: '1.0.0',
  description: 'Send notifications via Slack or email',

  registerTools() {
    return [
      {
        schema: {
          name: 'send_slack_message',
          description: 'Send a message to Slack',
          input_schema: {
            type: 'object',
            properties: {
              channel: { type: 'string', description: 'Slack channel' },
              message: { type: 'string', description: 'Message text' }
            },
            required: ['channel', 'message']
          }
        },
        async handler(input) {
          const webhookUrl = process.env.SLACK_WEBHOOK_URL;
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channel: input.channel,
              text: input.message
            })
          });
          return { success: true, channel: input.channel };
        }
      }
    ];
  }
};`}</code></pre>

      <h2>TypeScript Plugins</h2>
      <p>For TypeScript plugins, compile to JavaScript first or use ts-node:</p>
      <pre><code>{`// my-plugin.ts
import type { Plugin, Tool } from 'xibecode';

const plugin: Plugin = {
  name: 'typescript-plugin',
  version: '1.0.0',
  description: 'A TypeScript plugin',

  registerTools(): Tool[] {
    return [
      {
        schema: {
          name: 'my_typed_tool',
          description: 'A strongly typed tool',
          input_schema: {
            type: 'object',
            properties: {
              value: { type: 'string' }
            },
            required: ['value']
          }
        },
        async handler(input: { value: string }) {
          return { result: input.value.toUpperCase() };
        }
      }
    ];
  }
};

export default plugin;`}</code></pre>

      <h2>Error Handling</h2>
      <p>Handle errors gracefully in your tool handlers:</p>
      <pre><code>{`async handler(input) {
  try {
    // Your logic here
    const result = await someOperation(input);
    return { success: true, data: result };
  } catch (error) {
    // Return error info to the AI
    return {
      success: false,
      error: error.message,
      suggestion: 'Try checking if the service is running'
    };
  }
}`}</code></pre>

      <h2>Best Practices</h2>
      <ul>
        <li>
          <strong>Clear descriptions</strong> — The AI reads tool descriptions to decide when to use them.
          Be specific about what the tool does and when to use it.
        </li>
        <li>
          <strong>Handle errors gracefully</strong> — Return useful error messages that help the AI understand
          what went wrong and how to fix it.
        </li>
        <li>
          <strong>Keep plugins focused</strong> — One concern per plugin. Deployment tools in one plugin,
          database tools in another.
        </li>
        <li>
          <strong>Use initialize() for setup</strong> — Set up database connections, API clients, and state
          in the initialize hook.
        </li>
        <li>
          <strong>Use cleanup() for teardown</strong> — Close connections and clean up resources in the
          cleanup hook.
        </li>
        <li>
          <strong>Validate inputs</strong> — Check that required inputs are present and valid before
          proceeding.
        </li>
        <li>
          <strong>Return structured data</strong> — Return objects with clear success/failure status and
          relevant data.
        </li>
      </ul>

      <h2>Debugging Plugins</h2>
      <pre><code>{`# Check if plugin is loaded
xibecode chat
> /plugins

# View available tools from plugins
> /tools

# Test a plugin tool
> Use the deploy_to_staging tool with branch "main"`}</code></pre>

      <h2>Next Steps</h2>
      <ul>
        <li><a href="/docs/mcp">MCP Integration</a> for connecting to external servers</li>
        <li><a href="/docs/tools">Tools Reference</a> for built-in tools</li>
        <li><a href="/docs/examples">Examples</a> for real-world workflows</li>
      </ul>
    </div>
  );
}
