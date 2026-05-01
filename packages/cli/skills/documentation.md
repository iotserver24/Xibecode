---
description: README updates, API docs, and user-facing copy
tags: docs, readme, technical-writing
---

# Documentation

## When to update docs

- User-facing behavior changes need README or docs updates in the same change set when the repo keeps them in sync.
- New CLI flags, config keys, or environment variables must be documented where other options are listed.

## Style

- Use clear, imperative titles; short paragraphs; code blocks with correct language tags.
- Link to upstream docs for heavy reference material instead of copying pages of API surface.

## Examples

- Prefer one minimal, copy-pastable example over many partial snippets.
- Keep version numbers and install commands aligned with the package manager the project uses (e.g. pnpm).
