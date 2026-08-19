# Changelog

## [1.17.24] - 2026-08-19

### Context (Grok Build style)

- Each turn is sent as a Grok-style envelope: first turn gets `<user_info>` (OS, shell, workspace, date), a git snapshot, and `AGENTS.md` / user rules, then the request in `<user_query>`. Later turns send only `<user_query>`.
- After compact, that envelope is put back so the model keeps cwd, rules, and the last task.
- First turn also injects ranked memory from earlier sessions (`~/.xibecode/memory/<workspace>/sessions/` plus MEMORY.md). After compact, memory is searched again. Session-end writes a topic log (no extra LLM). Compact flushes notes first so work is not lost.
- `/flush` and `/recall` on the gateway; `xibecode memory recall` on the CLI.

### Release

- `xibecode-core` **1.17.24** then `xibecode` **1.17.24** (npm). Existing sandboxes need **Update CLI**.

## [1.17.23] - 2026-08-19

### Computer pane

- The pane no longer flips to Terminal on every shell command (or to Browser on every frame). The agent chooses the view with a line `Computer: browser` or `Computer: terminal`. Opening a page still focuses Browser once.
- Live Chromium frames do not include an OS mouse pointer. The CLI injects a page-level cursor that follows CDP clicks so you can see where the agent is pointing.

### Release

- `xibecode-core` **1.17.23** then `xibecode` **1.17.23** (npm). Existing sandboxes need **Update CLI**.

## [1.17.22] - 2026-08-19

### Agent / browser

- Models that said "I understand, I will use `agent-browser` / `web_search`" and then stopped are nudged to actually call the tool (max 2 retries).
- `agent-browser` is documented as a CLI invoked via `run_command`, not a native tool name. Talk-first is no longer a substitute for tool calls.

### App

- `/new` no longer locks the composer as "Thinking…". History has a **New chat** button, and the header has the same action.
- Switching lanes snapshots the old transcript first so a first message after `/new` is not archived into the previous chat.

### Release

- `xibecode-core` **1.17.22** then `xibecode` **1.17.22** (npm). Existing sandboxes need **Update CLI**. New boxes get it from the rebuilt template.

### Hosting / E2B template

- `xibecode-full-sandbox` rebuilt with CLI/core **1.17.22**.

## [1.17.21] - 2026-08-19

### Computer pane (view-only)

- App inbox emits structured `computer` events for shell vs `agent-browser` (open / click / fill / screenshot). Terminal shows `$ command` plus a capped stdout tail.
- Live Chromium screencast: CLI proxies `agent-browser` JPEG frames from `ws://127.0.0.1:9223` at `GET /v1/computer/browser`. View-only — mouse/keyboard are never forwarded. Frames are not stored in the chat event log.
- Vectra proxies that stream at `/api/instances/:id/computer/browser`. The phone Computer pane plays live frames (ack-paced, ~8 fps) and falls back to screenshots if the stream is down.
- Stream port is pinned with `AGENT_BROWSER_STREAM_PORT=9223` (template + daemon env). The public `9223-{sandbox}.e2b.app` host is not used.

### Release

- `xibecode-core` **1.17.21** then `xibecode` **1.17.21** (npm). Existing sandboxes need **Update CLI**. New boxes get it from the rebuilt template.

### Hosting / E2B template

- `xibecode-full-sandbox` rebuilt with CLI/core **1.17.21**.

## [1.17.20] - 2026-08-19

### Harness / evidence

- Run handoffs now keep a verification evidence ledger: evidence IDs, command kind/scope, and an explicit `unknown` / `timeout` / `not_run` result. A missing exit code is never recorded as passed.
- Later file edits mark matching test/lint/build results **stale**. Targeted checks only go stale when they cover the edited file. Re-running the command clears stale.
- Equivalent commands collapse onto one row (`pnpm run test` / `npm test` / `pnpm exec vitest run`). Chained `&&` / `||` / `;` stay one result with one exit code.
- Each validation stores a redacted output summary (max 400 chars) and an `observedAt` timestamp.
- Resume, `/compact`, and `xibecode compact` restore the ledger from the last handoff. A newer persisted edit timestamp still stales older results after restart.

