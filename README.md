# XibeCode - AI Coding Assistant

> **Production-ready autonomous coding agent for your terminal**

XibeCode is a professional CLI tool that brings autonomous AI coding capabilities to your terminal. Like Claude Code, but open-source, customizable, and with advanced context management.

## 🆕 What's New in v0.1.8

**v0.1.8:**

- 📚 **Learn from Docs** - `/learn <name> <url>` scrapes documentation sites and auto-generates skills
- 🕷️ **Smart Crawling** - Follows internal links, scrapes up to 25 pages, extracts clean text
- 🧠 **Auto-Skill Generation** - Creates skill files in `.xibecode/skills/` from scraped docs
- 📊 **Progress Feedback** - Real-time progress as pages are fetched

**v0.1.7:**

- 🎓 **Skills System** - Activate specialized AI workflows with `/skill` command
- 🧹 **5 Built-in Skills** - refactor-clean-code, debug-production, write-tests, security-audit, optimize-performance
- 📚 **Custom Skills** - Create your own skills in `.xibecode/skills/` (markdown with YAML frontmatter)
- 🎯 **Smart Skill Injection** - Active skills inject specialized instructions into AI's system prompt
- 📊 **Status Bar Display** - See active skill in status bar

**v0.1.6:**

- 🔍 **Codebase Search** - New `grep_code` tool using ripgrep (grep fallback) for lightning-fast code search across your project
- 🌐 **Web Search** - New `web_search` tool powered by DuckDuckGo — free, no API key required
- 📄 **URL Fetching** - New `fetch_url` tool to read any webpage as clean text (HTML auto-stripped)
- 🧠 **Project Memory** - Persistent `.xibecode/memory.md` that saves project knowledge across sessions
- 🎯 **Verified Edit Tool** - `verified_edit` with old content verification prevents hallucinated edits
- 🛡️ **Safer Editing by Default** - AI uses `verified_edit` as primary editing method with smart fallbacks

**Previous Updates:**

- 🧪 **Test Integration** - Auto-detect & run tests (Vitest, Jest, pytest, Go test)
- 🔀 **Git Awareness** - Create checkpoints, check status, revert changes safely
- 🛡️ **Safety Controls** - Dry-run mode, risk assessment, command blocking
- 🔌 **Plugin System** - Extend XibeCode with custom tools
- 📦 **Smart Package Manager** - Prefers pnpm → bun → npm
- 🧠 **Enhanced Reasoning** - Advanced problem-solving, pattern recognition, and error handling
- 📡 **MCP Integration** - Connect to external MCP servers for extended capabilities

## 🎯 Key Features

### Core Capabilities

- ✅ **Autonomous Agent Loop** - AI iteratively works on tasks until completion
- ✅ **Smart Context Management** - Automatically loads related files (imports, tests, configs)
- ✅ **Advanced File Editing** - Search/replace, line-range edits, automatic backups
- ✅ **Cross-Platform** - Works on Windows, macOS, and Linux
- ✅ **Beautiful TUI** - Real-time progress, colored output, clear visualization
- ✅ **Loop Detection** - Prevents infinite loops and runaway executions
- ✅ **Multiple Edit Methods** - Smart edit, line-range edit, insert, revert

### 🆕 New Features

- ✅ **Web Search** - Search the web from within the AI (DuckDuckGo, free, no API key)
- ✅ **Codebase Search** - Ripgrep-powered code search across your entire project
- ✅ **URL Fetching** - Read any webpage as clean text for research
- ✅ **Project Memory** - Persist project knowledge across sessions in `.xibecode/memory.md`
- ✅ **Verified Editing** - Content-verified file edits that prevent AI mistakes
- ✅ **Test Integration** - Auto-detect and run tests (Vitest, Jest, pytest, Go test)
- ✅ **Git Awareness** - Check status, create checkpoints, revert changes safely
- ✅ **Dry-Run Mode** - Preview changes without making them
- ✅ **Safety Controls** - Risk assessment and command blocking for dangerous operations
- ✅ **Plugin System** - Extend XibeCode with custom tools and workflows

### 🎓 Skills System

XibeCode includes a **skills system** that activates specialized AI workflows for common tasks:

**Built-in Skills:**

