---
description: WebSockets, SSE, and realtime connection hygiene
tags: websocket, sse, realtime
---

# WebSockets & Realtime

## Connections

- Handle reconnects and backoff on the client; match existing client libraries.

## Auth

- Authenticate subscriptions/channels; avoid trusting client-supplied room IDs without checks.

## Scale

- Prefer sticky sessions or shared pub/sub when horizontally scaling; note limitations in docs.
