---
description: Structured logging, metrics, and debugging production issues
tags: logging, observability, monitoring
---

# Observability & Logging

## Logging

- Use the project's logger if one exists; otherwise structured JSON logs in servers.
- Log levels: `debug` for development detail, `info` for lifecycle events, `warn`/`error` for problems.
- Include `requestId` or `traceId` when the app supports distributed tracing.

## Errors

- Log the error message and a stack trace server-side; return sanitized messages to clients.
- Avoid logging environment variable names with values, API keys, or session cookies.

## Metrics

- When adding critical paths, consider counters or histograms if the codebase already exports metrics.
