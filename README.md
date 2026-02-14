# XibeCode

AI-powered autonomous coding assistant for your terminal and browser.

[![Donate](https://img.shields.io/badge/Donate-Support%20XibeCode-ff69b4?style=for-the-badge)](https://www.anishkumar.tech/donate)
[![Version](https://img.shields.io/npm/v/xibecode?style=for-the-badge)](https://www.npmjs.com/package/xibecode)

## Overview

XibeCode is a CLI agent that can read and edit code, run commands, and iterate on tasks from your terminal using LLMs. It now includes a **WebUI** for a browser-based experience, **AI-powered test generation**, and **multi-model support** for both Anthropic and OpenAI models.

## What's New in v0.4.0

- **WebUI** - Browser-based interface with dashboard, visual diff, and chat
- **AI Test Generation** - Automatically generate comprehensive test suites
- **Multi-Model Support** - Switch between Claude, GPT-4, and more
- **Visual Diff Viewer** - View git changes in the browser
- **Configuration Panel** - Easy model and API key management

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
- **Dashboard** - Project stats, git status, test runner info
- **Chat Interface** - Real-time streaming responses
- **Visual Diff** - Colorized git diff viewer
- **AI Test Generator** - Generate tests with one click
- **Multi-Model Selector** - Switch models instantly
- **Configuration Panel** - Manage API keys and settings

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

The WebUI provides a browser-based interface that's perfect for:
- Users who prefer GUIs over CLIs
- Visual diff reviewing
- Quick model switching
- AI test generation with preview

```bash
# Start the WebUI
xibecode ui --open

# Or with pnpm
pnpm ui
```

### Dashboard
The dashboard shows:
- Project name and version
- Git branch and status
- Test runner detection
- Dependency count

### Visual Diff
View your git changes with syntax highlighting:
- Green for additions
- Red for deletions
- Refresh button to reload

### Multi-Model Support
Switch between models in the UI:
- **Claude Sonnet 4.5** (default)
- **Claude Opus 4.5** (premium)
- **Claude Haiku 4.5** (fast)
- **GPT-4o** (OpenAI)
- **GPT-4o Mini** (OpenAI fast)
- **O1 Preview/Mini** (reasoning)

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
