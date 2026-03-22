---
description: Go modules, interfaces, and idiomatic error handling
tags: go, golang, modules
---

# Go Conventions

## Modules

- Respect `go.mod` / `go.sum`; run `go mod tidy` after dependency changes when appropriate.

## Errors

- Wrap errors with context (`fmt.Errorf` with `%w`) where the codebase does; avoid panics in libraries.

## Style

- Run `gofmt` / `goimports` to match existing formatting.
- Keep interfaces small; prefer composition over deep inheritance (Go has none).
