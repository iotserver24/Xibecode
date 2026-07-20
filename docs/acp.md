# ACP (Agent Client Protocol)

XibeCode can run as an **ACP server** so IDEs and apps share the **same agent harness** as the CLI (tools, stop-hooks, skills, providers).

## Start server

```bash
xibecode --acp
# or
xibecode acp
```

Stdio JSON-RPC 2.0. Logs go to **stderr**; stdout is protocol only.

## VS Code extension

1. Install the XibeCode extension.
2. Settings:
   - `xibecode.useAcp` — **true** (default): spawn CLI ACP
   - `xibecode.cliPath` — optional path to `xibecode` / `xc`
3. Ensure CLI is on `PATH` (`pnpm link --global` from `packages/cli` or `npm i -g xibecode`).
4. Open the XibeCode chat view and send a task.

Dangerous tools trigger a VS Code permission prompt (`Allow once` / `Deny`).

Disable ACP (in-process agent): `"xibecode.useAcp": false`.

## Protocol (subset)

| Method | Direction | Purpose |
|--------|-----------|---------|
| `initialize` | client→server | Handshake |
| `session/new` | client→server | Create session (`cwd`) |
| `session/prompt` | client→server | Run agent turn |
| `session/cancel` / `agent/cancel` | client→server | Abort |
| `session/permission` | client→server | Answer dangerous-tool prompt |
| `session/update` | server→client | Stream / tools / **permission_request** |

## Zed / JetBrains

Point the editor’s ACP agent command at:

```text
xibecode --acp
```

(with working directory = project root).

## Desktop app

Prefer the same stdio ACP client pattern as the extension (`AcpClient` in `packages/ext/src/services/acp-client.ts`). Do not re-implement a second agent loop.

## Related env

| Env | Effect |
|-----|--------|
| `XIBECODE_STOP_HOOKS=0` | Disable stop-hooks |
| `XIBECODE_STREAM_EDIT=0` | Disable progressive Telegram draft edits |
| `XIBECODE_EXT_ACP=1` | Force extension ACP (also VS Code setting) |
