# XibeCode

AI-powered autonomous coding assistant for your terminal.

[![Donate](https://img.shields.io/badge/Donate-Support%20XibeCode-ff69b4?style=for-the-badge)](https://www.anishkumar.tech/donate) [![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/npm/v/xibecode?style=for-the-badge)](https://www.npmjs.com/package/xibecode)
[![Core](https://img.shields.io/npm/v/xibecode-core?style=for-the-badge&label=core)](https://www.npmjs.com/package/xibecode-core)

## Overview

XibeCode is a CLI agent that reads and edits code, runs commands, and iterates on tasks from your terminal using LLMs. It features **AI-powered test generation**, **multi-model support** for Anthropic and OpenAI-compatible providers, **MCP server integration**, and a **skill system** with 40+ built-in skills.

The project is structured as a **monorepo** with two packages:

- **`xibecode-core`** - The AI agent engine (tool execution, MCP, memory, modes, permissions). Usable as a standalone library.
- **`xibecode`** - The CLI interface (commands, terminal UI, built-in skills).

## Installation

### From npm

```bash
pnpm install -g xibecode
# or
npm install -g xibecode
```

### From source

```bash
git clone https://github.com/iotserver24/xibecode
cd xibecode
pnpm install
pnpm run build
pnpm link --global --dir packages/cli
```

## Requirements

- Node.js 18+
- API key from Anthropic, OpenAI, or a compatible provider

## Quick Start

```bash
# Configure once
xibecode config --set-key YOUR_API_KEY

# Interactive terminal mode
xibecode chat

# Autonomous run
xibecode run "Create an Express API with auth"

# Run and open a PR
xibecode run-pr "Fix the TypeScript errors in src/agent.ts"
```

## Commands

### `xibecode run`

Autonomous coding workflow.

```bash
xibecode run "Build a REST API with Express"
xibecode run "Fix the TypeScript errors" --verbose
xibecode run --file task.txt
```

Options: `-f, --file`, `-m, --model`, `--mode`, `-b, --base-url`, `-k, --api-key`, `--provider`, `-d, --max-iterations`, `-v, --verbose`, `--cost-mode`, `--dry-run`, `--changed-only`

### `xibecode run-pr`

Autonomous coding with automatic branch and GitHub PR creation.

```bash
xibecode run-pr "Fix the TypeScript errors"
xibecode run-pr "Add input validation" --branch feat/validation --draft
```

Prerequisites: [`gh` CLI](https://cli.github.com/) must be installed and authenticated (`gh auth login`).

Options: `-f, --file`, `-m, --model`, `-b, --base-url`, `-k, --api-key`, `--provider`, `-d, --max-iterations`, `-v, --verbose`, `--cost-mode`, `--branch`, `--title`, `--draft`, `--skip-tests`

### `xibecode chat`

Interactive terminal chat with tool execution.

```bash
xibecode chat
xibecode chat --model claude-opus-4-5-20251101
```

Options: `-m, --model`, `-b, --base-url`, `-k, --api-key`, `--provider`, `--cost-mode`, `--theme`, `--session`, `--profile`

### `xibecode config`

Manage saved configuration.

```bash
xibecode config --set-key YOUR_KEY
xibecode config --set-model claude-sonnet-4-5-20250929
xibecode config --show
```

Options: `--set-key`, `--set-url`, `--set-model`, `--set-provider`, `--set-cost-mode`, `--set-economy-model`, `--show`, `--reset`, `--list-mcp-servers`, `--add-mcp-server`, `--remove-mcp-server`

### `xibecode settings`

Multi-source layered settings management.

```bash
xibecode settings list                    # Show fully merged settings
xibecode settings get permissions.allow   # Get a specific key
xibecode settings set agent.defaultMode plan  # Set a value
xibecode settings sources                 # Show all settings sources
xibecode settings paths                   # Show file paths
```

Settings are merged from four sources (highest priority first): policy, local, project, user.

### `xibecode hooks`

Lifecycle hooks management.

```bash
xibecode hooks list                       # Show all registered hooks
xibecode hooks add PreToolUse command "audit.sh"  # Add a hook
xibecode hooks remove PreToolUse 0        # Remove a hook
xibecode hooks events                     # Show available events
```

9 lifecycle events: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `StopFailure`, `PreCompact`, `PostCompact`.

### `xibecode memory`

Auto-memory system management.

```bash
xibecode memory list                      # List all project memories
xibecode memory search "auth flow"        # Search memories
xibecode memory dream                     # Run dream consolidation
xibecode memory path                      # Show memory directory
```

### `xibecode mcp`

MCP server management.

```bash
xibecode mcp list
xibecode mcp add my-server --command "node" --args "server.js"
xibecode mcp search                # Search Smithery registry
xibecode mcp install <skill-id>    # Install from Smithery
```

Subcommands: `add`, `list`, `remove`, `file`, `edit`, `init`, `reload`, `search`, `install`, `login`

### `xibecode skills`

Skill management.

```bash
xibecode skills list
```

### `xibecode diagnostics`

Generate a redacted diagnostics bundle for troubleshooting.

## Core Features

- **Autonomous multi-step agent loop** - Completes complex tasks automatically
- **13 agent modes/personas** - plan, agent, tester, debugger, security, pentest, review, team_leader, seo, product, architect, engineer, data, researcher
- **50+ tools** - File I/O, code search, git, shell execution, web search, MCP, and more
- **Smart context gathering** - Understands related files and imports
- **Verified and line-based editing** - Reliable code modifications
- **Multi-source settings** - Layered config from user, project, local, and policy sources
- **Lifecycle hooks** - Run custom commands at 9 agent lifecycle events
- **Auto-memory** - Persistent project memory with automatic extraction and dream consolidation
- **Permission rules** - Fine-grained allow/deny/ask patterns for tool execution
- **Context management** - Microcompaction and full compaction for long conversations
- **Smart mode switching** - Agent-initiated mode transitions auto-approved
- **Dry-run mode** - Preview changes safely before applying
- **Git-aware workflows** - Checkpoints, reverts, `--changed-only`
- **Test runner integration** - Auto-detects Vitest, Jest, pytest, Go test
- **MCP server integration** - Extend capabilities with external tools
- **Skill system** - 40+ built-in skills + custom markdown skills + Smithery registry
- **Swarm orchestration** - Parallel task execution with multiple workers
- **Background tasks** - Run long tasks in detached processes
- **Session-aware chat** - Persistent conversation history with project-scoped storage
- **Themed terminal UI** - Beautiful, customizable interface with Ink

## Agent Modes

| Mode | Persona | Description |
|------|---------|-------------|
| `agent` | Blaze | Full autonomous coding (default) |
| `plan` | Aria | Interactive planning with web research |
| `review` | Nova | Code review |
| `tester` | Tess | Testing and QA |
| `debugger` | Dex | Debugging |
| `security` | Sentinel | Security analysis |
| `pentest` | - | Penetration testing |
| `team_leader` | Arya | Coordinate team |
| `seo` | Siri | SEO optimization |
| `product` | Agni | Product strategy |
| `architect` | Anna | Architecture design |
| `engineer` | Alex | Implementation |
| `data` | David | Data analysis |
| `researcher` | Sanvi | Research |

Currently enabled for user selection: `agent`, `plan`, `review`. Other modes are defined internally but temporarily disabled.

## Using `xibecode-core` as a Library

The core package can be used independently to build custom AI coding tools:

```bash
pnpm add xibecode-core
```

```typescript
import {
  EnhancedAgent,
  CodingToolExecutor,
  NeuralMemory,
  SkillManager,
  MCPClientManager,
  PROVIDER_CONFIGS,
} from 'xibecode-core';

const memory = new NeuralMemory(process.cwd());
await memory.init();

const skillManager = new SkillManager(process.cwd());
await skillManager.loadSkills();

const mcpClientManager = new MCPClientManager();
const toolExecutor = new CodingToolExecutor(process.cwd(), {
  memory,
  skillManager,
  mcpClientManager,
});

const agent = new EnhancedAgent(
  {
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: 'claude-sonnet-4-5-20250929',
    maxIterations: 50,
  },
  'anthropic'
);

agent.on('event', (event) => {
  console.log(event.type, event.data);
});

const result = await agent.run('Create a hello world Express server');
```

### Key Exports

| Export | Description |
|--------|-------------|
| `EnhancedAgent` | Main agent class with streaming and multi-provider support |
| `CodingToolExecutor` | Tool execution engine (50+ tools) |
| `MCPClientManager` | MCP server connection management |
| `NeuralMemory` | Persistent lesson learning system |
| `AutoMemoryManager` | Auto-memory extraction, retrieval, and dream consolidation |
| `SettingsManager` | Multi-source layered settings management |
| `HooksManager` | Lifecycle hooks registration and execution |
| `PermissionRuleManager` | Permission rule parsing, matching, and evaluation |
| `SkillManager` | Built-in and custom skill loading |
| `PluginManager` | Plugin system for extending tools |
| `SessionManager` | Chat session persistence |
| `PlanMode` | Interactive planning system |
| `SwarmOrchestrator` | Parallel task execution |
| `BackgroundAgentManager` | Detached background task management |
| `FileEditor` | Multi-strategy file editing |
| `PermissionManager` | Tool permission control |
| `ContextManager` | Context window management |
| `microcompact` | Lightweight context reduction |
| `HOOK_EVENTS` | List of all 9 lifecycle hook events |
| `PROVIDER_CONFIGS` | Provider configurations (anthropic, openai, google, groq, etc.) |

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
  "costMode": "normal"
}
```

### Supported Providers

| Provider | Default Model | Environment Variable |
|----------|--------------|---------------------|
| Anthropic | claude-sonnet-4-5-20250929 | `ANTHROPIC_API_KEY` |
| OpenAI | gpt-4o | `OPENAI_API_KEY` |
| Google | gemini-2.0-flash | `GOOGLE_API_KEY` |
| Groq | llama-3.3-70b-versatile | `GROQ_API_KEY` |
| Custom | (user-defined) | (user-defined) |

## Project Structure

```
xibecode/
├── packages/
│   ├── core/                    # xibecode-core - AI agent engine
│   │   ├── src/
│   │   │   ├── agent.ts         # EnhancedAgent - main agent loop
│   │   │   ├── tools.ts         # CodingToolExecutor - 50+ tools
│   │   │   ├── modes.ts         # 13 agent modes/personas
│   │   │   ├── memory.ts        # NeuralMemory - lesson learning
│   │   │   ├── skills.ts        # SkillManager - skill system
│   │   │   ├── plugins.ts       # PluginManager - plugin system
│   │   │   ├── mcp-client.ts    # MCPClientManager
│   │   │   ├── swarm.ts         # SwarmOrchestrator
│   │   │   ├── background-agent.ts  # Background tasks
│   │   │   ├── editor.ts        # FileEditor
│   │   │   ├── permissions.ts   # PermissionManager
│   │   │   ├── context.ts       # ContextManager
│   │   │   ├── planMode.ts      # Interactive planning
│   │   │   ├── microcompact.ts  # Lightweight context reduction
│   │   │   ├── settings/        # Multi-source settings system
│   │   │   │   ├── settings-types.ts    # Settings schema and types
│   │   │   │   ├── settings-merge.ts    # Deep merge logic
│   │   │   │   ├── settings-sources.ts  # Source file loading
│   │   │   │   └── settings.ts          # SettingsManager class
│   │   │   ├── hooks/           # Lifecycle hooks system
│   │   │   │   ├── hook-types.ts        # Hook event and config types
│   │   │   │   ├── hook-schema.ts       # Hook validation
│   │   │   │   ├── hook-executor.ts     # Hook execution engine
│   │   │   │   └── hooks.ts             # HooksManager class
│   │   │   ├── auto-memory/     # Auto-memory system
│   │   │   │   ├── memory-types.ts      # Memory types and config
│   │   │   │   ├── memory-scan.ts       # Memory file scanning
│   │   │   │   ├── find-relevant.ts     # Relevance ranking
│   │   │   │   ├── extract-memories.ts  # Automatic extraction
│   │   │   │   ├── dream.ts             # Dream consolidation
│   │   │   │   └── auto-memory.ts       # AutoMemoryManager class
│   │   │   ├── permission-rules/  # Permission rules system
│   │   │   │   ├── rule-parser.ts       # Rule string parsing
│   │   │   │   ├── rule-matcher.ts      # Rule matching logic
│   │   │   │   └── permission-rules.ts  # PermissionRuleManager class
│   │   │   ├── types/           # Shared types (provider, mcp, todo, attachments)
│   │   │   ├── utils/           # Core utilities (git, safety, testRunner, etc.)
│   │   │   ├── mcp/             # MCP subsystem (config, oauth, resolve)
│   │   │   ├── tools/           # Tool implementations (test-generator)
│   │   │   └── index.ts         # Public API barrel export
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── cli/                     # xibecode - CLI interface
│       ├── src/
│       │   ├── commands/        # CLI commands (run, chat, config, settings, hooks, memory, etc.)
│       │   ├── ui/              # Terminal UI (claude-style-chat, enhanced-tui, themes)
│       │   ├── components/      # Ink components (AssistantMarkdown, design-system)
│       │   ├── utils/           # CLI utilities (config, tool-display, tui-theme)
│       │   ├── types/           # CLI types (command, marked-terminal)
│       │   ├── constants/       # Constants (spinnerVerbs)
│       │   └── index.ts         # CLI entry point
│       ├── skills/              # 40+ built-in skill markdown files
│       ├── package.json
│       └── tsconfig.json
├── scripts/                     # Build and dev scripts
├── docs/                        # Project documentation
├── site/                        # Documentation website (Next.js)
├── pnpm-workspace.yaml          # pnpm workspace config
├── turbo.json                   # Turborepo pipeline config
└── package.json                 # Root monorepo config
```

## Development

### Prerequisites

- Node.js 18+
- pnpm 9+

### Setup

```bash
pnpm install
pnpm run build          # Build all packages with Turborepo
pnpm run dev            # Watch mode for development
pnpm run sync-version   # Sync versions across all packages
```

### Linking CLI Locally

```bash
pnpm link --global --dir packages/cli
xibecode --version
```

### Building a Single Package

```bash
cd packages/core && pnpm run build
cd packages/cli && pnpm run build
```

## Browser Testing

XibeCode does **not** ship Playwright or download Chromium. Tools like `take_screenshot` and `preview_app` return guidance to use `run_command` + [`agent-browser`](https://github.com/vercel-labs/agent-browser) (install separately), your browser MCP, or `fetch_url`. For Playwright E2E, add `@playwright/test` to the target project and run it with `run_command`.

## Support

- [GitHub Issues](https://github.com/iotserver24/xibecode/issues)
- [Donate](https://www.anishkumar.tech/donate)

## License

Apache-2.0
