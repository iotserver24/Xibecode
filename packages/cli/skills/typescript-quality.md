---
description: TypeScript strictness, types, and module boundaries
tags: typescript, types, quality
---

# TypeScript Quality

When working in TypeScript:

## Types first

- Prefer explicit function return types on public APIs and exported symbols.
- Avoid `any`; use `unknown` and narrow, or proper generics.
- Enable and respect `strict` compiler options when the project uses them.

## Modules

- Match the project's module resolution (`NodeNext` vs `bundler`) for import paths.
- Avoid circular imports; extract shared types to a small `types` module if needed.

## Refactors

- After signature changes, fix call sites before moving on — do not leave a trail of implicit `any`.
