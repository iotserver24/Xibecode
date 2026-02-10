## XibeCode v0.0.10 — Ink TUI (Experimental)

This release introduces a new **Ink-based full-screen TUI** alongside the existing classic chat experience.

### New

- **`xibecode tui` command**
  - New CLI command that starts an Ink-powered, full-screen chat UI.
  - Uses the same core `EnhancedAgent`, tools, MCP integration, and session manager as `xibecode chat`.
  - Accepts the same key options:
    - `-m, --model <model>`
    - `-b, --base-url <url>`
    - `-k, --api-key <key>`
    - `--theme <theme>`
    - `--session <id>`

- **Ink TUI experience (`src/ui/ink/App.tsx`)**
  - Message pane showing recent conversation (user, assistant, system, and tool events).
  - **Status bar** with:
    - current model
    - agent mode
    - session title
    - theme name
    - tools on/off
    - thinking indicator
  - Input area with:
    - inline suggestions for slash commands (`/help`, `/new`, `/sessions`, `/mode`, `/themes`, `/models`, `/export`, `/compact`, `/details`, `/thinking`, `/exit`)
    - suggestion lines for `@` fuzzy file search and matching file paths.

- **Mode switching via keyboard**
  - Press **Tab** to cycle between all available `AgentMode`s (agent/plan/debug/etc.).
  - The current mode is:
    - sent to the agent via `setModeFromUser`.
    - displayed in both the status bar and as system messages in the chat stream.

- **Slash commands (Ink)**
  - `/help` — show available slash commands and shortcuts.
  - `/new` — start a new session and clear the conversation.
  - `/sessions` — list saved sessions (read-only list for now, with current session highlighted).
  - `/mode` — show all modes and which one is active.
  - `/details` and `/thinking` — toggle the corresponding config flags (shared with classic chat).
  - `/exit` and `/quit` — save stats + messages, then exit the TUI.

- **Bang commands (`!`)**
  - `!<command>` runs a shell command via the existing `run_command` tool.
  - Stdout/stderr are rendered in the TUI and summarized back into the agent as a new turn.

- **`@` fuzzy file hints**
  - Typing `@something` triggers a `ContextManager.searchFiles("**/*something*")` search.
  - Matching paths are shown as system messages and in the suggestion list under the input.

### Internal / Developer Notes

- Added **Ink wiring command** (`src/commands/tui.ts`):
  - Loads config and MCP servers.
  - Bootstraps a session via `SessionManager`.
  - Instantiates a single long-lived `EnhancedAgent` and `CodingToolExecutor`.
  - Calls the Ink app via `render(React.createElement(InkApp, props))`.

- New **React/Ink infrastructure**:
  - `src/ui/ink/App.tsx` is implemented without JSX (`React.createElement`) to keep TypeScript happy across environments.
  - React types added in devDependencies (`@types/react`).

### How to use

- Build:

```bash
pnpm build
```

- Run the new TUI:

```bash
xibecode tui
```

> Note: the classic `xibecode chat` command is unchanged and still available. The Ink TUI is considered **experimental** and will continue to evolve (markdown rendering, richer suggestions, theme integration, and full session switching are planned next).

