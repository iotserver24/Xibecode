---
description: CI pipelines, GitHub Actions, and keeping builds green
tags: ci, github-actions, automation
---

# CI & GitHub Actions

## Workflow design

- Keep jobs focused; cache dependencies when the workflow already does.
- Use the same Node/package manager versions as local development (see `package.json` / `.nvmrc` / `pnpm-lock.yaml`).

## Secrets

- Read secrets only from CI secret stores (`GITHUB_TOKEN`, repository secrets); never echo secrets in logs or artifacts.

## Failures

- When fixing CI, reproduce locally with the same command the workflow runs (`pnpm test`, `pnpm run build`, etc.).
- Make scripts idempotent and non-interactive so CI never waits for stdin.
