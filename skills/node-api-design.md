---
description: HTTP APIs, validation, and Node.js service boundaries
tags: node, api, http, rest
---

# Node API Design

## Structure

- One clear entry for HTTP handling (router layer) and thin handlers that call domain logic.
- Validate inputs at the boundary (schema library or manual checks) and return consistent error shapes.

## HTTP semantics

- Use correct status codes: 400 client errors, 401/403 auth, 404 missing resources, 409 conflicts, 500 only for unexpected server faults.
- Include actionable error messages for API consumers without leaking secrets or stack traces in production.

## Security

- Never log tokens, passwords, or full PII. Redact sensitive fields in logs.
- Rate-limit and authenticate public endpoints when the project already does so.
