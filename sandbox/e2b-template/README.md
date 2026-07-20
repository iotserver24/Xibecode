# E2B Custom Sandbox Template

This template is intended for XibeCode `sandbox_full` mode so command execution and workspace files both live inside E2B. It is also the default image for **hosted** instances (4 vCPU / 8 GB).

## Includes

- Node.js 20
- `pnpm` (via Corepack)
- **XibeCode CLI** (`xibecode` / `xc`) pinned to match the current npm release (see `Dockerfile`; bump when you publish a new CLI)
- `git`, `curl`, `jq`, `tar`
- Build tooling: `python3`, `make`, `g++`
- Default workspace path: `/home/user/workspace`

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
