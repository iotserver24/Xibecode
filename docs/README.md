# XibeCode Documentation

> **Version:** 1.0.4
> **Last Updated:** May 2026

Welcome to the XibeCode documentation. This directory contains documentation for developers, contributors, and users.

## Project Architecture

XibeCode is structured as a **pnpm workspace monorepo** with Turborepo for build orchestration:

- **`packages/core/`** (`xibecode-core`) - AI agent engine: tool execution, MCP, memory, modes, permissions, swarm orchestration. Published as a standalone npm package.
- **`packages/cli/`** (`xibecode`) - CLI interface: commands, Ink-based TUI, built-in skills. Depends on `xibecode-core`.

## Documentation Structure

### Root-Level Documentation

| File | Description |
|------|-------------|
| [README.md](../README.md) | Project overview, installation, commands, and quick start |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | System architecture and design (references old structure, needs update) |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Contribution guidelines |
| [API_REFERENCE.md](../API_REFERENCE.md) | API overview and quick reference |
| [CODING_STANDARDS.md](../CODING_STANDARDS.md) | Code style and documentation standards |
| [CHANGELOG.md](../CHANGELOG.md) | Release history |
| [AGENTS.md](../AGENTS.md) | Learned preferences and workspace facts for AI agents |

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
import { EnhancedAgent, CodingToolExecutor, NeuralMemory } from 'xibecode-core';
```

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
| Root docs (README, ARCHITECTURE, etc.) | Partially updated for monorepo |
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