- `refactor-clean-code` - Clean code principles & SOLID patterns
- `debug-production` - Systematic debugging workflow
- `write-tests` - Comprehensive testing with 80%+ coverage
- `security-audit` - OWASP Top 10 security checks
- `optimize-performance` - Performance profiling & optimization

**Usage:**

```bash
# In chat mode
/skill list                    # Show all skills
/skill refactor-clean-code     # Activate a skill
/skill off                     # Deactivate current skill
```

When a skill is active, the AI follows specialized instructions and best practices for that domain. Create custom skills in `.xibecode/skills/` (markdown files with YAML frontmatter).

### File Operations

- 📖 Read files (whole or partial for large files)
- 📝 Write files (create or overwrite)
- ✏️  Edit files (search/replace with automatic backups)
- 🎯 Verified edits (content verification before applying)
- ✂️  Edit specific line ranges
- ↩️  Revert to previous versions
- 🔍 Search files with glob patterns
- 🔎 Grep codebase with ripgrep
- 📁 List directories
- 🧠 Get intelligent context (related files)

### Web & Research

- 🌐 Search the web (DuckDuckGo, free)
- 📄 Fetch and read any URL as text
- 🧠 Project memory persistence

### Command Execution

- ⚡ Run shell commands
- 🔧 Cross-platform command support
- 📊 Capture stdout/stderr
- ✅ Exit code handling

## 📦 Installation

### From npm (Recommended)

```bash
npm install -g xibecode
```

### From Source

```bash
git clone https://github.com/iotserver24/xibecode
cd xibecode
npm install
npm run build
npm link
```

## 🚀 Quick Start

### 1. Set up API Key

```bash
# Interactive setup
xibecode config

# Or set directly
xibecode config --set-key YOUR_ANTHROPIC_API_KEY

# Or use environment variable
export ANTHROPIC_API_KEY=your_key_here
```

### 2. Run Your First Task

```bash
xibecode run "Create a Python script that prints hello world"
```

### 3. Try Interactive Chat

```bash
xibecode chat
```

## 💡 Usage

### Run Command (Autonomous Mode)

The main command for autonomous coding tasks:

```bash
xibecode run [prompt] [options]
```

**Options:**

- `-f, --file <path>` - Read prompt from a file
- `-m, --model <model>` - AI model to use (default: claude-sonnet-4-5-20250929)
- `-b, --base-url <url>` - Custom API base URL
- `-k, --api-key <key>` - API key (overrides config)
- `-d, --max-iterations <number>` - Maximum iterations (default: 50)
- `-v, --verbose` - Show detailed logs
- `--dry-run` - Preview changes without making them
- `--changed-only` - Focus only on git-changed files

**Examples:**

```bash
# Simple task
xibecode run "Create a REST API with Express"

# From file
xibecode run --file task.txt

# With verbose logging
xibecode run "Fix the bug in app.js" --verbose

# Using specific model
xibecode run "Optimize this code" --model claude-opus-4-5-20251101

# Custom API endpoint
xibecode run "task" --base-url https://custom-api.com

# New in v2.0: Dry-run mode
xibecode run "Refactor authentication" --dry-run

# Focus on git-changed files only
xibecode run "Fix linting errors" --changed-only

# Run tests after making changes
xibecode run "Add validation and run tests to verify"
```

### Chat Command (Interactive Mode)

For quick questions and iterative development:

```bash
xibecode chat [options]
```

**Options:**

- `-m, --model <model>` - AI model to use
- `-b, --base-url <url>` - Custom API base URL
- `-k, --api-key <key>` - API key

**Commands in chat:**

- `tools on/off` - Toggle tool execution
- `clear` - Clear screen
- `exit` or `quit` - Exit chat

**Example:**

```bash
$ xibecode chat

You: How do I implement JWT authentication?
Assistant: [explains JWT auth]

You: Write the code for it
Assistant: [writes code using tools]

You: Add it to my Express app
Assistant: [modifies app.js]
```

### Config Command

Manage your configuration:

```bash
# Interactive setup
xibecode config

# Quick operations
xibecode config --set-key YOUR_KEY
xibecode config --set-url https://custom-api.com
xibecode config --set-model claude-opus-4-5-20251101
xibecode config --show
xibecode config --reset
```

## 🎨 What Makes XibeCode Different

