# Changelog

All notable changes to XibeCode will be documented in this file.

## [1.4.0] - 2026-07-19

### Release

- **`xibecode-core` 1.4.0** and **`xibecode` 1.4.0** (aligned).
- CLI depends on **`xibecode-core` ^1.4.0**.

### Agent loops

- **Unlimited iterations by default** — `maxIterations: 0` (or `-d 0`) means no hard turn cap.
- Core normalizes `<= 0` to unlimited; finite positive values still enforce a cap.
- Chat, gateway, cron, and ACP use the same semantics (no accidental 50/80/150 clamps).
- Economy mode still applies `economyMaxIterations` as a cost bound.

### Providers

- Expanded **provider catalog** (Routing.run, zenllm.org, OpenRouter, DeepSeek, Gemini, Grok, Z.AI, Kimi, MiniMax, Fireworks, Novita, Hugging Face, OpenCode, Kilo, NVIDIA NIM, Xiaomi MiMo, StepFun, Arcee, GMI, LM Studio, Azure Foundry, and more).
- Shared `listSetupProviders()` for setup wizard, chat TUI, and ACP.
- Generic API-key resolution from each provider’s env key(s).

### Gateway lifecycle (unchanged API, documented)

- Keep **`xibecode gateway --install|--start|--stop|--status`** for the 24/7 process.
- In-chat **`/stop`** aborts the current coding run only.

### Setup & docs

- Interactive **`xibecode setup`** (model / gateway / agent) with plain numbered menus.
- Site docs (xibeai.in): agent engine, providers, setup, gateway, cron, learning loop notes.

## [1.3.23] - 2026-07-19

### CLI

- **`xibecode setup`** — interactive setup wizard for easier onboarding:
  - `xibecode setup` — full wizard (model → 24/7 gateway → agent defaults)
  - `xibecode setup model` / `setup gateway` / `setup agent` — section-only
  - `xibecode setup --quick` — model + Telegram gateway
  - `xibecode setup --non-interactive` — print flag/env guidance for CI/headless
  - Writes `~/.xibecode/gateway.env`, optional systemd install/start

## [1.3.22] - 2026-07-19

### Release

- **`xibecode-core` 1.3.22** and **`xibecode` 1.3.22** (aligned versions).
- CLI depends on **`xibecode-core` ^1.3.22**.

Includes the 24/7 coding gateway (Telegram / Discord / Slack, cron, delivery ledger, circuit breakers, DM pairing), provider failover pool, and learning loop (curated MEMORY/USER, LLM post-turn review, write-approval, session FTS, skill learner).

## [1.3.20] - 2026-07-19

### Full learning loop + gateway reliability

#### Core (`xibecode-core` **1.3.18**)
- **LLM post-turn review** (optional cheap model via `XIBECODE_REVIEW_*` / OpenAI / OpenRouter keys)
- **Write-approval** staging for memory/skills (`XIBECODE_MEMORY_WRITE_APPROVAL`, `memory approval on`)
- **Session FTS index** (JS inverted + optional `node:sqlite` FTS5)
- Curated MEMORY/USER, skill learner, tools: `curated_memory`, `session_search`, `save_skill`

#### CLI (`xibecode` **1.3.20**)
- `memory pending|approve|reject|approval`
- `pair list|approve|revoke` — DM pairing codes for Telegram/Discord/Slack
- Gateway: **delivery ledger**, **circuit breakers**, **pairing**, redelivery on restart

## [1.3.19] - 2026-07-19

### Learning loop (Hermes-style, coding-focused)

#### Core (`xibecode-core` **1.3.17**)
- **Curated memory** — `MEMORY.md` + `USER.md` under `~/.xibecode/memories/` with char limits (frozen snapshot in system prompt).
- **Post-turn review** — after each completed run: extract preferences/lessons, update curated + neural memory, optionally create a learned skill.
- **Session search** — keyword search over past sessions (`session_search` tool).
- **Skill learner** — auto-save complex successful workflows to `~/.xibecode/skills/learned/`.
- Tools: `curated_memory`, `session_search`, `save_skill` (plus existing `remember_lesson` / `update_memory`).

#### CLI (`xibecode` **1.3.19**)
- `xibecode memory curated` — show MEMORY/USER
- `xibecode memory sessions <query>` — search past chats
- `xibecode memory skills` — list learned skills

## [1.3.18] - 2026-07-19

