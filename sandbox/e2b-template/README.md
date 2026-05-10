# E2B Custom Sandbox Template

This template is intended for XibeCode `sandbox_full` mode so command execution and workspace files both live inside E2B.

## Includes

- Node.js 20
- `pnpm` (via Corepack)
- **XibeCode CLI** (`xibecode` / `xc`) pinned to match the current npm release (see `Dockerfile`; bump when you publish a new CLI)
- `git`, `curl`, `jq`, `tar`
- Build tooling: `python3`, `make`, `g++`
- Default workspace path: `/home/user/workspace`

## Build and publish

From the repo root (requires Docker and `E2B_API_KEY` in the environment):

```bash
pnpm dlx @e2b/cli@latest template build -p sandbox/e2b-template -d Dockerfile -n xibecode-full-sandbox
pnpm dlx @e2b/cli@latest template publish -p sandbox/e2b-template -y
```

This template is registered as **template id** `9piviazh0jkh5kzb93jd`, **alias** `xibecode-full-sandbox` (published name may show as `iotserver24/xibecode-full-sandbox` in the CLI). Either form works with `Sandbox.create(...)` and the gateway env below.

Set on the gateway:

```bash
export XIBECODE_E2B_TEMPLATE="9piviazh0jkh5kzb93jd"
# or: export XIBECODE_E2B_TEMPLATE="xibecode-full-sandbox"
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
