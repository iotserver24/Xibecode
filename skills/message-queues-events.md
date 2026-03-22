---
description: Queues, pub/sub, and event-driven integration
tags: kafka, rabbitmq, sqs, events
---

# Message Queues & Events

## Semantics

- Prefer at-least-once with idempotent consumers unless exactly-once is already guaranteed.

## Schemas

- Version event payloads; use schema registries when the platform does.

## Ops

- Monitor lag, DLQs, and replay procedures; never silently drop failed messages without policy.
