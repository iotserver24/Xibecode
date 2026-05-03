# XibeCode Documentation Progress Report

> **Last Updated:** May 2026
> **Status:** Phase 1 & 2 Complete, v1.1 Feature Docs Added

## Update for v1.1 (May 2026)

Five major new features were added to `xibecode-core` and exposed via CLI commands:

- **Multi-Source Settings** — Layered configuration merging from user, project, local, and policy sources. CLI: `xc settings`.
- **Lifecycle Hooks** — Register command, prompt, or HTTP hooks at 9 agent lifecycle events. CLI: `xc hooks`.
- **Auto-Memory** — Automatic memory extraction, keyword-ranked context retrieval, and dream consolidation. CLI: `xc memory`.
- **Permission Rules** — Fine-grained allow/deny/ask rules for tool execution via settings.
- **Microcompact** — Lightweight context reduction with ephemeral marking before full compaction.

Additional improvements:

- **Smart Mode Switching** — Agent-initiated mode changes auto-approved.
- **Project-Scoped Sessions** — Sessions stored per-project under `~/.xibecode/projects/<path>/`.

New site docs created: `settings.mdx`, `hooks.mdx`, `memory.mdx`, `permissions.mdx`.

## Update for v1.0.4 (May 2026)

The project was restructured into a pnpm workspace monorepo:

- **`packages/core/`** (`xibecode-core`) - AI agent engine published as a standalone npm package
- **`packages/cli/`** (`xibecode`) - CLI interface depending on `xibecode-core`

## Executive Summary

This report tracks the progress of the comprehensive documentation initiative for XibeCode.

### Current State

| Area | Before Monorepo | After Monorepo Migration |
|------|-----------------|--------------------------|
| Project structure | Single package (`src/`) | Monorepo (`packages/core/`, `packages/cli/`) |
| Core package | Part of `src/core/` | `packages/core/src/` (published as `xibecode-core`) |
| CLI package | Part of `src/commands/`, `src/ui/` | `packages/cli/src/` (published as `xibecode`) |
| Skills | Root `skills/` | `packages/cli/skills/` |
| Tests | Root `tests/` | Removed (broken imports, need recreation) |
| WebUI | `src/webui/` | Removed entirely |

## Completed Tasks

### Foundation Setup

- [x] Create `/docs` directory structure
- [x] Write ARCHITECTURE.md (7,800+ words, needs monorepo update)
- [x] Write CONTRIBUTING.md (4,500+ words, needs monorepo update)
- [x] Write API_REFERENCE.md (5,000+ words, needs monorepo update)
- [x] Write CODING_STANDARDS.md (4,000+ words, needs monorepo update)
- [x] Set up TypeDoc tooling

### Critical Inline Documentation

- [x] Document tools.ts class and key methods (JSDoc pattern established)
- [x] Document modes.ts types and interfaces (13 personas documented)

### Monorepo Migration (v1.0.4)

- [x] Restructure into pnpm workspace monorepo with Turborepo
- [x] Extract core to `packages/core/` with public API barrel export
- [x] Move CLI to `packages/cli/` with `xibecode-core` dependency
- [x] Complete TOOL_CATEGORIES map (all 56 tools categorized)
- [x] Fix NeuralMemory initialization in all CLI entry points
- [x] Fix FileHandle leak in BackgroundAgentManager
- [x] Update CI/release workflows for dual-package publishing
- [x] Clean up obsolete root directories
- [x] Rewrite README.md for monorepo
- [x] Update docs/README.md for monorepo

### v1.1 Feature Documentation

- [x] Create site docs/settings.mdx for multi-source settings
- [x] Create site docs/hooks.mdx for lifecycle hooks
- [x] Create site docs/memory.mdx for auto-memory system
- [x] Create site docs/permissions.mdx for permission rules
- [x] Update site docs/index.mdx with v1.1 features
- [x] Update site docs/configuration.mdx with new CLI commands
- [x] Update site docs/quickstart.mdx with v1.1 features
- [x] Update site content/docs/meta.json navigation
- [x] Update root README.md with new features, commands, and exports
- [x] Update docs/README.md with v1.1 feature details
- [x] Rename docs/feature-priority file to generic name

## Pending Tasks

### High Priority

1. **Update root-level docs for monorepo** - ARCHITECTURE.md, CONTRIBUTING.md, API_REFERENCE.md, CODING_STANDARDS.md all reference old `src/` paths
2. **Create test suites in packages** - Old `tests/` directory was removed; new tests needed in `packages/core/tests/` and `packages/cli/tests/`

### Medium Priority

3. **Create architecture deep dives** - `docs/architecture/`
4. **Create API reference pages** - `docs/api/`
5. **Create developer guides** - `docs/guides/`
6. **Document agent.ts main loop** - `packages/core/src/agent.ts`
7. **Document editor.ts editing strategies** - `packages/core/src/editor.ts`

### Low Priority

8. **Create persona documentation** - `docs/personas/`
9. **Create code examples** - `docs/examples/`
10. **Set up documentation automation** - Pre-commit hooks, CI for doc generation

## Success Metrics

| Metric | Before | Current | Target |
|--------|--------|---------|--------|
| JSDoc Coverage | ~0.7% | ~5% | 90% |
| Architecture Docs | 0 | 1 (needs update) | 6 |
| API Reference Docs | 0 | 1 (needs update) | 12 |
| Persona Docs | 0 | 0 | 14 |
| Developer Guides | 0 | 0 | 6 |
| Code Examples | 0 | 0 | 10+ |
| Test Suites | 26 (broken) | 0 | Per-package |
| Site Pages | 11 (outdated) | 15 (updated for v1.1) | 15+ |

---

**Maintained By:** XibeCode Team