### 1. **Smart Context Management**

XibeCode automatically understands your project:

```bash
xibecode run "Add error handling to userController.js"
```

The AI will:

- Read `userController.js`
- Find and read imported files
- Check for related test files
- Look at config files (package.json, tsconfig.json)
- Make informed edits with full context

### 2. **Advanced File Editing**

Four ways to edit files, with verified_edit as the recommended default:

#### Verified Edit (DEFAULT - Most Reliable) 🎯

```javascript
// AI reads the file first, then provides old content for verification
{
  tool: "verified_edit",
  path: "app.js",
  start_line: 5,
  end_line: 5,
  old_content: "const port = 3000;",
  new_content: "const port = process.env.PORT || 3000;"
}
// If old_content doesn't match → edit is REJECTED and actual content is returned
// AI can then re-read and retry with correct content
```

#### Search/Replace (Fallback)

```javascript
{
  tool: "edit_file",
  path: "app.js",
  search: "const port = 3000;",
  replace: "const port = process.env.PORT || 3000;"
}
```

#### Line Range (For Large Files)

```javascript
{
  tool: "edit_lines",
  path: "app.js",
  start_line: 10,
  end_line: 15,
  new_content: "// Updated code here"
}
```

#### Insert (Add New Code)

```javascript
{
  tool: "insert_at_line",
  path: "app.js",
  line: 5,
  content: "const express = require('express');"
}
```

### 3. **Automatic Backups & Revert**

Every edit creates a backup. Made a mistake?

```bash
xibecode run "Revert app.js to previous version"
```

### 4. **Cross-Platform**

Works identically on:

- ✅ Windows (PowerShell)
- ✅ macOS (bash/zsh)
- ✅ Linux (bash)

The AI automatically uses the right commands for your OS.

### 5. **Beautiful Real-Time UI**

```
╔════════════════════════════════════════════════════════════╗
║                 XibeCode AI Agent                          ║
║              Autonomous Coding Assistant v0.1.5            ║
╚════════════════════════════════════════════════════════════╝

📋 Task:
  Create a REST API with Express

⚙️  Configuration:
   Model: claude-sonnet-4-5-20250929
   Max Iterations: 50

────────────────────────────────────────────────────────────

Iteration 1/50 (2%) - 0.5s
██░░░░░░░░░░░░░░░░░░░░░░░░░░░░

📖 read_file
  → package.json
✓ Success
  ← 25 lines

📝 write_file
  → src/server.js
✓ Success
  ← File created (45 lines)

💬 Assistant:
  I've created an Express server with the following endpoints...
```

## 🛠️ Advanced Features

### Custom API Endpoints

Use with Azure, AWS Bedrock, or custom Claude deployments:

```bash
# Via config
xibecode config --set-url https://your-custom-endpoint.com

# Via command
xibecode run "task" --base-url https://your-custom-endpoint.com
```

### Working with Large Files

For files >1000 lines, read in chunks:

```bash
xibecode run "Fix the bug around line 500 in large-file.js"
```

The AI will:

1. Read lines 450-550 (context around the area)
2. Make targeted edit using line numbers
3. Verify the change

### Project Context Understanding

```bash
xibecode run "Understand this project structure and suggest improvements"
```

The AI will use `get_context` to:

- Map import relationships
- Find test files
- Read configs
- Build a mental model

### Error Recovery

If something fails, the AI will:

1. Read the error message
2. Analyze what went wrong
3. Try a different approach
4. Can revert changes if needed

## 🧪 Test Integration

XibeCode automatically detects and runs your project tests:

```bash
# Fix failing tests
xibecode run "Fix the failing tests"

# Run tests after changes
xibecode run "Add validation to User model and ensure all tests pass"
```

**Supported test runners:**

- Node.js: Vitest, Jest, Mocha, Ava
- Python: pytest, unittest
- Go: `go test`

**Package manager detection:**

- Prioritizes: pnpm → bun → npm
- Detects from lock files (`pnpm-lock.yaml`, `bun.lockb`, `package-lock.json`)

**Example workflow:**

```bash
xibecode run "Refactor the authentication module:
1. Read the current code
2. Make improvements
3. Run tests to verify
4. Fix any test failures
5. Repeat until all tests pass"
```

## 🔀 Git Integration

