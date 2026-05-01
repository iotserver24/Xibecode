---
description: Rust ownership patterns, crates, and unsafe boundaries
tags: rust, cargo, systems
---

# Rust Patterns

## Safety

- Avoid `unsafe` unless the project already uses it; contain it behind small, reviewed modules.

## Crates

- Follow workspace `Cargo.toml` layout; keep feature flags consistent with existing crates.

## Errors

- Use `Result` and project error types (`thiserror`, `anyhow`) as established in the repo.
