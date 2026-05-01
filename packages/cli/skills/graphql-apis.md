---
description: GraphQL schema design, resolvers, and N+1 pitfalls
tags: graphql, api, apollo
---

# GraphQL APIs

## Schema

- Evolve schemas carefully: prefer additive changes; use deprecations before removals.

## Performance

- Watch for N+1 query patterns; use dataloaders or batching when the codebase does.

## Errors

- Return user-safe error messages; log detailed errors server-side only.
