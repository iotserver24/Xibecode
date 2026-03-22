---
description: Terraform, state, and infrastructure change safety
tags: terraform, iac, devops
---

# Terraform & IaC

## State

- Never hand-edit remote state; use locking backends as configured.

## Modules

- Reuse modules for repeated patterns; pin module versions for reproducibility.

## Changes

- Plan before apply in automation; document destructive changes prominently.
