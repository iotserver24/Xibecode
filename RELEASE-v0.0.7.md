### XibeCode v0.0.7 – OpenCode‑Inspired Chat TUI

XibeCode **v0.0.7** is a TUI‑focused release that overhauls the interactive chat experience to feel much closer to OpenCode / Gemini CLI, adds persistent sessions, a theme system, and lots of small UX polish – all while keeping the existing autonomous agent, tools, and safety features intact.

---

### 1. Highlights

- ✅ **New chat session system** – save, list, and resume conversations.
- ✅ **Theme engine** – multiple color schemes (catppuccin, dracula, nord, gruvbox, monokai, solarized).
- ✅ **Rich chat commands** – `/new`, `/sessions`, `/models`, `/themes`, `/export`, `/compact`, `/details`, `/thinking`, `/mcp`.
- ✅ **Inline shell integration** – `!` commands (e.g. `!git status`) run in your project and feed output back to the AI.
- ✅ **Status bar** – shows model, session, tools on/off, cwd, and theme.
- ✅ **Fuzzy `@` file search** – powered by `fast-glob`, not just `fs.readdir`.
- ✅ **Config‑driven UX** – theme + TUI preferences persisted in `~/.xibecode/config.json`.

---

### 2. Version & CLI

- Package version: **0.0.7**
- CLI version banner / flags updated:
  - `xibecode --version` → `0.0.7`
  - `xibecode chat` now supports:
    - `--theme <theme>` – override UI theme (`default`, `catppuccin`, `dracula`, `nord`, `gruvbox`, `monokai`, `solarized`).
    - `--session <id>` – resume a specific saved chat session.

---

### 3. New Features in Detail

#### 3.1 Persistent Chat Sessions

**File:** `src/core/session-manager.ts`  
**What it does:**

- Stores each chat in `~/.xibecode/sessions/<session-id>.json`:
  - `id`, `title`, `model`, `cwd`, `created`, `updated`
  - `messages` (exact Anthropic `MessageParam[]` used by the agent)
  - Optional `stats` (iterations, tool calls, files changed, changed files)
- Public API:
  - `createSession({ title?, model, cwd? })`
  - `loadSession(id)`
  - `saveSession(session)`
  - `saveMessagesAndStats({ id, messages, stats, titleFromFirstMessage? })`
  - `listSessions()` (metadata only, sorted by `updated`)
  - `deleteSession(id)`
  - `getSessionsDirectory()`

**Chat integration (`src/commands/chat.ts`):**

- On start:
  - If `--session <id>` is provided and exists ⇒ loads that session and seeds the agent with its `messages`.
  - Otherwise ⇒ creates a fresh session for the current model + cwd.
- After each user/AI turn and on exit:
  - Saves updated messages + stats back to the session JSON.

**Commands:**

- `/new` – start a new session with a clean agent and history.
- `/sessions` – list all sessions and switch into the chosen one (restoring messages into the agent).

---

#### 3.2 Theme System

**File:** `src/ui/themes.ts`  
**What’s included:**

- `ThemeName` union:
  - `default | catppuccin | dracula | nord | gruvbox | monokai | solarized`
- `ThemeTokens` interface: `brand`, `border`, `text`, `dim`, `success`, `error`, `warn`, `info`, `tool`, `user`, `assistant`, `code`, etc. – all as chalk style functions.
- `THEME_NAMES` – exportable list for menus.
- `getTheme(name)` – returns a `ThemeTokens` instance for the given name (falls back to `default`).
- `isThemeName(x)` – simple type guard for user input validation.

**Enhanced UI integration (`src/ui/enhanced-tui.ts`):**

- `EnhancedUI` now takes a theme:
  - `constructor(verbose = false, themeName: ThemeName = 'default')`
  - Holds internal `themeName` and `T` (`ThemeTokens`).
  - All output colors now go through `this.T.*`.
- Runtime theme controls:
  - `setTheme(themeName: ThemeName)`, `getThemeName()`
  - `setShowDetails(bool)`, `getShowDetails()`
  - `setShowThinking(bool)`, `getShowThinking()`

---

#### 3.3 Chat Slash Commands

**File:** `src/commands/chat.ts`

Commands now include:

- `/help` – static help panel listing all local commands (no AI call).
- `/mcp` – show connected MCP servers, tools, resources, and prompts.
- `/new` – create a new chat session (fresh state).
- `/sessions` – list and switch between saved sessions.
- `/models` – basic model picker (updates default model in config).
- `/themes` – select any of the built‑in themes.
- `/export` – export current session to Markdown.
- `/compact` – compact long conversations to save context window.
- `/details` – toggle verbose tool call input/output, diffs, and error stacks.
- `/thinking` – toggle the thought spinner / “AI is thinking” updates.
- Regular commands:
  - `clear`, `tools on`, `tools off`, `exit`, `quit` (unchanged semantics).

---

#### 3.4 Export & Compact

**Files:**