### Release

- `xibecode-core` **1.17.20** then `xibecode` **1.17.20** (npm). Existing sandboxes need **Update CLI**. New boxes get it from the rebuilt template.

### Hosting / E2B template

- `xibecode-full-sandbox` rebuilt with CLI/core **1.17.20**.

## [1.17.19] - 2026-08-19

### `/new` conversations

- `/new` (and `/reset`) now starts a **new session ID**. The previous transcript, run handoffs, session index entry, and file-history stay on disk.
- The old session is marked closed and linked as the parent of the new one. Project `MEMORY.md` / `USER.md` are not wiped.
- `/history` lists past conversations; `/history open <id>` switches the active lane. A running task must be `/stop`ped first.
- App inbox emits a `conversation` event and exposes `/v1/conversations`. Desktop history and the Vectra chat history sheet refresh immediately after `/new`.
- TUI `/clear` still only clears the visible display. `/new` is the real new conversation.

### Release

- `xibecode-core` **1.17.19** then `xibecode` **1.17.19** (npm). Existing sandboxes need **Update CLI**. New boxes get it from the rebuilt template.

### Hosting / E2B template

- `xibecode-full-sandbox` rebuilt with CLI/core **1.17.19**.

## [1.17.18] - 2026-08-19

### Tests / file history

- File-history backups honor `XIBECODE_FILE_HISTORY_DIR`. Tests write into a temp dir instead of `~/.xibecode/file-history`, so they stay green in a read-only home.

### Release

- `xibecode-core` **1.17.18** then `xibecode` **1.17.18** (npm). Existing sandboxes need **Update CLI**. New boxes get it from the rebuilt template.

### Hosting / E2B template

- `xibecode-full-sandbox` rebuilt with CLI/core **1.17.18**.

## [1.17.17] - 2026-08-19

### Daemon / memory

- Canonical session id is now shared by the daemon, transcript, `SessionMemory`, run handoffs, and session search. Transcript paths use the same cwd sanitizer as `SessionManager` (long paths no longer split across directories).
- Each completed, failed, interrupted, blocked, or compacted run writes a structured **run handoff** (task, status, changed files, validation, failures, remaining work) from observed tool events — not invented recap.
- Manual compact: `/compact` in chat and messaging/app, `compact` as a bare command, and `xibecode compact [--session <id>]`. Auto-compact uses the same pipeline (flush → PreCompact → handoff → compact → PostCompact → re-index).
- Second compact on the same session is rejected while one is in flight. Daemon shutdown flushes transcript writers before exit.
- Every daemon session/handoff is queued into the session FTS index. `session_search` returns title, project, status, and changed files, and times out instead of blocking the daemon.

### App

- Vectra Cloud 1.0.12: `/compact` is in the command palette and sends immediately. Compact status already surfaces in the live progress chip.

### Release

- `xibecode-core` **1.17.17** then `xibecode` **1.17.17** (npm). Existing sandboxes need **Update CLI**. New boxes get it from the rebuilt template.

### Hosting / E2B template

- `xibecode-full-sandbox` rebuilt with CLI/core **1.17.17** (daemon handoffs, `/compact`, session search).

## [1.17.16] - 2026-08-18

### Agent

- Preview links default to `https://{port}-{sandboxId}.e2b.app`. The model is told never to give the user localhost; outgoing chat rewrites `localhost` / `127.0.0.1` to that host when the sandbox id is known.
- New `preview_url` tool returns the public host for a port.
- Prompt no longer mentions a non-existent `list_files` tool (`list_directory` is the real name). Work policy: claim done only from tool results; prefer file tools over bash; background long-lived commands.
- Tool-loop guard blocks the same call after **4** identical results (was 6) and feeds that error back to the model.

### App inbox / vision

- Image uploads accept a hosted `url` (no base64). Same-name uploads no longer overwrite each other.
- `POST /v1/public` mints a token for Vectra `GET /api/public/media/{instance}/{token}`.
- Agent-runner does not wrap a https vision URL as base64.

### Release

- `xibecode-core` **1.17.16** then `xibecode` **1.17.16** (npm). Existing sandboxes need **Update CLI**. New boxes get it from the rebuilt template.

