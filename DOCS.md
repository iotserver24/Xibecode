# XibeCode — Complete Usage Guide

Version: **0.6.1**

---

## Table of Contents

1. [Installation](#installation)
2. [First-time Setup](#first-time-setup)
3. [Commands Reference](#commands-reference)
   - [run](#run)
   - [run-pr](#run-pr)
   - [chat](#chat)
   - [config](#config)
   - [ui](#ui)
   - [mcp](#mcp)
4. [Agent Modes](#agent-modes)
5. [Skills System](#skills-system)
6. [MCP Integration](#mcp-integration)
7. [Memory System](#memory-system)
8. [Provider Recipes](#provider-recipes)
9. [Sandbox / CI Usage](#sandbox--ci-usage)
10. [Platforms and devices](#platforms-and-devices)
11. [Tips & Tricks](#tips--tricks)

---

## Installation

```bash
npm install -g xibecode
# or
pnpm add -g xibecode
```

Verify:

```bash
xibecode -v   # → 0.6.1
```

---

## First-time Setup

Run these commands once. All are non-interactive and safe for scripting/sandboxes.

### Anthropic (Claude)

```bash
xibecode config --set-key "sk-ant-..."
xibecode config --set-url "https://api.anthropic.com"
xibecode config --set-model "claude-3-7-sonnet-20250219"
```

Per-run override (no config needed):

```bash
xibecode run --provider anthropic \
             --api-key "sk-ant-..." \
             --model "claude-3-7-sonnet-20250219" \
             "your task"
```

### OpenAI (GPT)

```bash
xibecode config --set-key "sk-..."
xibecode config --set-url "https://api.openai.com/v1"
xibecode config --set-model "gpt-4o"
```

### OpenRouter

```bash
xibecode config --set-key "sk-or-..."
xibecode config --set-url "https://openrouter.ai/api/v1"
xibecode config --set-model "anthropic/claude-3.7-sonnet"
```

### Zhipu AI (GLM)

```bash
xibecode config --set-key "YOUR_KEY"
xibecode config --set-url "https://open.bigmodel.cn/api/paas/v4"
xibecode config --set-model "glm-4-flash"
```

Verify config:

```bash
xibecode config --show
```

### Cost-saving (economy) mode

Reduce API cost by using a cheaper/smaller model and lower iteration and token caps:

```bash
xibecode config --set-cost-mode economy
xibecode config --set-economy-model claude-haiku-4-5-20251015
```

- **Economy mode**: When enabled, `run`, `run-pr`, and `chat` use the economy model (if set) and cap max iterations at the economy limit (default 50). Use for high-volume or non-critical runs.
- **Per-command override**: `xibecode run --cost-mode economy "task"` or `xibecode run-pr --cost-mode normal "task"` to override config for one run.

---

## Commands Reference

### `run`

Autonomous one-shot coding session. The agent reads/edits files, runs shell commands, searches the web, manages git, and stops when done.

```bash
xibecode run "your task"
xibecode run --file task.txt
xibecode run "Fix TypeScript errors" --verbose
xibecode run "Refactor utils" --max-iterations 50
xibecode run "Preview only" --dry-run
```

| Flag | Description |
|------|-------------|
| `[prompt]` | Task to accomplish |
| `-f, --file <path>` | Read prompt from a file |
| `-m, --model <model>` | Model override |
| `--mode <mode>` | Initial agent mode (see [Agent Modes](#agent-modes)) |
| `-b, --base-url <url>` | Custom API base URL |
| `-k, --api-key <key>` | API key override |
| `--provider <provider>` | `anthropic` or `openai` |
| `-d, --max-iterations <n>` | Max agent iterations (default: `150`, `0` = unlimited) |
| `-v, --verbose` | Show detailed tool call logs |
| `--cost-mode <mode>` | `normal` or `economy` (cheaper model, lower iteration cap) |
| `--plan-first` | Force a strategic plan (one-shot, no tools) before execution (AX-lite) |
| `--mindset-adaptive` | Enable CoM-style reasoning mindsets (convergent/divergent/algorithmic) |
| `--dry-run` | Preview changes without writing |
| `--changed-only` | Focus only on git-changed files |
| `--non-interactive` | Suppress auto-exit (for programmatic embedding) |

---

### `run-pr`

Same as `run`, but **automatically creates a Git branch, commits changes, pushes to origin, and opens a GitHub PR**. Prints the PR URL and exits.

**Requires `gh` (GitHub CLI) to be installed and authenticated.**

```bash
# Install gh: https://cli.github.com/
gh auth login
```

```bash
xibecode run-pr "Fix the null pointer bug in src/core/agent.ts"
xibecode run-pr "Add rate limiting middleware" --verbose
xibecode run-pr "Refactor config" --branch feat/refactor-config
xibecode run-pr "Quick fix" --skip-tests --draft
```

**Full flow:**

```
prompt
  → pre-flight (git repo? gh installed? gh auth?)
  → agent run (same as `run`)
  → verify: any git changes?
  → run test suite (pnpm test / npm test)
  → create branch: xibecode/<slug>-<timestamp>
  → git add -A && git commit
  → git push -u origin <branch>
  → gh pr create --base <default-branch> --title ... --body ...
  → print PR URL
  → exit 0
```

The created PR description includes:

- Task summary
- Changes (rationale) per file (diff-based). In `--cost-mode economy`, explanation is budgeted and may fall back to file + `+/-` counts.
- Run stats (iterations, tool calls, and token/cost metrics when available)
- Verification (test command + pass/fail + duration) and any self-correction retries

| Flag | Description |
|------|-------------|
| `[prompt]` | Task to accomplish |
| `-f, --file <path>` | Read prompt from file |
| `-m, --model <model>` | Model override |
| `-b, --base-url <url>` | Custom API base URL |
| `-k, --api-key <key>` | API key override |
| `--provider <provider>` | `anthropic` or `openai` |
| `-d, --max-iterations <n>` | Max iterations (default: `150`) |
| `-v, --verbose` | Show detailed logs including git operations |
| `--cost-mode <mode>` | `normal` or `economy` (cheaper model, lower caps) |
| `--plan-first` | Force a strategic plan before execution (AX-lite) |
| `--mindset-adaptive` | Enable CoM-style reasoning mindsets |
| `--branch <name>` | Override auto-generated branch name |
| `--title <title>` | Override PR title |
| `--draft` | Open PR as draft |
| `--skip-tests` | Skip test verification before creating PR |

**Output example:**

```
  ✅ Pull Request created successfully!

  PR URL: https://github.com/your-org/your-repo/pull/42
```

---

### `chat`

Interactive terminal chat with full tool access. Supports slash commands, skill activation, marketplace browsing.

```bash
xibecode chat
xibecode chat --model claude-3-7-sonnet-20250219
xibecode chat --no-webui  # TUI only, no browser WebUI
```

**Slash commands inside chat:**

| Command | Description |
|---------|-------------|
| `/skill list` | List locally loaded skills |
| `/skill <name>` | Activate a skill |
| `/skill off` | Deactivate current skill |
| `/marketplace` | Browse community skills |
| `/learn <name> <url>` | Learn a new skill from documentation URL |
| `/mode <mode>` | Switch agent mode mid-session |
| `/clear` | Clear conversation history |
| `/exit` | Quit chat |

---

### `config`

Manage persistent configuration stored in your user profile.

```bash
xibecode config --set-key YOUR_API_KEY
xibecode config --set-url https://api.anthropic.com
xibecode config --set-model claude-3-7-sonnet-20250219
xibecode config --show
xibecode config --reset
```

---

### `ui`

Launch the browser-based WebUI dashboard with file diff view, session history, and real-time tool output.

```bash
xibecode ui
xibecode ui --port 4000
xibecode ui --open          # auto-opens browser
```

---

### `mcp`

Manage MCP (Model Context Protocol) servers — external tools that the agent can call.

```bash
xibecode mcp list           # list configured servers
xibecode mcp add            # open config file to add server
xibecode mcp remove <name>  # remove a server
xibecode mcp file           # show config file path
xibecode mcp edit           # open config file in editor
xibecode mcp init           # create default config file
xibecode mcp search <query> # search Smithery marketplace
xibecode mcp install <name> # install server from Smithery
xibecode mcp reload         # reload servers without restart
```

MCP config file location (JSON):

```
~/.config/xibecode/mcp-servers.json
```

Example entry:

```json
{
  "my-db": {
    "command": "npx",
    "args": ["-y", "@smithery/mcp-postgres"],
    "env": { "DATABASE_URL": "postgres://..." }
  }
}
```

---

## Agent Modes

Pass `--mode <name>` to `run` or switch inside `chat` with `/mode <name>`.

| Mode | Persona | Capabilities | Best for |
|------|---------|-------------|----------|
| `agent` | XibeCode | All tools: read/write files, shell, git, network, skills, MCP | Default — general-purpose coding |
| `plan` | Planner | Read + network only, writes `implementations.md` | Breaking down large tasks before coding |
| `debugger` | Dex | Read/write + shell + git + network | Bug hunting, error tracing |
| `tester` | Tess | Read/write + tests + git | Writing and running test suites |
| `security` | Sentinel | Read + network + write (report only) | Security audits |
| `review` | Nova | Read + git + network | Code review, PR feedback |
| `engineer` | Alex | Read/write + shell + git + network | Implementation-focused work |
| `researcher` | Sanvi | Read + network + write (notes) | Deep-dive research tasks |
| `seo` | Siri | Read + network + write | SEO analysis and optimization |
| `pentest` | Phantom | Read + network + write (report only) | Penetration testing |
| `data` | David | Read + write + shell | Data analysis |
| `architect` | Anna | Read + write (docs only) + git | System design |
| `product` | Agni | Read + write (PRDs) | Requirements gathering |

---

## Skills System

Skills inject specialized instructions into the agent's system prompt for a specific domain.

### Auto-discovery and install (agent mode)

The agent can find and install skills automatically when it encounters relevant tasks:

```bash
xibecode run "Set up a Next.js project with best practices"
# Agent will: search_skills_sh "nextjs" → install → use skill instructions
```

### Manual search + install

```bash
# In chat:
/skill list
/marketplace
/learn nextjs https://nextjs.org/docs

# The agent can also do it:
xibecode run "search and install a react skill then use it to refactor src/components"
```

### Manual file-based skills

Create `.xibecode/skills/<name>.md` with this format:

```markdown
---
name: my-skill
description: What this skill does
tags: react, typescript
---

## Instructions for the AI

When this skill is active, follow these conventions:
- Always use functional components
- Use TypeScript strict mode
...
```

---

## MCP Integration

MCP servers give the agent access to external tools — databases, browsers, APIs, file systems, etc.

When `get_mcp_status` is called (the agent does this automatically), it sees all connected servers and their available tools.

**Example: Connect a Postgres MCP server**

```bash
xibecode mcp install @smithery/mcp-postgres
# Edit config to add DATABASE_URL, then:
xibecode run "List all tables in the database and show their schemas"
```

**Example: Use a browser MCP server**

```bash
xibecode mcp install @smithery/mcp-playwright
xibecode run "Take a screenshot of https://example.com and describe the layout"
```

---

## Memory System

The agent automatically saves and retrieves project knowledge across sessions.

### How it works

- Stored in `.xibecode/memory.md` in the current working directory
- Loaded automatically at the start of every session
- Agent uses `update_memory` tool to save important facts

### What to save

```
xibecode run "Remember: this project uses pnpm, never npm. Tests run with vitest."
```

Or add directly to `.xibecode/memory.md`:

```markdown
## Project Memory

- Use pnpm for all package management
- TypeScript strict mode is enabled
- All components live in src/components/
- Run `pnpm test` to execute the test suite
```

### Session memory (this run)

Within a single `run` or `run-pr`, the agent keeps **session memory**: tool attempts, failures, and learnings. A compact summary is injected into the system prompt so the agent avoids repeating the same mistakes. Session data is persisted under `.xibecode/sessions/` and recent learnings can be loaded into the next run.

### Context pruning

Before each run, the CLI scores project files by relevance to the task (keyword match). The top N file paths are suggested to the agent so it can prioritize `get_context` and `read_file`. This reduces noise and token use on large repos.

- **Config**: `maxContextFiles` (default `40`). Set to `0` to disable (edit config file or use `config.set('maxContextFiles', 0)`).

### Multi-model routing

You can use a different model for strategic (planning) vs tactical/operational (execution) steps. Set `planningModel` and/or `executionModel` in config. When `--plan-first` is used, the strategic plan uses `planningModel` if set; the rest of the run uses `executionModel` if set, otherwise the default `model`.
- **Behavior**: Keyword-based scoring; extensions include `.ts`, `.tsx`, `.js`, `.py`, `.go`, `.md`, etc. `node_modules`, `.git`, `dist` are ignored.
- **PKG-style (optional)**: Set `usePkgStyleContext: true` in config to augment with AST/code-graph relevance (TypeScript/JavaScript). Helps on large codebases.

---

## Provider Recipes

### Anthropic (recommended for coding)

```bash
xibecode run \
  --provider anthropic \
  --api-key "$ANTHROPIC_API_KEY" \
  --model "claude-3-7-sonnet-20250219" \
  "your task"
```

### OpenAI GPT-4o

```bash
xibecode run \
  --provider openai \
  --api-key "$OPENAI_API_KEY" \
  --base-url "https://api.openai.com/v1" \
  --model "gpt-4o" \
  "your task"
```

### OpenRouter (any model)

```bash
xibecode run \
  --provider openai \
  --api-key "$OPENROUTER_API_KEY" \
  --base-url "https://openrouter.ai/api/v1" \
  --model "google/gemini-2.5-pro-exp-03-25" \
  "your task"
```

### Local Ollama

```bash
ollama serve &
xibecode run \
  --provider openai \
  --api-key "ollama" \
  --base-url "http://localhost:11434/v1" \
  --model "llama3.2" \
  "your task"
```

---

## Sandbox / CI Usage

All commands are fully non-interactive. Safe to run in Docker, GitHub Actions, or E2B sandboxes.

### Minimal sandbox setup

```bash
npm install -g xibecode

# Set config (non-interactive)
xibecode config --set-key "$ANTHROPIC_API_KEY"
xibecode config --set-url "https://api.anthropic.com"
xibecode config --set-model "claude-3-7-sonnet-20250219"

# Run a task
xibecode run "your task"
```

### GitHub Actions example

```yaml
- name: Run XibeCode task
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    npm install -g xibecode
    xibecode config --set-key "$ANTHROPIC_API_KEY"
    xibecode config --set-url "https://api.anthropic.com"
    xibecode config --set-model "claude-3-7-sonnet-20250219"
    xibecode run "Fix lint errors across the codebase"
```

### Auto PR from CI

```yaml
- name: Auto-fix and PR
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    npm install -g xibecode
    gh auth setup-git
    xibecode config --set-key "$ANTHROPIC_API_KEY"
    xibecode config --set-url "https://api.anthropic.com"
    xibecode config --set-model "claude-3-7-sonnet-20250219"
    xibecode run-pr "Fix all TypeScript type errors" --skip-tests
```

### Agent-triggered execution and safety

Agent-triggered shell commands (`run_command`) run with the **same user and privileges** as the XibeCode process. There is no sudo or elevation. For untrusted code or third-party repos, run XibeCode inside a **container or sandbox** (e.g. Docker, E2B, or a disposable VM).

- **Path and URL validation**: File paths used by tools are resolved under the working directory; paths that escape it (e.g. `../etc/passwd`) are rejected. The `fetch_url` tool only allows `http`/`https` URLs and blocks local/private addresses by default to reduce SSRF risk.
- **Blocked commands**: The built-in safety layer blocks obviously dangerous commands (e.g. `rm -rf /`, fork bombs). See `SECURITY.md` and `src/utils/safety.ts` for details.

---

## Platforms and devices

XibeCode is built to run across common platforms and device types.

| Surface | Platforms | Notes |
|--------|------------|--------|
| **CLI** | Linux (x64, ARM64), macOS (Intel, Apple Silicon), Windows (x64, ARM64) | Node.js 18+. ARM64 includes Raspberry Pi and ARM servers. |
| **WebUI** | Any browser | Responsive, mobile-friendly layout; touch-friendly. Optional PWA/installable. |
| **Headless / embedded** | Servers, Docker, Raspberry Pi | Use `xibecode run` or `xibecode run-pr` with env-based config (e.g. `ANTHROPIC_API_KEY`, `xibecode config`). No TUI required; suitable for CI, cron, or an agent daemon. |

CI runs on Linux x64 and ARM64 (where available) to validate the CLI. For headless usage, set your API key and endpoint via environment or config, then run tasks non-interactively.

---

## Tips & Tricks

### 1. Use `--dry-run` to preview before applying

```bash
xibecode run "Rename all instances of getUserById to fetchUserById" --dry-run
```

### 2. Load tasks from a file for complex prompts

```bash
cat > task.txt << 'EOF'
Refactor the authentication module:
1. Extract token validation into a separate utility
2. Add refresh token support
3. Write unit tests for all auth functions
4. Update the README with new auth flow docs
EOF
xibecode run --file task.txt --verbose
```

### 3. Use `--mode plan` for large tasks first

```bash
xibecode run --mode plan "Build a full REST API with auth, CRUD, and tests"
# Reviews implementations.md, then:
xibecode run --file implementations.md
```

### 4. Limit iterations to control costs

```bash
xibecode run "Quick bug fix" --max-iterations 20
```

### 5. Use `run-pr` for unattended automation

```bash
# Runs overnight, creates PR when done
nohup xibecode run-pr "Migrate all require() calls to ES module import/export" \
  --skip-tests > /tmp/xibecode.log 2>&1 &
```

### 6. Chain tasks with shell

```bash
xibecode run "Write the user service" && \
xibecode run "Write tests for the user service" && \
xibecode run-pr "Finalize user service with tests" --title "feat: user service"
```

### 7. Teach the agent project conventions once

```bash
xibecode run "Remember: we use Zod for validation, Prisma for DB, pnpm for packages, vitest for tests, and all API routes live in src/routes/"
```

### 8. Use `--verbose` when debugging agent behavior

```bash
xibecode run "Fix the broken test" --verbose 2>&1 | tee run.log
```
