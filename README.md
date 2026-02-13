# XibeCode

AI-powered autonomous coding assistant for your terminal.

[![Donate](https://img.shields.io/badge/Donate-Support%20XibeCode-ff69b4?style=for-the-badge)](https://www.anishkumar.tech/donate)

## Overview

XibeCode is a CLI agent that can read and edit code, run commands, and iterate on tasks from your terminal using LLMs.

## Installation

```bash
npm install -g xibecode
```

From source:

```bash
git clone https://github.com/iotserver24/xibecode
cd xibecode
npm install
npm run build
npm link
```

## Requirements

- Node.js 18+
- Anthropic API key (or compatible provider/base URL)

## Quick Start

```bash
# Configure once
xibecode config --set-key YOUR_API_KEY

# Interactive mode
xibecode chat

# Autonomous run
xibecode run "Create an Express API with auth"
```

## Main Commands

### `xibecode run`
Autonomous coding workflow.

Useful options:

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
Interactive chat + tool use.

Useful options:

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

- Autonomous multi-step agent loop
- Smart context gathering across related files
- Verified and line-based editing workflows
- Dry-run mode for safe previews
- Git-aware workflows (`--changed-only`, checkpoints/reverts)
- Test runner integration support
- MCP server integration
- Skill system (built-in + custom markdown skills)
- Session-aware chat and themed terminal UI

## Project Docs

- `CHANGELOG.md` — release history
- `FEATURES.md` — feature deep dive
- `PUBLISHING.md` — npm release process

## License

Apache-2.0
