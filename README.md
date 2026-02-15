# XibeCode

AI-powered autonomous coding assistant for your terminal and browser.

[![Donate](https://img.shields.io/badge/Donate-Support%20XibeCode-ff69b4?style=for-the-badge)](https://www.anishkumar.tech/donate)
[![Version](https://img.shields.io/npm/v/xibecode?style=for-the-badge)](https://www.npmjs.com/package/xibecode)

## Overview

XibeCode is a CLI agent that can read and edit code, run commands, and iterate on tasks from your terminal using LLMs. It now includes a **WebUI** for a browser-based experience, **AI-powered test generation**, and **multi-model support** for both Anthropic and OpenAI models.

## What's New in v0.4.4

- **v0.dev-inspired UI** - Modern split-panel layout with resizable chat and code areas
- **Multi-Terminal Support** - Create/manage multiple terminal tabs with + and X buttons
- **Monaco Code Editor** - Full syntax highlighting and IntelliSense in the browser
- **Settings Modal** - Configure AI provider, display, dev settings, and MCP servers
- **MCP JSON Editor** - Edit mcp-servers.json directly with Monaco syntax highlighting
- **Git History Graph** - Visual commit timeline with branch/tag indicators
- **Custom Model Support** - Add any model (Claude, GPT, DeepSeek, etc.) via WebUI or CLI
- **Real PTY Terminal** - Fully interactive shell with colors, tab-completion, and all terminal features
- **File Tree Explorer** - Browse and open files with recursive directory tree
- **Current Model Display** - Status bar shows active AI model
- **Drag-to-Resize Panels** - Adjustable chat/code split layout

## Installation

```bash
npm install -g xibecode
```

From source:

```bash
git clone https://github.com/iotserver24/xibecode
cd xibecode
pnpm install
pnpm run build
npm link
```

## Requirements

- Node.js 18+
- API key from Anthropic or OpenAI

## Quick Start

```bash
# Configure once
xibecode config --set-key YOUR_API_KEY

# Interactive terminal mode
xibecode chat

# Open WebUI in browser (recommended for beginners)
xibecode ui --open

# Autonomous run
xibecode run "Create an Express API with auth"
```

## Main Commands

### `xibecode ui`
**NEW** - Start the WebUI in your browser.

```bash
xibecode ui              # Start on localhost:3847
xibecode ui --open       # Auto-open browser
xibecode ui -p 8080      # Custom port
```

Features:
- **v0.dev-style Layout** - Activity bar (left) → Chat panel (resizable) → Code editor (right)
- **Monaco Code Editor** - Professional code editor with syntax highlighting and IntelliSense
- **File Tree Explorer** - Browse and open project files with recursive directory tree
- **Multi-Terminal Tabs** - Create/manage multiple shell sessions with + and X buttons
- **Real PTY Terminal** - Fully interactive bash/zsh with colors, tab-completion, vim/nano support
- **Git Integration** - Commit history graph, stage/unstage files, view diffs, write commits
- **Settings Modal** - Configure AI provider, display preferences, dev tools, and MCP servers
- **MCP JSON Editor** - Edit mcp-servers.json directly with Monaco syntax highlighting
- **Custom Models** - Add any AI model (Claude, GPT-4, DeepSeek, Llama) via dropdown + text input
- **Real-time Chat** - Streaming AI responses with markdown rendering
- **Status Bar** - Connection status, current mode, active AI model, cursor position
- **Resizable Panels** - Drag the divider between chat and code areas to adjust layout
- **Slash Commands** - Type `/` for commands and mode switching, `@` for file references
- **New Chat Button** - Clear conversation with + button in chat input

### `xibecode run`
Autonomous coding workflow.

```bash
xibecode run "Build a REST API with Express"
xibecode run "Fix the TypeScript errors" --verbose
xibecode run --file task.txt
```

Options:
- `-f, --file <path>` prompt from file
- `-m, --model <model>` model override
- `--mode <mode>` initial agent mode
- `-b, --base-url <url>` custom API URL
- `-k, --api-key <key>` API key override
- `--provider <provider>` `anthropic` or `openai`
- `-d, --max-iterations <number>` default `150` (`0` = unlimited)
- `-v, --verbose`
- `--dry-run`
- `--changed-only`

### `xibecode chat`
Interactive terminal chat + tool use.

Options:
- `-m, --model <model>`
- `-b, --base-url <url>`
- `-k, --api-key <key>`
- `--provider <provider>`
- `--theme <theme>`
- `--session <id>`

### `xibecode config`
Manage saved config:

- `--set-key`, `--set-url`, `--set-model`
- `--show`, `--reset`
- MCP helpers: `--list-mcp-servers`, `--add-mcp-server`, `--remove-mcp-server`

### `xibecode mcp`
MCP server management:

- `add`, `list`, `remove`, `file`, `edit`, `init`, `reload`
- `search`, `install`, `login` (Smithery integration)

## Core Features

- **Autonomous multi-step agent loop** - Completes complex tasks automatically
- **Smart context gathering** - Understands related files and imports
- **Verified and line-based editing** - Reliable code modifications
- **Dry-run mode** - Preview changes safely before applying
- **Git-aware workflows** - `--changed-only`, checkpoints, and reverts
- **Test runner integration** - Auto-detects Vitest, Jest, pytest, Go test
- **MCP server integration** - Extend capabilities with external tools
- **Skill system** - Built-in + custom markdown skills
- **Session-aware chat** - Persistent conversation history
- **Themed terminal UI** - Beautiful, customizable interface

## WebUI

The WebUI provides a browser-based interface that syncs in real-time with the terminal.

```bash
# Start with both TUI and WebUI
xibecode chat

# WebUI opens automatically at http://localhost:3847
```

### TUI-WebUI Sync

When you run `xibecode chat`, both interfaces are connected:
- Messages sent from **TUI** appear in **WebUI** (marked with "TUI")
- Messages sent from **WebUI** are processed by **TUI**
- Streaming responses show in both simultaneously
- Tool executions display in real-time

### Slash Commands (`/`)

Type `/` in the input to open the command palette:

**Commands:**

| Command | Description |
|---------|-------------|
| `/clear` | Clear chat messages |
| `/help` | Show available commands |
| `/diff` | Show git diff |
| `/status` | Show git status |
| `/test` | Run project tests |
| `/format` | Format code in project |
| `/reset` | Reset chat session |
| `/files` | List project files |

**Modes:**

| Mode | Icon | Description |
|------|------|-------------|
| `/mode agent` | 🤖 | Autonomous coding (default) |
| `/mode plan` | 📋 | Analyze without modifying |
| `/mode tester` | 🧪 | Testing and QA |
| `/mode debugger` | 🐛 | Bug investigation |
| `/mode security` | 🔒 | Security analysis |
| `/mode review` | 👀 | Code review |
| `/mode team_leader` | 👑 | Coordinate team |
| `/mode architect` | 🏛️ | System design |
| `/mode engineer` | 🛠️ | Implementation |
| `/mode seo` | 🌐 | SEO optimization |
| `/mode product` | 🔥 | Product strategy |
| `/mode data` | 📊 | Data analysis |
| `/mode researcher` | 📚 | Deep research |

### File References (`@`)

Type `@` to browse and reference files:
- Shows project files and folders
- Filter by typing after `@`
- Select to include file path in message
- Helps AI understand which files to work with

### Settings Panel

Click the ⚙️ Settings button to configure:
- **Provider** - Anthropic, OpenAI, or Custom
- **Model** - Select from available models
- **Custom Model ID** - For custom/local models
- **API Key** - Your provider API key
- **Base URL** - Custom API endpoint (for local LLMs)
- **Session Info** - Working directory, git branch

### Features

- **Markdown Rendering** - Code blocks, bold, italic, lists, links
- **Tool Execution** - Shows each tool call with status (running/done/failed)
- **Thinking Indicator** - Spinner while AI is processing
- **Responsive Design** - Works on mobile and desktop
- **Real-time Streaming** - See responses as they're generated

## AI Test Generation

XibeCode can automatically generate comprehensive test suites for your code:

```bash
# Via CLI (in chat mode)
> generate tests for src/utils/helpers.ts

# Via WebUI
1. Go to "Test Generator" tab
2. Enter file path
3. Select framework (auto-detected)
4. Click "Generate Tests"
```

### Features

- **Multi-framework support** - Vitest, Jest, Mocha, pytest, Go test
- **Code analysis** - Understands functions, classes, types
- **Edge case generation** - Null checks, empty strings, boundaries
- **Mock setup** - Automatic mock configuration
- **Type checking tests** - Verifies return types
- **Error handling tests** - Tests for exceptions

### Example Output

```typescript
import { describe, it, expect, vi } from 'vitest';
import { calculateTotal } from '../utils/helpers';

describe('calculateTotal', () => {
  it('should execute calculateTotal successfully', () => {
    expect(calculateTotal([])).toBeDefined();
  });

  it('should return correct type from calculateTotal', () => {
    expect(typeof calculateTotal([])).toBe('number');
  });

  it('should handle empty array', () => {
    expect(calculateTotal([])).toBe(0);
  });

  it('should handle errors in calculateTotal', () => {
    expect(() => calculateTotal(undefined)).toThrow();
  });
});
```

## Browser Testing (Playwright)

XibeCode includes comprehensive browser automation and testing capabilities:

- **Screenshots** - Capture webpage screenshots
- **Console Logs** - Collect browser console output
- **Visual Regression** - Compare screenshots against baselines
- **Accessibility Audits** - Check WCAG compliance
- **Performance Metrics** - Measure Core Web Vitals (FCP, LCP, CLS, TTI)
- **Responsive Testing** - Test across multiple viewports
- **Network Monitoring** - Capture all network requests
- **E2E Tests** - Execute Playwright test files

```bash
# Example: Test performance
xibecode run "Measure the performance of http://localhost:3000"

# Example: Check accessibility
xibecode run "Run an accessibility audit on the homepage"

# Example: Visual regression test
xibecode run "Take a screenshot and compare against baseline"
```

## Configuration

### Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...     # Anthropic API key
OPENAI_API_KEY=sk-...             # OpenAI API key
XIBECODE_MODEL=claude-sonnet-4-5-20250929  # Default model
```

### Config File

Located at `~/.xibecode/config.json`:

```json
{
  "apiKey": "sk-ant-...",
  "model": "claude-sonnet-4-5-20250929",
  "provider": "anthropic",
  "maxIterations": 50,
  "theme": "default"
}
```

### Available Models

| Model | Provider | Best For |
|-------|----------|----------|
| `claude-sonnet-4-5-20250929` | Anthropic | General coding (default) |
| `claude-opus-4-5-20251101` | Anthropic | Complex reasoning |
| `claude-haiku-4-5-20251015` | Anthropic | Fast responses |
| `gpt-4o` | OpenAI | General coding |
| `gpt-4o-mini` | OpenAI | Fast responses |
| `o1-preview` | OpenAI | Complex reasoning |

## API

XibeCode provides a REST API when running the WebUI:

```bash
# Start the server
xibecode ui

# API endpoints
GET  /api/health          # Health check
GET  /api/config          # Get configuration
PUT  /api/config          # Update configuration
GET  /api/models          # List available models
GET  /api/project         # Get project info
GET  /api/git/status      # Get git status
GET  /api/git/diff        # Get git diff
POST /api/files/list      # List directory contents
POST /api/files/read      # Read file contents
POST /api/session/create  # Create chat session
POST /api/tests/generate  # Generate tests for file
POST /api/tests/analyze   # Analyze file for testable code
POST /api/tests/run       # Run project tests
```

## Project Structure

```
xibecode/
├── src/
│   ├── core/           # Agent, tools, context
│   ├── commands/       # CLI commands
│   ├── utils/          # Config, git, safety
│   ├── tools/          # Test generator, browser
│   ├── webui/          # WebUI server
│   └── index.ts        # CLI entry point
├── site/               # Documentation site
└── tests/              # Test suites
```

## Project Docs

- `CHANGELOG.md` — release history
- `FEATURES.md` — feature deep dive
- `PUBLISHING.md` — npm release process

## Support

- [GitHub Issues](https://github.com/iotserver24/xibecode/issues)
- [Donate](https://www.anishkumar.tech/donate)

## License

Apache-2.0
