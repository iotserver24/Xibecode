## Project

- This repo is **XibeCode**, an autonomous AI coding CLI (`xibecode`) plus WebUI/Electron app.
- Main tasks are driven through `xibecode run` and `xibecode run-pr`.

## How to use `xibecode run-pr`

- Command creates an **end-to-end PR** from a natural-language task:
  - Runs the same autonomous agent as `xibecode run`.
  - Runs the test suite (prefers `pnpm test`, otherwise `npm test` if needed).
  - Creates a new branch (default `xibecode/<slug>-<timestamp>`).
  - `git add -A && git commit` the changes.
  - `git push -u origin <branch>`.
  - Calls `gh pr create` against the remote default branch and prints the PR URL.
- Prerequisites:
  - Git repo is clean enough to commit.
  - GitHub CLI `gh` is installed and authenticated (`gh auth login`).
- Typical invocations:
  - `xibecode run-pr "Fix TypeScript errors in src/core/agent.ts"`
  - `xibecode run-pr "Refactor config loading" --verbose`
  - `xibecode run-pr "Small hotfix" --skip-tests --draft`
  - `xibecode run-pr "Refactor utils" --branch feat/refactor-utils --title "Refactor shared utilities"`

## User Preferences (how this AI should behave)

- Use **pnpm** for installs and scripts; only fall back to **bun** if pnpm is unavailable; **never use npm** directly.
- On version bumps, update `package.json`, `electron/package.json`, and any hard-coded version strings in source (like `ui.header(...)` in `src/commands/run.ts` and `src/commands/run-pr.ts`) together.
- Always apply edits directly to files instead of just describing changes.
- After editing, briefly explain what changed and why (no emojis unless explicitly requested).
- For releases, prefer a non-interactive sequence: `pnpm run build`, `pnpm run build:webui`, then `git add`, `git commit`, `git push`, and finally `pnpm publish --access public`.
- When `git push` is rejected because local is behind remote, use `git pull --rebase origin main`, resolve conflicts (especially in `pnpm-lock.yaml`), then `GIT_EDITOR=true git rebase --continue` and push.
- Avoid force-push unless the user explicitly requests it; if needed, prefer `--force-with-lease`.
- Use conventional commit messages like `feat: ...`, `fix: ...`, `chore: ...`.
- Prefer non-interactive flags to avoid hanging (examples: `--yes`, `-y`, `GIT_EDITOR=true`, and similar).

