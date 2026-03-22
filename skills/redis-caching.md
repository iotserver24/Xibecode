---
description: Caching layers, TTLs, and Redis usage patterns
tags: redis, cache, performance
---

# Redis & Caching

## Correctness

- Invalidate or version cache keys when underlying data can change; avoid stale reads for auth or billing.

## TTL

- Set sensible expirations; document cache stampede mitigations if traffic spikes.

## Keys

- Use namespaces/prefixes consistent with the codebase; avoid unbounded key growth.