### CLI (`xibecode`) — coding-focused 24/7 gateway

- Bump to **1.3.18**.
- **Telegram polish**: tool progress (edit-in-place), Markdown code replies, `/stop`, `/workdir`, `/progress`, message queue while busy, document attach hints.
- **Discord** adapter (Gateway WebSocket + REST). Env: `DISCORD_BOT_TOKEN`, `DISCORD_ALLOWED_USERS`, `DISCORD_HOME_CHANNEL` (enable Message Content Intent).
- **Slack** adapter (Socket Mode). Env: `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_ALLOWED_USERS`, `SLACK_HOME_CHANNEL`.
- Shared **ChatController** for all platforms — coding system prompt, per-chat workdir, abortable agent runs.
- Cron delivery targets: `telegram`, `discord`, `slack` (and `platform:chatId`).

## [1.3.17] - 2026-07-19

### CLI (`xibecode`)

- Bump to **1.3.17**.
- Depend on **`xibecode-core` ^1.3.16**.
- **`xibecode gateway`** — Hermes-style 24/7 daemon:
  - Cron scheduler (60s tick)
  - Telegram long-polling messaging adapter
  - Per-chat session continuity under `~/.xibecode/gateway/sessions/`
  - **`--install`** writes a systemd user unit for always-on operation
  - **`--start` / `--stop` / `--status`** control the user service
