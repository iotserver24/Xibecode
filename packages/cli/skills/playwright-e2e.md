---
description: Playwright tests, selectors, and flake resistance
tags: playwright, e2e, testing
---

# Playwright E2E

## Selectors

- Prefer role- and test-id-based selectors over brittle CSS when the app exposes them.

## Stability

- Use auto-waiting; avoid fixed sleeps except as last resort.

## CI

- Run headless in CI; shard when runtime is high; capture traces on failure when enabled.
