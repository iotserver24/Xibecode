---
description: POSIX shell, bash safety, and scripting portability
tags: shell, bash, sh, scripting
---

# Shell Scripting

## Safety

- Use `set -euo pipefail` when appropriate; quote variables; avoid word-splitting surprises.

## Portability

- Match shebang and POSIX vs bash features to the project’s target environments.

## Secrets

- Never echo secrets; prefer env vars injected by CI or secret managers.
