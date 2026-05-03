# Feature Backlog

Rough priority for product parity and user value. Not a commitment order.

## Completed (v1.1)

| Feature | Description |
|---------|-------------|
| **Multi-Source Settings** | Layered configuration merging from user, project, local, and policy sources. CLI: `xc settings`. |
| **Lifecycle Hooks** | Register command, prompt, or HTTP hooks at 9 agent lifecycle events. CLI: `xc hooks`. |
| **Auto-Memory** | Automatic memory extraction, keyword-ranked context retrieval, and dream consolidation. CLI: `xc memory`. |
| **Permission Rules** | Fine-grained allow/deny/ask rules for tool execution via settings. |
| **Microcompact** | Lightweight context reduction with ephemeral marking before full compaction. |
| **Smart Mode Switching** | Agent-initiated mode changes auto-approved for seamless task completion. |
| **Project-Scoped Sessions** | Sessions stored per-project under `~/.xibecode/projects/<path>/`. |

## P0 — High need (daily UX, safety, clarity)

| Feature | Why |
|---------|-----|
| **Doctor / environment check** | One command to verify API key, Node, `gh`, MCP, etc., before long runs. |
| **Cost / usage surfacing** | Show approximate spend or token usage per session (even coarse). |

## P1 — Medium need (power users, teams)

| Feature | Why |
|---------|-----|
| **File watch (`/watch`)** | Detect IDE-side edits and optionally inject "files changed" into the next turn. |
| **`/tree` or project tree** | Quick repo shape without spending tool calls. |
| **Model routing** | Different models for plan vs execution or for swarm workers. |
| **PR comment / fix-pr flows** | Tighter loop than `run-pr` alone (review threads, autofix). |
| **Plan library on disk** | Multiple plans under `.xibecode/plans` + active pointer (beyond single `implementations.md`). |

## P2 — Lower need (polish, integrations)

| Feature | Why |
|---------|-----|
| **Theme / output-style commands** | Terminal theming and verbosity profiles. |
| **Keybindings / vim mode in TUI** | Faster navigation for terminal power users. |
| **IDE / desktop / browser bridges** | Nice when stable; integration-heavy. |
| **Insights / session analytics** | Usage reports across sessions. |

## P3 — Large or niche (evaluate cost vs maintenance)

| Feature | Why |
|---------|-----|
| Voice, proactive assistant, workflows | Big surface area and safety story. |
| Webhooks / subscribe-PR | Ops and security overhead. |
| Semantic embedding memory | Replaces keyword ranking; needs infra. |
