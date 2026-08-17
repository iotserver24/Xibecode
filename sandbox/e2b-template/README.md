# E2B Custom Sandbox Template

This template is intended for XibeCode `sandbox_full` mode so command execution and workspace files both live inside E2B. It is also the default image for **hosted** instances (4 vCPU / 8 GB).

## Includes

- Node.js 20 + `pnpm` + **Bun**
- **Python 3** + `python3-venv` + **uv**
- **XibeCode CLI** (`xibecode` / `xc`) + **agent-browser** + Chrome
- **git** + **git-lfs** + **gh**
- Search: `rg`, `fd`, `fzf`, `tree`, `jq`
- Process rescue: `tmux`, `lsof`, `psmisc` (`killall`), `procps`
- Fetch/bootstrap: `curl`, `wget`, `openssl`, `ca-certificates`, `build-essential`
- Archives: `tar`, `zip`/`unzip`, `xz-utils`, `rsync`, `openssh-client`
- Default workspace path: `/home/user/workspace`
- **Wake HTTP** (`/opt/vectra/wake-http`, port **8788**) — template doorbell for E2B
  [auto-resume on request](https://e2b.dev/docs/sandbox/auto-resume). Not part of the bot.
  Public URL: `https://8788-{sandboxId}.e2b.app/wake` (or `/telegram`).
  Workspace file shares (tokenized, no directory listing):
  `POST /share` (localhost) → `GET https://8788-{sandboxId}.e2b.app/f/{token}/{name}`.
  Start: `/opt/vectra/wake-http/start.sh` (hosting also starts it with the daemon).
- **App inbox** (daemon, port **8790**) — first-party Flutter / website chat.
  Public URL: `https://8790-{sandboxId}.e2b.app/health`. Started with `xibecode daemon`.

**Not baked** (install at runtime when needed): extra language stacks (Go/Rust), deploy CLIs, ffmpeg, project deps. Keep image well under 10 GB.

## Resources (hosting tier)

| Resource | Value |
|----------|--------|
| CPU      | 4 cores |
| Memory   | 8192 MB (8 GB) |

These are set at **template build** time via `--cpu-count` / `--memory-mb`.

## Build and publish

From the repo root (requires Docker and `E2B_API_KEY` in the environment):

```bash
# Load key (example)
set -a && source packages/e2b-gateway/.env && set +a

pnpm dlx @e2b/cli@latest template create xibecode-full-sandbox \
  -p sandbox/e2b-template \
  -d Dockerfile \
  --cpu-count 4 \
  --memory-mb 8192
```

Legacy alias (deprecated):

```bash
pnpm dlx @e2b/cli@latest template build -p sandbox/e2b-template -d Dockerfile -n xibecode-full-sandbox
```

Template **alias**: `xibecode-full-sandbox` (id is written into `e2b.toml` after build). Either form works with `Sandbox.create(...)` and the gateway env below.

Set on the gateway:

```bash
export XIBECODE_E2B_TEMPLATE="xibecode-full-sandbox"
# or the concrete template id from e2b.toml
```

Optional workspace root override:

```bash
export XIBECODE_SANDBOX_WORKSPACE_ROOT="/home/user/workspace"
```

## CLI config for full remote workspace

```bash
xibecode config --set-sandbox-mode e2b
xibecode config --set-sandbox-gateway-url "https://your-gateway.example.com"
xibecode config --set-sandbox-auth-token "your-team-token"
xibecode config --set-sandbox-session-strategy sandbox_full
```