Work smarter with git-aware workflows:

### Check Repository State

```bash
xibecode run "Show me the current git status"
```

The AI will use `get_git_status` to see:

- Current branch
- Staged/unstaged/untracked files
- Clean/dirty state
- Commits ahead/behind upstream

### Focus on Changed Files

```bash
xibecode run "Fix linting errors in changed files" --changed-only
```

The AI will:

- Get list of modified files with `get_git_changed_files`
- Focus edits only on those files
- More efficient for large codebases

### Create Safe Checkpoints

```bash
xibecode run "Refactor the database layer (create checkpoint first)"
```

The AI can:

- Create checkpoints with `create_git_checkpoint`
- Use git stash or commit strategy (configurable)
- Revert to checkpoints if something goes wrong

**Example:**

```javascript
// The AI executes:
create_git_checkpoint({
  message: "before refactoring database layer",
  strategy: "stash"  // or "commit"
})

// ... makes changes ...

// If needed:
revert_to_git_checkpoint({
  checkpoint_id: "stash@{0}",
  checkpoint_type: "stash",
  confirm: true
})
```

### Prepare Branches for Review

```bash
xibecode run "Prepare this branch for code review:
- Run tests
- Fix any linting errors
- Generate a summary of changes"
```

## 🔒 Safety Features

### Dry-Run Mode

Preview changes without making them:

```bash
xibecode run "Refactor the auth module" --dry-run
```

In dry-run mode:

- All file operations show what *would* happen
- No actual changes are made
- Git operations are simulated
- Perfect for testing complex tasks

**Example output:**

```
[DRY RUN] Would replace lines 15-20 with 8 new lines
[DRY RUN] Would write 150 lines to src/auth/index.ts
[DRY RUN] Would create stash checkpoint: "before auth refactor"
```

### Risk Assessment

XibeCode automatically assesses risk for operations:

**High-risk operations** (require extra care):

- Deleting files/directories
- Force push to git
- Destructive shell commands
- Reverting to checkpoints

**Blocked operations:**

- Fork bombs
- Deleting root/home directories
- Direct disk writes
- Extremely dangerous commands

**Example:**

```bash
$ xibecode run "Delete all test files"

⚠ HIGH RISK: Deletes files/directories permanently
  • Ensure backups exist before deletion
  • Suggestion: Consider using `mv` to move files to a temporary location first
```

### Safer Alternatives

XibeCode suggests safer alternatives for risky commands:

- `rm -rf` → "Use `mv` to move files first"
- `git push --force` → "Use `git push --force-with-lease`"
- `npm install` → "Use `pnpm install` or `bun install`"

## 🔌 Plugin System

Extend XibeCode with custom tools and domain-specific logic:

### Create a Plugin

```javascript
// my-plugin.js
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
              branch: { type: 'string', description: 'Branch to deploy' }
            },
            required: ['branch']
          }
        },
        async handler(input) {
          // Your custom logic here
          return { success: true, deployed: true, branch: input.branch };
        }
      }
    ];
  },

  initialize() {
    console.log('My plugin loaded!');
  }
};
```

### Load Plugins

```bash
# Via config
xibecode config --show

# Edit ~/.xibecode/config.json
{
  "plugins": [
    "/path/to/my-plugin.js",
    "./local-plugin.js"
  ]
}

# Or use directly
xibecode run "Deploy to staging" 
```

The AI will automatically have access to your custom tools!

### Plugin Examples

**Database migrations:**

```javascript
registerTools() {
  return [{
    schema: { name: 'run_migration', ... },
    handler: async (input) => {
      // Run database migration
    }
  }];
}
```

**Internal APIs:**

```javascript
registerTools() {
  return [{
    schema: { name: 'query_internal_api', ... },
    handler: async (input) => {
      // Call internal company API
    }
  }];
}
```

## 📊 Usage Examples

### Build a Feature

```bash
xibecode run "Add user authentication to the Express API:
- POST /auth/register
- POST /auth/login  
- JWT token generation
- Middleware to protect routes
- Hash passwords with bcrypt"
```

### Fix a Bug

```bash
xibecode run "The tests in test/user.test.js are failing. 
Debug and fix the issues." --verbose
```

### Refactor Code