### Hosting / E2B template

- `xibecode-full-sandbox` rebuilt with CLI/core **1.17.16** (preview_url, hosted images, e2b.app links, tighter loop guard).

## [1.17.15] - 2026-08-17

### Providers

- **Pollinations** is the recommended default (`https://gen.pollinations.ai/v1`, model `openai`). Key from [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys). Huge free/cheap catalog plus extra credits.

### Agent

- Context usage counts **system prompt + tool schemas + history** (Hermes-style). The app chip is no longer “under 1k” while the real request is thousands of tokens.

### Release

- `xibecode-core` **1.17.15** then `xibecode` **1.17.15** (npm). Existing sandboxes need **Update CLI** for the token math; new boxes get it from the rebuilt template.

### Hosting / E2B template

- `xibecode-full-sandbox` rebuilt with CLI/core **1.17.15**.

### CI

- CLI `turbo.json` now waits for `xibecode-core#build`. The published CLI still depends on npm `^1.17.15`; without this, GitHub Actions compiled the CLI in parallel with core and failed with `Cannot find module 'xibecode-core'`.

## [1.17.14] - 2026-08-16

### Hosting / E2B template

- `xibecode-full-sandbox` rebuilt with CLI/core **1.17.14**, **Bun**, **uv**, and agent rescue tools (`tmux`, `lsof`, `killall`, `fzf`, `tree`, `git-lfs`, `build-essential`). **agent-browser + Chrome** still baked.

### Release

- `xibecode-core` and `xibecode` **1.17.14** (npm). Includes Nous Portal live `/models` pickers and workspace file shares from earlier 1.17.10 work.

## [1.17.10] - 2026-08-16

### Providers

- **Nous Research** (`nous`) talks to `https://inference-api.nousresearch.com/v1`. Keys: `NOUS_API_KEY` or `HERMES_API_KEY`.
- Model pickers (`setup`, `/model`, app, web) load **GET /models twice** — no key, then with key — and put live **free** ids first (`:free` or $0 pricing). No hardcoded free list.
- Always offer **Custom model…** so you can type any id.
- Inbox `GET /v1/models` (website `/api/instances/:id/models`).

### Agent

- Tool-loop guard no longer blocks different commands on the same tool. Only the exact same call (same args / same fetch result) is limited — warn at 3, block at 6.

### App inbox

- Turn clock (`busy`, `elapsedMs`, tools) is computed in the daemon and sent as `status` / `GET /v1/status`.
- Model picker sends up to 400 options; Telegram and the phone app page **10 at a time, 2 per row**, with prev/next.

### Hosting / E2B template

- `xibecode-full-sandbox` Dockerfile pinned to CLI/core **1.17.10**. Existing sandboxes stay on their bake until Update CLI.

## [1.17.9] - 2026-08-16

### App chat

- Context usage chip: tokens used / model max, auto-detected from models.dev (Hermes-style) with family fallback. Inbox emits `usage` and `GET /v1/status`.

### Hosting / E2B template

- `xibecode-full-sandbox` Dockerfile pinned to CLI/core **1.17.9** (version bump only). Existing sandboxes stay on their old bake until Update CLI.

## [1.17.8] - 2026-08-16

### Chat TUI

- Live **Thought** block while the model is working (OpenCode / Hermes style). Streams `<think>` / `<thinking>` tags, `reasoning_content`, and Anthropic thinking deltas instead of stripping them.
- `/thinking` toggles the thought pane. Status heartbeats like “AI is thinking…” stay off the transcript.

### App inbox

- SSE handshake sends a `ready` event so empty new chats are not stuck waiting for the first message.

## [1.17.7] - 2026-08-16

### Hosted sandbox files

- Wake HTTP (`:8788`) mints tokenized workspace download links: `https://8788-{sandboxId}.e2b.app/f/{token}/{name}`.
- Gateway `MEDIA:` delivery does **both**: native upload (Telegram / Discord / Slack / app) **and** the public share link so zips and big files stay downloadable after pause.
- E2B agent prompt requires `MEDIA:` for archives and exports (no “it’s at /workspace/…”).
- E2B template `xibecode-full-sandbox` rebuilt with CLI **1.17.7**.

