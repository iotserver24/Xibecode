export default function PluginsPage() {
  return (
    <div>
      <h1>Plugin System</h1>
      <p>
        XibeCode&apos;s plugin system lets you extend the AI with custom tools and
        domain-specific logic. Plugins are JavaScript modules that register new tool
        definitions.
      </p>

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
              }
            },
            required: ['branch']
          }
        },
        async handler(input) {
          // Your custom logic here
          return {
            success: true,
            deployed: true,
            branch: input.branch
          };
        }
      }
    ];
  },

  initialize() {
    console.log('My plugin loaded!');
  }
};`}</code></pre>

      <h2>Loading Plugins</h2>
      <p>Add plugin paths to your XibeCode configuration:</p>
      <pre><code>{`// ~/.xibecode/config.json
{
  "plugins": [
    "/absolute/path/to/my-plugin.js",
    "./relative/path/to/plugin.js"
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
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>name</code></td>
            <td><code>string</code></td>
            <td>Unique plugin name</td>
          </tr>
          <tr>
            <td><code>version</code></td>
            <td><code>string</code></td>
            <td>Semver version string</td>
          </tr>
          <tr>
            <td><code>description</code></td>
            <td><code>string</code></td>
            <td>What the plugin does</td>
          </tr>
          <tr>
            <td><code>registerTools()</code></td>
            <td><code>Tool[]</code></td>
            <td>Returns array of tool definitions</td>
          </tr>
          <tr>
            <td><code>initialize()</code></td>
            <td><code>void</code></td>
            <td>Optional setup hook</td>
          </tr>
        </tbody>
      </table>

      <h2>Tool Schema</h2>
      <p>Each tool follows the Anthropic tool use schema:</p>
      <pre><code>{`{
  schema: {
    name: 'tool_name',           // Unique identifier
    description: 'What it does', // Shown to the AI
    input_schema: {
      type: 'object',
      properties: { ... },       // Input parameters
      required: [...]            // Required params
    }
  },
  handler: async (input) => {    // Execution logic
    return { result: '...' };
  }
}`}</code></pre>

      <h2>Plugin Examples</h2>

      <h3>Database Migrations</h3>
      <pre><code>{`registerTools() {
  return [{
    schema: {
      name: 'run_migration',
      description: 'Run database migration',
      input_schema: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down'] }
        },
        required: ['direction']
      }
    },
    async handler(input) {
      // Run migration logic
      return { success: true, direction: input.direction };
    }
  }];
}`}</code></pre>

      <h3>Internal API Integration</h3>
      <pre><code>{`registerTools() {
  return [{
    schema: {
      name: 'query_internal_api',
      description: 'Query internal company API',
      input_schema: {
        type: 'object',
        properties: {
          endpoint: { type: 'string' },
          method: { type: 'string', enum: ['GET', 'POST'] }
        },
        required: ['endpoint']
      }
    },
    async handler(input) {
      const res = await fetch(input.endpoint);
      return await res.json();
    }
  }];
}`}</code></pre>

      <h2>Best Practices</h2>
      <ul>
        <li>Give tools clear, descriptive names and descriptions — the AI reads them</li>
        <li>Handle errors gracefully and return useful error messages</li>
        <li>Keep plugins focused — one concern per plugin</li>
        <li>Use the <code>initialize()</code> hook for setup tasks like connecting to databases</li>
      </ul>

      <h2>Next Steps</h2>
      <ul>
        <li><a href="/docs/mcp">MCP Integration</a> for connecting to external servers</li>
        <li><a href="/docs/examples">Examples</a> for real-world workflows</li>
      </ul>
    </div>
  );
}
