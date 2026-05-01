---
description: gRPC services, protobuf evolution, and streaming RPCs
tags: grpc, protobuf, rpc
---

# gRPC & Protobuf

## Compatibility

- Add fields with care; reserve numbers; avoid reusing field numbers.

## Evolution

- Follow repo policy for required vs optional fields across language generators.

## Errors

- Map RPC failures to meaningful status codes; propagate rich error details only when safe.