### App chat / vision

- Agent talks before the first tool and between tool batches (what it understood, files it opened).
- New `see_image` tool publishes a public https URL and attaches pixels for vision. User photos from the phone app are attached the same way — not base64.
- Inbox serves unguessable `/v1/public/:token` files; website proxies them at `/api/public/media/:instanceId/:token`.

### App UI

- Finished tool rows collapse into “N tools used”; tap to expand. Live tools stay open while the agent is working.
- Opening a chat lands on the latest message.

## [1.17.5] - 2026-08-16

### App inbox (first-party chat)

- Daemon always starts an HTTP inbox on port **8790** (`XIBECODE_APP_INBOX_PORT`).
- Same `ChatController` as Telegram: slash commands, approvals, ask, files.
- JSON events (`typing`, `text`, `tool`, `ask`, `approve`, `picker`, `file`, `done`, `error`) — not ACP, not MarkdownV2.
- Auth: `XIBECODE_APP_INBOX_SECRET` or `XIBECODE_GATEWAY_TOKEN` (`XIBECODE_APP_INBOX_OPEN=1` for local).

### Core

- Recover leaked DeepSeek DSML / shell-tag tool calls so the agent loop keeps running.

### Messaging

- Discord channel / guild pairing scopes.

## [1.17.4] - 2026-07-25

### Fix

- **`curated_memory` permission denied / Unknown tool:** tool was implemented and
  advertised to the model but missing from `TOOL_CATEGORIES` in `modes.ts`, so
  mode permission checks rejected every call. Also registered `session_search`,
  `save_skill`, `list_skills`, and `view_skill` categories.

## [1.17.3] - 2026-07-25

### Telegram / E2B wake latency

- **Soft-wake:** after memory resume, template wake-http queues the DM and sends
  `SIGUSR1` to the live daemon (no Node cold start) — targets ~1–2s vs 5–6s.
- Cold path uses a fast restart (0.1s polls, short deleteWebhook timeout).
- Long-poll timeout 10s; drain pending on each cycle / abort for faster pickup.

## [1.17.2] - 2026-07-25

### Telegram / E2B wake

- Daemon drains `~/.xibecode/daemon/pending-telegram-updates.jsonl` on start so the
  first DM that woke a paused sandbox is processed automatically (no "send again").
- Template wake-http queues that update before restarting the long-poll bot.

## [1.17.1] - 2026-07-25

### Hosting / E2B template

- Custom template **wake-http** doorbell (`/opt/vectra/wake-http`, port 8788) for E2B auto-resume on public URL traffic — not part of the Telegram bot (bot stays long-poll).
- Template ships aligned CLI **1.17.1** tarballs.

### Patch

- Patch release for template rebuild + npm alignment.

## [1.17.0] - 2026-07-24

### Messaging: `/cmd` shell from Telegram (and other gateways)

- **`/cmd <command>`** runs a shell command in the chat **workdir** and returns stdout/stderr — no agent loop.
- Aliases: `/sh`, `/shell`. Empty `/cmd` shows usage.
- Default timeout **60s** (`XIBECODE_CMD_TIMEOUT_MS`). Output truncated if huge.
- Examples: `/cmd ls -la`, `/cmd pwd`, `/cmd tail -n 40 ~/.xibecode/daemon/logs/daemon.log`

### Memory: durable saves, clear “Saved” feedback

- **`curated_memory`** improved: richer WHEN/HOW/SKIP guidance, atomic **`operations` batch**, terminal success with `done` + **`note: "Write saved. This update is complete — do not repeat it."`**
- Success responses no longer dump the full entry list (reduces re-save thrash); overflow errors still return entries for consolidation.
- **Frozen snapshot** at session start stays fixed mid-session (disk writes still immediate; next session loads them) — stable system-prompt prefix.
- Telegram/gateway progress: **`🧠 saving MEMORY/USER…`** then **`💾 Saved · MEMORY · usage% · N entries`**; post-turn auto notes also surface as progress.
- Files: `~/.xibecode/memories/MEMORY.md` + `USER.md` (bounded char budgets).

### Auto-compact (context compression)

