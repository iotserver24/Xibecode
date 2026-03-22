---
description: Dockerfiles, multi-stage builds, and image hygiene
tags: docker, containers, devops
---

# Docker & Containers

## Dockerfiles

- Prefer multi-stage builds to keep runtime images small; pin base image digests when the project does.
- Use non-root users in production images when the stack supports it.

## Caches

- Order layers so dependency installs cache well (copy lockfiles before source).

## Secrets

- Never bake secrets into images; use build args only for non-secret metadata.
