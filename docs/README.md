# XibeCode Documentation

> **Version:** 1.1
> **Last Updated:** May 2026

Welcome to the XibeCode documentation. This directory contains documentation for developers, contributors, and users.

## Project Architecture

XibeCode is structured as a **pnpm workspace monorepo** with Turborepo for build orchestration:

- **`packages/core/`** (`xibecode-core`) - AI agent engine: tool execution, MCP, memory, modes, permissions, swarm orchestration, settings, hooks, auto-memory. Published as a standalone npm package.
- **`packages/cli/`** (`xibecode`) - CLI interface: commands, Ink-based TUI, built-in skills. Depends on `xibecode-core`.

## Documentation Structure

### Root-Level Documentation

| File | Description |
|------|-------------|
| [README.md](../README.md) | Project overview, installation, commands, and quick start |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | System architecture and design |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Contribution guidelines |
| [API_REFERENCE.md](../API_REFERENCE.md) | API overview and quick reference |
| [CODING_STANDARDS.md](../CODING_STANDARDS.md) | Code style and documentation standards |
| [CHANGELOG.md](../CHANGELOG.md) | Release history |
| [AGENTS.md](../AGENTS.md) | Learned preferences and workspace facts for AI agents |

### Feature Documentation

| Feature | Description | CLI Command |
|---------|-------------|-------------|
| [Multi-Source Settings](../site/content/docs/settings.mdx) | Layered config from user, project, local, and policy sources | `xc settings` |
| [Lifecycle Hooks](../site/content/docs/hooks.mdx) | Custom logic at 9 agent lifecycle events | `xc hooks` |
| [Auto-Memory](../site/content/docs/memory.mdx) | Persistent project memory with automatic extraction and dream consolidation | `xc memory` |
| [Permission Rules](../site/content/docs/permissions.mdx) | Fine-grained allow/deny/ask patterns for tool execution | `xc settings` |

### Detailed Documentation (This Directory)

#### Architecture (`/architecture`)

Deep dives into system design and components.

#### API Reference (`/api`)

Detailed API documentation for each component.

#### Developer Guides (`/guides`)

Step-by-step tutorials and guides.

#### Personas (`/personas`)

Agent persona documentation for all 13 modes:

| Mode | Persona | Description |
|------|---------|-------------|
| `agent` | Blaze | Full autonomous coding (default) |
| `plan` | Aria | Interactive planning with web research |
| `review` | Nova | Code review |
| `tester` | Tess | Testing and QA |
| `debugger` | Dex | Debugging |
| `security` | Sentinel | Security analysis |
| `pentest` | - | Penetration testing |
| `team_leader` | Arya | Team orchestration |
| `seo` | Siri | SEO optimization |
| `product` | Agni | Product strategy |
| `architect` | Anna | Architecture design |
| `engineer` | Alex | Implementation |
| `data` | David | Data analysis |
| `researcher` | Sanvi | Research |

Currently enabled for user selection: `agent`, `plan`, `review`.

#### Examples (`/examples`)

Complete code examples.

## Quick Start

### For Users

1. **Install**: `pnpm install -g xibecode`
2. **Configure**: `xibecode config --set-key YOUR_API_KEY`
3. **Run**: `xibecode run "Build a REST API"` or `xibecode chat`

### For Contributors

1. **Clone**: `git clone https://github.com/iotserver24/xibecode`
2. **Install**: `pnpm install`
3. **Build**: `pnpm run build`
4. **Link**: `pnpm link --global --dir packages/cli`
5. Read [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines

### For Library Users

```bash
pnpm add xibecode-core
```

```typescript
import {
  EnhancedAgent,
  CodingToolExecutor,
  NeuralMemory,
  AutoMemoryManager,
  SettingsManager,
  HooksManager,
  PermissionRuleManager,
  microcompact,
  HOOK_EVENTS,
} from 'xibecode-core';
```

## v1.1 New Features

### Multi-Source Settings

Layered configuration system that merges settings from four sources with clear priority ordering. Supports user, project, local, and policy layers. Deep merge for objects, replacement for arrays and primitives.

**CLI**: `xc settings list|get|set|sources|paths`

**Key modules**: `settings/settings-types.ts`, `settings/settings-merge.ts`, `settings/settings-sources.ts`, `settings/settings.ts`

### Lifecycle Hooks

Register command, prompt, or HTTP hooks at 9 lifecycle events: `PreToolUse`, `PostToolUse`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `Stop`, `StopFailure`, `PreCompact`, `PostCompact`. Hooks run sequentially and cannot modify tool I/O.

**CLI**: `xc hooks list|add|remove|events`

**Key modules**: `hooks/hook-types.ts`, `hooks/hook-schema.ts`, `hooks/hook-executor.ts`, `hooks/hooks.ts`

### Auto-Memory System

Automatic memory extraction from conversations, keyword-ranked context retrieval, and dream consolidation. Memories stored as Markdown with YAML frontmatter in `~/.xibecode/projects/<path>/memory/` and `.xibecode/memory.md`.

**CLI**: `xc memory list|search|dream|path`

**Key modules**: `auto-memory/memory-types.ts`, `auto-memory/memory-scan.ts`, `auto-memory/find-relevant.ts`, `auto-memory/extract-memories.ts`, `auto-memory/dream.ts`, `auto-memory/auto-memory.ts`

### Permission Rules

Fine-grained `allow`/`deny`/`ask` rules using `Tool(pattern)` syntax. Rules evaluated in deny > ask > allow order. Integrates with multi-source settings for per-project and policy-enforced rules.

**Key modules**: `permission-rules/rule-parser.ts`, `permission-rules/rule-matcher.ts`, `permission-rules/permission-rules.ts`

### Microcompact

Lightweight context reduction that strips old tool results and marks content as ephemeral before falling back to full compaction. Helps maintain coherent long conversations within token budgets.

**Key module**: `microcompact.ts`

### Smart Mode Switching

Agent-initiated mode changes are auto-approved so the agent can escalate from read-only to write-capable modes when the task requires it.

### Project-Scoped Sessions

Sessions stored per-project under `~/.xibecode/projects/<sanitized-cwd>/`. Use `xc resume --all` to see sessions across all projects.

## Building Documentation

### TypeDoc API Documentation

Generate API docs from JSDoc comments:

```bash
pnpm add -D typedoc typedoc-plugin-markdown
pnpm run docs:generate
```

## Documentation Coverage

| Area | Status |
|------|--------|
| Root docs (README, ARCHITECTURE, etc.) | Updated for v1.1 |
| Site docs (settings, hooks, memory, permissions) | New in v1.1 |
| Inline JSDoc | In progress |
| Architecture deep dives | Pending |
| API reference pages | Pending |
| Developer guides | Pending |
| Persona docs | Pending |

See [DOCUMENTATION_PROGRESS.md](./DOCUMENTATION_PROGRESS.md) for detailed status.

## External Resources

- **GitHub Repository**: [iotserver24/xibecode](https://github.com/iotserver24/xibecode)
- **npm (CLI)**: [xibecode](https://www.npmjs.com/package/xibecode)
- **npm (Core)**: [xibecode-core](https://www.npmjs.com/package/xibecode-core)
- **Issue Tracker**: [GitHub Issues](https://github.com/iotserver24/xibecode/issues)

## License

This documentation is part of XibeCode and is licensed under [Apache-2.0](../LICENSE).