- **Preflight + post-turn** auto-compact each agent iteration when context nears budget.
- Trigger: **~75%** of context for typical windows (≤512k), **~50%** for huge windows — and never later than `window − autoCompactThreshold` (default 13k free for the next reply).
- Flow: **microcompact** (strip old tool results) → **full handoff** (structured summary + grounded facts + **token-budget tail**, not a fixed message count).
- User-visible status: **`🗜️ Compacting context — summarizing earlier conversation so I can continue…`** then **`✅ Context compacted · … tokens`** (Telegram progress included).
- Handoff tells the model not to re-answer resolved work; folds prior compaction summaries.
- Disable: settings `autoCompactEnabled: false` or env `XIBECODE_AUTO_COMPACT=0`.

## [1.6.7] - 2026-07-24

### e2b: Vite preview host allowlist

- Agent e2b context now requires Vite `server.host: '0.0.0.0'` and `server.allowedHosts: true` (or `.e2b.dev`) so `https://{port}-{sandboxId}.e2b.dev` is not blocked as "host is not allowed".

## [1.6.6] - 2026-07-24

### e2b `/update`: sudo first (fix EACCES)

- Global install under `/usr/lib/node_modules` is root-owned on e2b templates.
- **`/update yes`** now runs **`sudo -n npm i -g xibecode@…` first**, then plain npm, then user-local prefix fallback.
- Clearer failure logs (last install lines + EACCES hint). Use **Dashboard Update** if Telegram is still on an older CLI that only tried plain npm.

## [1.6.5] - 2026-07-24

### Runtime modes: `default` vs `e2b`

- **`default`** — local host daemon (no auto self-update restart).
- **`e2b`** — hosted sandbox (auto-detected or `XIBECODE_RUNTIME_MODE=e2b`):
  - `/update` · `/update yes` → `npm i -g xibecode@latest`, then **`sudo -n npm …`** if needed, then **restart daemon**
  - **Chat memory kept** in `~/.xibecode/daemon/sessions/` across restart
  - **Agent knows its sandbox id** (`E2B_SANDBOX_ID` or `/run/e2b/.E2B_SANDBOX_ID`) — injected into the system prompt; `/status` and `/mode` show it
  - **Passwordless `sudo -n`** allowed for package installs (not treated as high-risk approval); catastrophic cmds still blocked
  - Preview URL pattern: `https://{port}-{sandboxId}.e2b.dev`
  - Startup update offer only in e2b mode

## [1.6.4] - 2026-07-24

### Mid-run messages (steer, not only queue)

- Default **busy mode is `steer`**: while the agent is working, a new Telegram message is injected into the **same run** (after tools / before the next model step) — not parked until the whole task ends.
- Modes: `steer` | `queue` | `interrupt` via `XIBECODE_BUSY_INPUT_MODE`.
- `/queue <prompt>` still forces FIFO without interrupting; plain text steers by default.
- Ack: `⏩ Steered into current run…` (or interrupt / queue acks).

## [1.6.3] - 2026-07-24

### Telegram: real file & screenshot delivery

- Deliver **any** workspace file via `MEDIA:path` (PDF, zip, code, CSV, video, audio — not only PNG).
- **Relative paths** resolve against the session workdir (`MEDIA:screenshots/home.png` works).
- Routing: images → `sendPhoto`, video → `sendVideo`, audio → `sendAudio`, voice → `sendVoice`, else → **`sendDocument`** (≤50MB).
- **Auto-attach screenshots**: successful `take_screenshot` is queued and appended if the model omits `MEDIA:` — Telegram gets real photo uploads.
- Failed attachments notify the user; optional `[[as_document]]` / `[[audio_as_voice]]`.

## [1.6.2] - 2026-07-24

### Telegram: send any file (not just PNG) — unreleased intermediate

- Same media pipeline as 1.6.3 (shipped as **1.6.3**).

## [1.6.1] - 2026-07-24

### Telegram /stop + attachments

- **`/stop` frees the chat immediately** so the next message is not stuck until daemon restart (hung LLM no longer keeps the busy slot forever).
- **Text file attachments are downloaded** and inlined into the prompt (`.txt`, `.md`, code, etc. up to 512KB) so a prompt-in-file works.