```bash
xibecode run "Refactor src/ to use TypeScript:
- Convert all .js files to .ts
- Add type annotations
- Create types.ts for shared types
- Update tsconfig.json"
```

### Generate Tests

```bash
xibecode run "Write comprehensive tests for userController.js:
- Test all endpoints
- Test error cases
- Use Jest
- Achieve >80% coverage"
```

## ⚙️ Configuration

XibeCode stores config in `~/.xibecode/`

### Available Settings

```javascript
{
  "apiKey": "sk-ant-...",                 // Your Anthropic API key
  "baseUrl": "https://...",               // Custom API endpoint (optional)
  "model": "claude-sonnet-4-5-...",       // Default model
  "maxIterations": 50,                    // Default max iterations
  "defaultVerbose": false,                // Default verbose mode
  
  // New in v2.0
  "preferredPackageManager": "pnpm",      // Package manager: "pnpm", "bun", or "npm"
  "enableDryRunByDefault": false,         // Enable dry-run mode by default
  "gitCheckpointStrategy": "stash",       // Git checkpoint: "stash" or "commit"
  "testCommandOverride": "",              // Custom test command (optional)
  "plugins": [],                          // Array of plugin paths
  
  // Latest version
  "mcpServers": {}                        // MCP server configurations (object-based)
}
```

### Environment Variables

```bash
ANTHROPIC_API_KEY=your_key        # API key
ANTHROPIC_BASE_URL=https://...    # Custom endpoint
XIBECODE_MODEL=claude-opus-4-...  # Default model
```

Config priority: CLI flags > Environment > Config file

## 📡 MCP Integration (Model Context Protocol)

XibeCode supports the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/), enabling connection to external servers that provide additional tools, resources, and capabilities.

### What is MCP?

MCP is an open protocol that standardizes how applications provide context to LLMs. With MCP, you can:

- **Extend Tools**: Add tools from external servers (databases, APIs, etc.)
- **Access Resources**: Read data from external sources
- **Use Prompt Templates**: Leverage pre-built prompts from servers

### Adding an MCP Server

#### File-Based Configuration (Easiest - Recommended)

Edit the MCP servers configuration file directly:

```bash
# Show file path
xibecode mcp file

# Open file in your editor
xibecode mcp edit

# Or edit manually
nano ~/.xibecode/mcp-servers.json
```

**File Format** (`~/.xibecode/mcp-servers.json`):

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "mcp-server-filesystem",
      "args": ["--root", "/path/to/files"]
    },
    "github": {
      "command": "mcp-server-github",
      "args": ["--token", "YOUR_TOKEN"],
      "env": {
        "GITHUB_TOKEN": "your_token_here"
      }
    }
  }
}
```

> **Note:** The configuration format has been updated to use an object-based structure. If you have an existing configuration using the legacy array format with `"servers": [...]`, it will be automatically migrated to the new format when you run any MCP command.

**File Management Commands:**

```bash
# Create default file with examples
xibecode mcp init

# Reload servers from file (after editing)
xibecode mcp reload

# Show file path and status
xibecode mcp file
```

#### Commands

```bash
# Open file to add/edit servers
xibecode mcp add
# or
xibecode mcp edit

# List all configured servers
xibecode mcp list

# Remove a server (or edit file manually)
xibecode mcp remove filesystem

# Show file path
xibecode mcp file

# Reload after editing
xibecode mcp reload
```

#### Alternative Methods

**Via config command (interactive):**

```bash
xibecode config --add-mcp-server my-server
# Follow interactive prompts
```

**Via config menu:**

```bash
xibecode config
# Select "📡 Manage MCP Servers" → "➕ Add MCP Server"
```

### MCP Server Configuration

MCP servers support two transport types:

#### stdio Transport (Local Process)

For local MCP servers that run as a subprocess. Currently only stdio transport is supported:

**Note:** The MCP configuration now uses a simpler object-based format. Instead of command-line flags, edit the configuration file directly:

```bash
# Open the config file
xibecode mcp edit

