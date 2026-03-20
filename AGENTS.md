# AGENTS.md

## Learned User Preferences

- Always use **pnpm** as the package manager; fall back to bun only if pnpm is unavailable; never use npm directly for installs or scripts.
- When doing a version release, bump `package.json`, `electron/package.json`, and any hard-coded version strings in source (e.g. `ui.header(...)` in `src/commands/run.ts` and `src/commands/run-pr.ts`) all together.
- After making code changes, always edit the file directly — do not describe what to change without applying it.
- After every edit, explain what was changed and why, concisely.
- When building for release: run `pnpm run build` then `pnpm run build:webui`, then `git add`, `git commit`, `git push`, and `pnpm publish --access public` — all in one unattended sequence.
- When a `git push` is rejected due to diverged branches, resolve via `git pull --rebase origin main` (not merge), fix any lockfile conflicts, then continue with `GIT_EDITOR=true git rebase --continue`.
- Do not force-push (`--force`) without the user explicitly asking; use `--force-with-lease` if needed.
- Always pass `--access public` when publishing to npm (`pnpm publish --access public`).
- Prefer non-interactive flags on all CLI commands (e.g. `--yes`, `-y`, `GIT_EDITOR=true`) so commands never hang waiting for input.
- When explaining code, respond in plain language without emojis unless explicitly requested.
- For `xibecode run-pr`, the PR description should include detailed per-file change rationale plus verification details (test command + pass/fail + duration) and any self-correction retries; not just iteration/tool-count stats.
- For commit messages, use the conventional commits style (`feat:`, `fix:`, `chore:`, etc.).

## Learned Workspace Facts

- Project: **XibeCode** — an autonomous AI coding CLI tool (`xibecode`), published as an npm package at `xibecode`.
- Repo path: `/home/r3ap3reditz/codes/xibecode`; GitHub: `https://github.com/iotserver24/Xibecode`
- Primary package manager: **pnpm** with `pnpm-lock.yaml` at root; webui has its own `webui/pnpm-lock.yaml`.
- Build commands: `pnpm run build` (TypeScript → `dist/`) and `pnpm run build:webui` (Vite → `webui-dist/`).
- Version string lives in three places: `package.json`, `electron/package.json`, and the `ui.header(...)` call in `src/commands/run.ts` (and `src/commands/run-pr.ts`).
- Agent mode `agent` must include `'network'` in `allowedCategories` in `src/core/modes.ts` to allow `fetch_url`, `web_search`, and skills-sh tools.
- `xibecode run` must call `process.exit(0)` in the `finally` block (unless `--non-interactive`) to avoid hanging after task completion.
- Electron desktop app lives in `electron/` with its own `package.json`; it is a separate build from the CLI.
- The `site/` and `site/app/donate/` directories are excluded from git and added to `.cursorignore`.
- `pnpm publish --access public` is required because the package is unscoped but published to npm public registry.
- All agent modes are defined in `src/core/modes.ts` under `MODE_CONFIG`; each has `allowedCategories` controlling tool access.
- `run-pr` command (`src/commands/run-pr.ts`) requires `gh` CLI installed and authenticated (`gh auth login`) before use.
- `xibecode run-pr` runs the agent, performs test verification (unless `--skip-tests`) with up to 2 self-correction retries on failures, and the resulting PR triggers CI security checks including `pnpm audit --audit-level=high`.