## [1.6.0] - 2026-07-24

### Agent browser + anti-stuck (shipped)

- **agent-browser** is the default for `take_screenshot` (then Chromium).
- E2B template ships **xibecode 1.6.0** tarball + **agent-browser** + Chrome for Testing.
- Tool failures inject SYSTEM recovery (retry differently / report fail) and heartbeats show last error.
- Screenshot paths outside the workspace remapped to `screenshots/`.

## [1.5.6] - 2026-07-24

### Browser (agent-browser default)

- **Prefer `agent-browser`** for `take_screenshot` (then Chromium). Override with `XIBECODE_PREFERRED_BROWSER=chrome`.
- **E2B template** installs `agent-browser` + Chrome for Testing (`agent-browser install --with-deps`) and pins CLI **1.5.6**.
- Failed screenshots return **explicit RETRY OPTIONS** (alt command, remapped path, report failure + `TASK_COMPLETE`).

### Anti-stuck on tool failure

- After any failed tool batch, inject a **SYSTEM recovery** message: show the error and require retry-with-new-params, alternative tool, or finish with failure summary — no silent loops.
- Daemon chat: tool failures always logged; progress shows longer error text; heartbeats surface **last tool failed** instead of only “still checking”.

## [1.5.4] - 2026-07-24

### Screenshots / workspace paths

- **`take_screenshot` no longer fails on `/tmp/…` paths**: absolute paths outside the working directory (e.g. `/tmp/xibecode-shots/home.png` from old agent prompts) are **remapped** to `screenshots/<basename>` under the project root.
- Agent prompts (daemon chat + mode docs) now tell the model to use **workspace-relative** paths only (`screenshots/home.png`), never `/tmp` outside the sandbox workspace.

## [1.5.3] - 2026-07-24

### Daemon / multi-profile Telegram

- **Per-profile secrets**: `~/.xibecode/daemon-<profile>.env` is loaded when running `xibecode daemon --profile <name>` and **overwrites** global `gateway.env` / `daemon.env` keys (so a test bot no longer steals the App bot token or router `OPENAI_*` settings).
- **Legacy systemd unit no longer double-polls**: `xibecode-gateway.service` is a oneshot alias of `xibecode-daemon` (not a second `getUpdates` process). Fixes Telegram **409 Conflict** when both units were enabled.
- **Clearer daemon logs**: lines include `pid=` and `profile=`; non-default profiles also write `~/.xibecode/daemon/logs/daemon-<profile>.log`.

### Daemon verbose agent tracing

- **`XIBECODE_DAEMON_VERBOSE=1`** (or `XIBECODE_VERBOSE=1`) enables headless tool logging: `agent tool_call`, `tool_result`, `agent complete`, and always-on `agent error` lines in the daemon log / verbose stream.

### CLI

- **`xibecode update --to <semver>`** (and `--target`) replaces `--version`, which Commander reserved for printing the package version.

## [1.5.2] - 2026-07-21

### Gateway / Telegram UX ()

- **Tool progress as new messages** : each tool line is a new chat message instead of editing one long bubble. Tool results may still edit the last tool line only. Override with `XIBECODE_PROGRESS_GROUPING=accumulate`.
- **Progressive answer drafts off by default** — final answer is always a new message. Set `XIBECODE_STREAM_EDIT=1` to restore mid-turn draft edits.
- **Approval / ask buttons clear after resolve** : after you tap Once/Session/Always/Deny or a choice, the **same** prompt message is edited to the decision and the inline keyboard is removed (no stuck buttons).
- **`[[TASK_COMPLETE | summary=…]]` no longer leaks into Telegram**: stripped and rendered as a plain `✅ Done — …` footer (same idea as the TUI footer).

## [1.5.1] - 2026-07-20

### Gateway / Telegram media