- **`xibecode cron`** — manage scheduled agent jobs (`list`, `create`, `remove`, `pause`, `resume`, `show`, `edit`)
- Config keys: `fallbackProviders`, `telegramBotToken`, `telegramHomeChatId`, `gatewayWorkdir`
- Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USERS`, `TELEGRAM_HOME_CHANNEL`, `XIBECODE_FALLBACK_PROVIDERS`, `GATEWAY_ALLOW_ALL_USERS`

### Core (`xibecode-core`)

- Bump to **1.3.16**.
- **Provider pool / failover** (`ProviderPool`, `parseFallbackProviders`) — rotate API keys / providers on rate limits, outages, and auth failures for higher connection reliability.
- **`EnhancedAgent`** accepts `fallbackProviders` and automatically fails over mid-run.
- **Cron subsystem** — schedule parser (`30m`, `every 2h`, `0 9 * * *`, ISO), atomic job store (`~/.xibecode/cron/jobs.json`), tick lock, output ledger, `startCronScheduler`.

## [1.3.16] - 2026-05-24

### CLI (`xibecode`)

- Bump to **1.3.16**.
- Depend on **`xibecode-core` ^1.3.15** (npm).
- Include Zed-compatible ACP stdio server mode via **`--acp`** with fsCapabilities support.

## [1.3.15] - 2026-05-24

### Core (`xibecode-core`)

- Bump to **1.3.15**.

### CLI (`xibecode`)

- Bump to **1.3.15**.
- Depend on **`xibecode-core` ^1.3.15** (npm).
- Add Zed-compatible ACP stdio server mode via **`--acp`**, including numeric ACP protocol negotiation, session creation, prompt streaming through `session/update`, cancellation, and clean shutdown handling.

## [1.3.13] - 2026-05-22

### Core (`xibecode-core`)

- Bump to **1.3.13**.

### CLI (`xibecode`)

- Bump to **1.3.13**.
- Depend on **`xibecode-core` ^1.3.13** (npm).

### VS Code extension (`xibecode-vscode`)

- Depend on **`xibecode-core` ^1.3.13**.

### Desktop (`xibecode-desktop`)

- Depend on **`xibecode-core` ^1.3.13**.

## [1.3.11] - 2026-05-14

### CLI (`xibecode`)

- Depend on **`xibecode-core` ^1.3.10** (npm).

### VS Code extension (`xibecode-vscode`)

- Depend on **`xibecode-core` ^1.3.10**.

### Desktop (`xibecode-desktop`)

- Depend on **`xibecode-core` ^1.3.10**.

## [1.3.10] - 2026-05-14

### Core (`xibecode-core`)

- **1.3.10** — npm package README; keep semver aligned with the CLI release line.

### CLI (`xibecode`)

- Chat **`@` file picker:** locked **`⟦@path⟧`** tokens from the picker, caret jumps to end after select (remount fix), **Space** closes suggestions, **`/`**-wrapped directory labels (`/dir/`) vs plain file paths; flatten to cwd-relative **`@path`** for prompts.
- **`onSubmit`** stale closure fix so Enter selects from the picker without sending the message early.

## [1.3.9] - 2026-05-13

### CLI (`xibecode`)

- **`xibecode resume`** resumes host-stored sessions **locally** even when the profile uses E2B / `sandbox_full` (no implicit workspace sync on resume).
- **`xibecode resume cloud <sandbox-id>`** — alias of **`xibecode cloud resume`** for attaching to an existing E2B sandbox by id.

## [1.3.7] - 2026-05-10

### CLI (`xibecode`)

- **1.3.7** republish: npm does not allow reusing version **1.3.6** after it was unpublished; this release is the same code path with a clean build (test sources excluded from `dist/` via `tsconfig`).

## [1.3.6] - 2026-05-10

### CLI (`xibecode`)

- **Update awareness:** optional notice when starting chat if a newer version exists on npm (registry check with ~48h cache). Disable with `XIBECODE_DISABLE_UPDATE_CHECK=1`.
- **`xibecode whats-new`** and **`xibecode changelog`:** compare the installed CLI to the latest version on npm; links use the npm package page only.
- Documentation site: expanded **Chat slash commands** (`/setup`, `/config`, `/format`, `/model`, `/mode`, etc.).

### Core (`xibecode-core`)

- Lockstep **1.3.6** release with the CLI for a consistent published pair on npm.

## [1.0.4] - 2026-05-01

### Monorepo Restructure

- Restructured into pnpm workspace monorepo with Turborepo build orchestration
- Extracted core AI engine into `xibecode-core` package (published to npm)
- CLI remains as `xibecode` package, now depends on `xibecode-core`
- Two packages: `packages/core/` (xibecode-core) and `packages/cli/` (xibecode)
- Electron app in `electron/` as separate workspace package

### Breaking Changes

- Removed WebUI (`xibecode ui` command no longer exists)
- Project structure changed from flat `src/` to monorepo `packages/core/src/` and `packages/cli/src/`
- Old `tests/` directory removed (imports broken by migration, needs recreation)

### Fixes

- Complete TOOL_CATEGORIES map in modes.ts (56 tools now categorized, was 20)
- NeuralMemory initialization in all CLI entry points (chat, run, claude-style-chat)
- FileHandle leak in BackgroundAgentManager (DEP0137 warnings)
- ESM __dirname compatibility with builtInSkillsDir utility
- createRequire path resolution for package.json in monorepo structure

## [0.9.5] - 2026-04-13

### ✨ Improvements
- Added `xibecode diagnostics` to generate a unified diagnostics bundle.
- Added config profiles (`--profile`, list/set default profile) for isolated config sets.
- Improved `xibecode config` menu rendering across terminals (rawlist + robust fallback).
- Default model selection now fetches live from `GET <baseUrl>/models` using a Bearer token.

## [0.9.6] - 2026-04-13

### ✨ Improvements
- Chat now starts in `agent` mode by default.

## [0.5.0] - 2026-02-16

### 📝 Interactive Plan Mode
- Plan mode now asks clarifying questions with a Cursor-style overlay UI (numbered questions, A/B/C options, "Other..." text input)
- Searches the web using DuckDuckGo for research
- Generates `implementations.md` with checkbox tasks, file paths, and code snippets
- Inline plan preview card in chat with "View Plan" and "Build" buttons
- "Build" switches to agent mode and auto-executes the plan

### 💬 Chat History
- Per-project conversation persistence in `~/.xibecode/history/`
- History panel in activity bar with search, date grouping, and click-to-resume
- Auto-save after every assistant message
- New Chat button to start fresh conversations

### 🌐 WebUI Enhancements
- Environment Variables Editor — visual `.env` file editor with auto-detection, secret masking, live editing
- Media File Preview — images, videos, audio render as proper previews instead of binary in Monaco
- Thinking Animation — loading spinner with "Thinking..." text while AI processes
- Improved Tool Rendering — descriptive icons, status badges, and live progress indicators
- XibeCode ASCII Banner — gradient branding in chat welcome screen
- Smart Auto-Scroll — no forced scrolling when reading earlier messages
- Session Info Bar — status bar shows model, mode, session, tools, theme
- Donate button in activity bar linking to https://xibeai.in/donate

## [0.4.4] - 2026-02-15

### 🎨 WebUI Complete Redesign

Completely redesigned the WebUI with a **v0.dev-inspired professional layout**:

**Layout & UI:**
- Activity bar on far left with icon+label buttons (Chat, Design, Git, Connect, Vars, Template, Settings)
- Resizable chat panel on left with drag-to-resize divider
- Monaco code editor on right with file explorer sidebar
- Clean dark theme (#0a0a0a background) matching v0.dev aesthetics
- Collapsible panels with `<<` / `>>` toggle buttons

**Terminal:**
- Multi-terminal tab management with + and X buttons
- Real PTY support via Python bridge (no native deps needed)
- Fully interactive shell with colors, prompts, tab-completion, vim/nano support
- Independent terminal sessions per tab
- Removed unused "Problems" and "Output" tabs

**Settings:**
- Converted from sidebar to centered modal popup with backdrop blur
- 5 categories: AI Provider, Display, Development, MCP Servers, Shortcuts
- Monaco JSON editor for mcp-servers.json with syntax highlighting
- All 20+ config options exposed (provider, model, API keys, base URLs, max iterations, theme, show details/thinking, compact threshold, package manager, dry run, git strategy, test command, editor, session directory)
- Custom model input with API format selector (Anthropic/OpenAI/Auto-detect)
- Toggle switches for boolean settings
- Save success feedback with green "Saved!" button

**Git Panel:**
- Two tabs: Changes and History
- Changes tab: stage/unstage/discard files, commit message input, collapsible staged/unstaged sections
- History tab: visual commit graph with dots+lines, branch/tag badges, relative timestamps ("2h ago", "3d ago"), commit messages, author, short hash
- Color-coded file status badges (M=yellow, A=green, D=red, U=cyan, R=purple)
- Click file names to view diffs in Monaco editor

**Chat:**
- New Chat button (+ icon) to clear conversation
- v0.dev-style rounded input with white arrow send button
- Mode selector dropdown with 13 agent modes
- Connection status indicator
- Slash commands (/) and file references (@) with autocomplete popups

**Status Bar:**
- Shows current AI model (e.g., "claude-sonnet-4-5") with bot icon
- Connection status, agent mode, cursor position, file language, encoding

**File Operations:**
- Added `/api/files/tree` endpoint with recursive directory walking
- Path traversal protection
- Skips node_modules, .git, dist, build, etc.
- Sorts directories first alphabetically

**Backend API:**
- Expanded `/api/config` GET to return all 20+ config values in `raw` object
- Expanded `/api/config` PUT to accept all config fields
- Added `/api/mcp/file` GET/PUT for Monaco editor to read/write mcp-servers.json
- Added `/api/git/log` endpoint for commit history with graph data
- Added terminal WebSocket handler (`mode=terminal`) with Python PTY bridge

### 🐛 Bug Fixes

- Fixed Git panel crash when `status.files` is undefined
- Fixed config base URL to use original Anthropic API (`api.anthropic.com`) instead of custom proxy
- Replaced old CSS variables with direct Tailwind colors

## [0.2.0] - 2026-02-11

### 🎉 Major Features

#### AI-Powered Skill Synthesis

The `/learn` command now uses Claude AI to generate high-quality, structured skill files from documentation instead of raw text dumps.

**Before**: Raw HTML-stripped text with navigation elements and broken formatting  
**After**: Clean, comprehensive skills with:

- Overview & key concepts
- Properly formatted code examples  
- Best practices & gotchas
- Quick reference cheat-sheet

**Technical Details**:

- Uses Claude AI with 32,768 max tokens for synthesis
- Condensed doc summaries (up to 60K chars) for context
- Graceful fallback to basic formatting if AI unavailable
- Automatically uploads synthesized skills to marketplace

### 🔧 Improvements

- **Skills Marketplace Integration** (from v0.1.9):
  - `/marketplace` - Browse and install community skills
  - Auto-upload skills after `/learn`
  - Search by keywords and categories
  
### 🐛 Bug Fixes

- Fixed marketplace upload failures for large content (increased limit to 500KB)
- Fixed token limit issues in skill processing (now 32K tokens)
- Improved error handling for skill synthesis

### 📦 Dependencies

- Added `@anthropic-ai/sdk` for AI-powered skill generation

## [0.1.9] - 2026-02-11

### Features

- Skills Marketplace integration
- `/marketplace` command for browsing and installing skills
- Auto-upload to marketplace after `/learn`

## [0.1.8] - 2026-02-11

### Features

- `/learn` command for scraping documentation and creating skills
- Basic skill management improvements
