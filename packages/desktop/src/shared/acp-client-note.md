# Desktop ACP client

Use the same approach as `packages/ext/src/services/acp-client.ts`:

1. Spawn `xibecode --acp` (or `xibecode acp`) with the project cwd.
2. JSON-RPC over stdio: `initialize` → `session/new` → `session/prompt`.
3. Handle `session/update` for text/tools; `session/permission` for dangerous tools.
4. Settings should read `~/.xibecode/profile-*.json` (same as CLI), not a separate secret store.

This keeps desktop, VS Code, and CLI on one harness (stop-hooks, skills, models).
