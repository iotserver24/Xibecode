# Feature backlog (OpenClaude-inspired), by need level

Rough priority for product parity and user value. Not a commitment order.

## P0 — High need (daily UX, safety, clarity)

| Feature | Why |
|--------|-----|
| **Markdown auto-memory (done)** | Keyword-ranked injection from `~/.xibecode/memory/MEMORY.md`, `.xibecode/memory.md`, `.xibecode/memories/*.md` with fallback to raw `memory.md`. |
| **`run_swarm` visibility** | Per-worker lines in chat after completion (implemented). |
| **Doctor / environment check** | One command to verify API key, Node, `gh`, MCP, etc., before long runs. |
| **Cost / usage surfacing** | Show approximate spend or token usage per session (even coarse). |

## P1 — Medium need (power users, teams)

| Feature | Why |
|--------|-----|
| **File watch (`/watch`)** | Detect IDE-side edits and optionally inject “files changed” into the next turn. |
| **`/tree` or project tree** | Quick repo shape without spending tool calls. |
| **Model routing** | Different models for plan vs execution or for swarm workers. |
| **PR comment / fix-pr flows** | Tighter loop than `run-pr` alone (review threads, autofix). |
| **Plan library on disk** | Multiple plans under `.xibecode/plans` + active pointer (beyond single `implementations.md`). |

## P2 — Lower need (polish, integrations)

| Feature | Why |
|--------|-----|
| **Theme / output-style commands** | Terminal theming and verbosity profiles. |
| **Keybindings / vim mode in TUI** | Faster navigation for terminal power users. |
| **Hooks (session / tool lifecycle)** | Automation; overlaps with external Cursor hooks. |
| **IDE / desktop / browser bridges** | Nice when stable; integration-heavy. |
| **Insights / session analytics** | Usage reports across sessions. |

## P3 — Large or niche (evaluate cost vs maintenance)

| Feature | Why |
|--------|-----|
| Voice, proactive assistant, workflows | Big surface area and safety story. |
| Webhooks / subscribe-PR | Ops and security overhead. |
| Semantic embedding memory | Replaces keyword ranking; needs infra. |

---

See also `DOCS.md` and `FEATURES.md` for what XibeCode already ships.
