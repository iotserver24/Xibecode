---
description: Service boundaries, contracts, and distributed failure modes
tags: microservices, architecture, soa
---

# Microservice Boundaries

## Ownership

- Prefer clear bounded contexts; avoid shared databases across services unless already the pattern.

## Communication

- Use sync vs async boundaries intentionally; document timeouts and retries.

## Failure

- Design for partial outages: idempotency, deduplication, and poison-message handling where queues exist.