- `src/core/export.ts`
- `src/commands/chat.ts`

**Export:**

- `exportMessagesToMarkdown(messages, meta)` and `exportSessionToMarkdown(session)` produce a readable transcript:
  - Session title, model, created/updated.
  - Role‑labelled conversation (`**You**:`, `**Assistant**:`).
- `/export` command:
  - Grabs current `ChatSession` + agent messages.
  - Writes markdown to a file under your `~/.xibecode` area (session‑id‑based filename).

**Compact:**

- `/compact`:
  - If the conversation is short, does nothing (and reports that).
  - For longer histories:
    - Replaces the oldest part of the conversation with a single synthetic assistant “summary” message.
    - Keeps only a small window of the most recent messages (for continuity).
  - Saves the compacted history back to the current session.

---

#### 3.5 `!` Shell Commands

**File:** `src/commands/chat.ts` (`handleShellBang`)  
**Behavior:**

- Any input starting with `!` runs as a shell command, e.g.:

```bash
!ls -la
!git status
!bun test
```

- Implementation:
  - Uses the existing `run_command` tool via `CodingToolExecutor.execute`.
  - Prints nicely formatted stdout/stderr blocks.
  - Synthesizes a follow‑up message containing:
    - The original command.
    - The captured stdout (and stderr if present).
  - Sends that summary into the AI agent as the next turn, so the model can reason about command output.

---

#### 3.6 Fuzzy `@` File Search

**Files:**

- `src/core/context.ts` – existing `ContextManager.searchFiles` (fast‑glob).
- `src/commands/chat.ts` – `handleAtPathFuzzy`.

**Usage:**

- `@` + text → fuzzy match on filenames:

```bash
@src/       # list all matches under src/
@user       # anything containing "user" in the path
@.test.ts   # show test files
```

- Implementation:
  - Builds a glob like `**/*<typed>*`.
  - Uses the `ContextManager.searchFiles` wrapper around `fast-glob`.
  - Prints up to 100 matches with a compact, colored list (file icon + relative path).

---

### 4. TUI & Status Bar Enhancements

**File:** `src/ui/enhanced-tui.ts`

- New `renderStatusBar` method:

```ts
ui.renderStatusBar({
  model,
  sessionTitle,
  tokensLabel,
  cwd,
  toolsEnabled,
  themeName,
});
```

- Chat loop calls this after each successful AI response and after `!` commands (when enabled).
- Status bar shows:
  - Model name.
  - Session title.
  - Tools on/off.
  - Current working directory.
  - Theme name (optional).
- Controlled via config (`statusBarEnabled`).

---

### 5. Configuration Additions

**File:** `src/utils/config.ts`

New fields in `XibeCodeConfig`:

- `theme?: string`
- `sessionDirectory?: string`
- `showDetails?: boolean`
- `showThinking?: boolean`
- `compactThreshold?: number`
- `defaultEditor?: string`
- `statusBarEnabled?: boolean`
- `headerMinimal?: boolean`

Helper methods:

- `getTheme()`
- `getSessionDirectory()`
- `getShowDetails()`
- `getShowThinking()`
- `getCompactThreshold()`
- `getDefaultEditor()`
- `isStatusBarEnabled()`
- `isHeaderMinimal()`

Defaults:

- `theme: "default"`
- `showDetails: false`
- `showThinking: true`
- `compactThreshold: 50000`
- `statusBarEnabled: true`
- `headerMinimal: false`

---

### 6. Internal Agent & API Changes

- `EnhancedAgent` (`src/core/agent.ts`):
  - New `setMessages(messages: MessageParam[])` method for restoring session histories or future undo/redo logic.
  - Used by chat when switching or compacting sessions.

All other tool and agent behavior (looping, safety, file editing, MCP, git/test tools) remains the same as previous versions.

---

### 7. Building & Installing v0.0.7

From the repo root:

```bash
# Install deps (prefer Bun or pnpm)
bun install         # or: pnpm install

# Build TypeScript → dist/
bun run build
```

Install globally for local testing:

```bash
# Recommended: pnpm global link
pnpm link --global

# Or with Bun
bun link
```

Verify:

```bash
xibecode --version
xibecode chat
```

---

### 8. Known Limitations / Notes

- Some of the existing unit tests (git utilities, mock filesystem, test‑runner parsing) may not pass out‑of‑the‑box in all environments, especially when the test suite assumes a particular git layout or package manager. These are pre‑existing expectations and do **not** affect the new TUI features.
- The full‑screen, Ink‑based TUI (split panes, vim‑style navigation, live logs) is **not** part of this release – it remains a future Phase 2 item.

---

### 9. Upgrade Guide

From a previous 0.0.x:

```bash
# Using pnpm
pnpm add -g xibecode@0.0.7

# Or Bun (from source)
git pull
bun install
bun run build
bun link
```

Configuration is backwards‑compatible; new fields (theme, TUI settings) are optional and will fall back to sensible defaults.