# Add your server to the file using the new format:
{
  "mcpServers": {
    "filesystem": {
      "command": "mcp-server-filesystem",
      "args": ["--root", "/path/to/files"]
    }
  }
}
```

### Using MCP Tools

Once configured, MCP tools are automatically available to XibeCode:

```bash
# In chat mode, view MCP servers and tools
xibecode chat
> /mcp
```

MCP tools are prefixed with the server name (e.g., `filesystem::read_file`, `remote-api::query`).

### Popular MCP Servers

- **@modelcontextprotocol/server-filesystem** - File system access
- **@modelcontextprotocol/server-github** - GitHub API integration
- **@modelcontextprotocol/server-postgres** - PostgreSQL database access
- **@modelcontextprotocol/server-slack** - Slack integration
- **Custom servers** - Build your own with the MCP SDK

### Example: Adding GitHub MCP Server

```bash
# Install the GitHub MCP server
npm install -g @modelcontextprotocol/server-github

# Open the config file to add the server
xibecode mcp edit
# Edit the file and add:
# {
#   "mcpServers": {
#     "github": {
#       "command": "mcp-server-github",
#       "args": ["--token", "YOUR_GITHUB_TOKEN"]
#     }
#   }
# }

# Reload servers
xibecode mcp reload

# Now XibeCode can use GitHub tools
xibecode chat
> Create an issue in my repo about the bug we just found
```

## 🧠 Enhanced AI Capabilities

XibeCode includes advanced reasoning capabilities that enable it to:

### Systematic Problem Solving

- **Problem Decomposition**: Breaks complex tasks into manageable steps
- **Hypothesis-Driven Development**: Forms and tests hypotheses systematically
- **Root Cause Analysis**: Traces issues to their source, not just symptoms
- **Pattern Recognition**: Identifies design patterns and anti-patterns

### Advanced Context Awareness

- **Project Structure Understanding**: Maps dependencies and data flows
- **Change Impact Analysis**: Considers downstream effects before modifications
- **Historical Context**: Uses git history to understand code evolution
- **Cross-File Dependencies**: Tracks relationships between files

### Coding Best Practices

- **SOLID Principles**: Applies proper software design principles
- **Error Handling**: Structured error classification and recovery strategies
- **Performance Optimization**: Data structure selection and algorithm analysis
- **Security Best Practices**: Input validation, secure defaults, proper authentication

### Multi-Step Planning

- **Task Breakdown**: Decomposes large features into atomic steps
- **Dependency Mapping**: Identifies prerequisites and execution order
- **Milestone Definition**: Sets intermediate validation points
- **Rollback Planning**: Plans for failure scenarios and recovery

## 🔒 Safety Features

- **Loop Detection** - Stops if AI repeats the same action 3+ times
- **Max Iterations** - Hard limit on iterations (default: 50)
- **Automatic Backups** - Every edit is backed up
- **Revert Capability** - Can undo changes
- **Error Recovery** - Handles failures gracefully
- **Read-Before-Edit** - AI reads files before modifying

## 🚀 Performance

- **Startup**: <1 second
- **First response**: 2-5 seconds (API latency)
- **Tool execution**: Instant to seconds
- **Memory**: ~50MB typical
- **Context window**: 100k tokens (smart management)

## 📈 Comparison

| Feature | XibeCode | Claude Code | Aider |
|---------|----------|-------------|-------|
| Open Source | ✅ | ❌ | ✅ |
| Custom API URL | ✅ | ❌ | ✅ |
| Smart Context | ✅ | ✅ | ⚠️ |
| File Editing | ✅ Advanced | ✅ | ✅ |
| Cross-Platform | ✅ | ✅ | ✅ |
| Loop Detection | ✅ | ✅ | ❌ |
| Auto Backups | ✅ | ⚠️ | ❌ |
| Beautiful TUI | ✅ | ✅ | ⚠️ |
| Price | Free (your API) | $20/mo | Free |

## 🤝 Contributing

Contributions welcome! Please see CONTRIBUTING.md

## 📝 License

MIT

## 🙏 Credits

Built with:

- [@anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk)
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk)
- [Commander.js](https://github.com/tj/commander.js/)
- [Inquirer.js](https://github.com/SBoudrias/Inquirer.js/)
- [Chalk](https://github.com/chalk/chalk)
- [fast-glob](https://github.com/mrmlnc/fast-glob)

Inspired by [Claude Code](https://www.anthropic.com/news/claude-code) and [Aider](https://github.com/paul-gauthier/aider)

---

**Made with ❤️ for developers who love AI-assisted coding**

# XibeCode
