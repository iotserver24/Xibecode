---
description: Kubernetes manifests, resources, and safe rollouts
tags: kubernetes, k8s, yaml, devops
---

# Kubernetes Basics

## Manifests

- Match API versions already in the repo; validate with `kubectl apply --dry-run=server` when possible.

## Workloads

- Set sensible `resources` requests/limits when the cluster pattern expects them.
- Use readiness/liveness probes consistent with how the service exposes health.

## Rollouts

- Prefer gradual rollouts when the project uses them; document breaking chart changes.
