---
description: Supply chain, lockfiles, and vulnerable dependencies
tags: security, npm, audit, supply-chain
---

# Dependency Security

## Updates

- Prefer targeted upgrades for CVEs; read changelogs for breaking changes.

## Lockfiles

- Commit lockfiles; use `pnpm audit` / ecosystem equivalents as the project does.

## Pinning

- Align with team policy on exact vs caret ranges; avoid unreviewed major jumps in security hotfixes.