- **MEDIA:/path** tags in agent replies are uploaded natively : Telegram `sendPhoto` / `sendVideo` / `sendVoice` / `sendDocument` via multipart/form-data ([Bot API](https://core.telegram.org/bots/api#sending-files)).
- Photo dimension/format failures fall back to `sendDocument` (no host path leaked on failure).
- `[[as_document]]` / `[[audio_as_voice]]` directives supported.
- Cron/home delivery also strips tags and sends attachments.

### Screenshots of generated sites

- **`take_screenshot`** is implemented (no bundled Playwright): prefers `agent-browser`, then headless Chrome/Chromium; localhost allowed.
- Tool result includes a **`MEDIA:`** line for the gateway so users receive the PNG in chat.
- Gateway system prompt + agent mode docs: build site → background server → screenshot → MEDIA in final reply.

### CI

- Workspace `xibecode-core` links + turbo build order (from prior fix).

## [1.5.0] - 2026-07-20

### Release

- **`xibecode-core` 1.5.0** and **`xibecode` 1.5.0**.

### Gateway / Telegram ()

- Short busy phrases (`on it`, `one sec`, …) — no "Got it — … in workspace" / no `_starting…_`.
- Progress bubble heartbeats **every 30s** while the agent is busy (`still on it · 30s`).
- `/clear` aliases `/new`.

### Harness / ACP (from 1.4.30+)

- Stop-hooks, post-edit verify defaults, tool-result budget, StreamConsumer, ACP permissions, VS Code ACP client.

## [1.4.30] - 2026-07-20

### Release

- **`xibecode-core` 1.4.30** and **`xibecode` 1.4.30**.
- CLI depends on **`xibecode-core` ^1.4.30**.

### E2B / Vectra Cloud — opt-in CLI update

- `xibecode update --check` / `--apply --yes [--version] [--restart]` (never silent).
- E2B detect (`isE2bHostedRuntime`); daemon notifies home chats when npm is newer.
- Messaging: `/update`, `/update yes` (install + **auto-restart** daemon), `/update no`.
- Hosting contract: `GET/POST …/cli-version` and `…/cli-update` (dashboard banner).
- Disable: `XIBECODE_DISABLE_UPDATE_CHECK=1` or `XIBECODE_DISABLE_AUTO_UPDATE=1`.
- Template pin example: `xibecode@1.4.30` (new sandboxes still need template rebuild).

### Providers & models ()

- Built-in provider catalog expanded; **models.dev** registry (100+ providers) for catalogs.
- Shared `fetchProviderModels` (live `/models` + models.dev + curated fallback).
- Anthropic-style headers for `/models`; filter non-chat models by default.

### Daemon / skills

- Load `daemon.env` / `gateway.env` on CLI boot; PID file; secret redaction in logs.
- Skills: home + nested `SKILL.md`, tools `list_skills` / `view_skill`, `/skills` slash.

All notable changes to XibeCode will be documented in this file.

## [1.4.2] - 2026-07-20

### Release

- **`xibecode-core` 1.4.2** and **`xibecode` 1.4.2** (aligned).
- CLI depends on **`xibecode-core` ^1.4.2**.

### Gateway (24/7 Telegram / Discord / Slack)

- Telegram UX: slash command menu, live tool progress, mid-run slash handling, `/stop`, message queue, `ask_user` with numbered options + arrow-key-friendly pickers.
- Model picker (`/model` / `/models`) with interactive inline keyboards (not text-only).
- Rigor levels (`yolo` / `default` / `strict`) stored per session and applied to tool safety.
- Dangerous-command approval prompts; process registry for background long-running commands.
- Delivery ledger + non-blocking poll loop fixes (no hang on mid-run slash or stuck `ask_user`).
- Quiet daemon stop when `xibecode-daemon` unit is not loaded.
- MarkdownV2 helpers and Telegram engine module under `gateway/telegram/`.

### E2B gateway lifecycle

- Idle **auto-pause** (`onTimeout=pause`) and **auto-resume** on next request.
- **23h continuous-run cycle**: pause → connect before E2B’s ~24h hard limit, then continue.
- Health/sessions expose lifecycle fields (`cycleCount`, continuous-run age).

### Core

- `process-registry` for tracked shell processes.
- Tool safety + mode tweaks so plan/review still allow command execution where appropriate.

### Sandbox template

- Custom template defaults target **4 vCPU / 8 GB RAM** (hosting tier); pin global CLI to `xibecode@1.4.2`.

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

### Learning loop

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
- **`xibecode gateway`** — 24/7 daemon:
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
