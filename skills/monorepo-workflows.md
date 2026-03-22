---
description: Monorepos, workspaces, and cross-package changes
tags: monorepo, pnpm, turborepo, nx
---

# Monorepo Workflows

## Tooling

- Use the workspace’s task runner (`turbo`, `nx`, `pnpm -r`) as configured; don’t bypass caches without reason.

## Changes

- When touching shared packages, bump dependents or use workspace protocol consistently.

## CI

- Run affected tests/builds when the pipeline supports it; otherwise follow project conventions.
