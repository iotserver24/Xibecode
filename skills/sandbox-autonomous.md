---
description: Safe autonomous runs in sandboxes, CI, and ephemeral environments
tags: sandbox, automation, safety, non-interactive
---

# Sandbox & Autonomous Execution

## Working directory

- Treat the printed working directory as the only project root unless the user explicitly says otherwise.
- Do not assume fixed paths like `/workspace` unless that is literally `cwd`.

## Non-interactive commands

- Always pass `--yes`, `-y`, or tool-specific non-interactive flags so installs and CLIs never block on prompts.
- If a tool still prompts, use the `input` parameter on `run_command` to pipe answers.

## Secrets & network

- Never print API keys, tokens, or `.env` contents. Do not commit secrets.
- In CI or sandboxes, only use credentials provided by the environment; do not embed long-lived keys in code.

## Side effects

- Prefer reversible edits and small commits. Avoid destructive operations on git history unless the task requires it.
