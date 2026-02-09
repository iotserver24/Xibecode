# XibeCode - AI Coding Assistant

> **Production-ready autonomous coding agent powered by Claude AI**

XibeCode is a professional CLI tool that brings autonomous AI coding capabilities to your terminal. Like Claude Code, but open-source, customizable, and with advanced context management.

## 🎯 Key Features

### Core Capabilities
- ✅ **Autonomous Agent Loop** - AI iteratively works on tasks until completion
- ✅ **Smart Context Management** - Automatically loads related files (imports, tests, configs)
- ✅ **Advanced File Editing** - Search/replace, line-range edits, automatic backups
- ✅ **Cross-Platform** - Works on Windows, macOS, and Linux
- ✅ **Beautiful TUI** - Real-time progress, colored output, clear visualization
- ✅ **Loop Detection** - Prevents infinite loops and runaway executions
- ✅ **Multiple Edit Methods** - Smart edit, line-range edit, insert, revert

### File Operations
- 📖 Read files (whole or partial for large files)
- 📝 Write files (create or overwrite)
- ✏️  Edit files (search/replace with automatic backups)
- ✂️  Edit specific line ranges
- ↩️  Revert to previous versions
- 🔍 Search files with glob patterns
- 📁 List directories
- 🧠 Get intelligent context (related files)

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
git clone https://github.com/yourusername/xibecode
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

Three ways to edit files:

#### Search/Replace (Most Reliable)
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
║                 XibeCode AI Agent                        ║
║              Autonomous Coding Assistant v1.0.0          ║
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
  "apiKey": "sk-ant-...",           // Your Anthropic API key
  "baseUrl": "https://...",         // Custom API endpoint (optional)
  "model": "claude-sonnet-4-5-...", // Default model
  "maxIterations": 50,              // Default max iterations
  "defaultVerbose": false           // Default verbose mode
}
```

### Environment Variables

```bash
ANTHROPIC_API_KEY=your_key        # API key
ANTHROPIC_BASE_URL=https://...    # Custom endpoint
XIBECODE_MODEL=claude-opus-4-...  # Default model
```

Config priority: CLI flags > Environment > Config file

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
- [Commander.js](https://github.com/tj/commander.js/)
- [Inquirer.js](https://github.com/SBoudrias/Inquirer.js/)
- [Chalk](https://github.com/chalk/chalk)
- [fast-glob](https://github.com/mrmlnc/fast-glob)

Inspired by [Claude Code](https://www.anthropic.com/news/claude-code) and [Aider](https://github.com/paul-gauthier/aider)

---

**Made with ❤️ for developers who love AI-assisted coding**
# XibeCode
