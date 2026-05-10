# Security

## Secrets

- API keys and env-based secrets are never logged or included in error messages. Display config uses masked values (e.g. `sk-ant-...`).
- Store keys in environment variables or the local config file; avoid passing them on the command line in shared environments.

## Agent-triggered execution (sandbox)

- Commands executed via the agent’s `run_command` tool run with the **same user and privileges** as the XibeCode process. There is no sandboxing of shell commands by default.
- **Recommendation**: For untrusted code or third-party repositories, run XibeCode inside a container (e.g. Docker) or a dedicated sandbox (e.g. E2B) so that agent-triggered commands cannot affect the host.
- The `SafetyChecker` in `src/utils/safety.ts` blocks obviously dangerous commands (e.g. `rm -rf /`, fork bombs). This is a best-effort filter, not a full sandbox.

### Team-hosted E2B gateway model

- If you use the new E2B integration with a **backend-held key**, keep `E2B_API_KEY` only on your gateway service (for example `packages/e2b-gateway`).
- Do **not** store `E2B_API_KEY` in CLI profile JSON or pass it to end users.
- The CLI should only hold a gateway URL and optional gateway auth token (`sandboxGatewayUrl`, `sandboxAuthToken`).
- `host_only`: command execution is remote, but file-edit tools still mutate the local workspace.
- `sandbox_full`: the CLI uploads a compressed workspace tarball (`local_push`) and file/shell operations run in E2B.
- Treat `sandbox_full` upload payloads as sensitive: exclude `.env*`, credentials, and build artifacts you do not need.
- Set explicit upload size caps in CLI (`sandboxSyncMaxMb`) and keep gateway auth enabled.
- If the gateway is behind Cloudflare orange-cloud proxying, allow machine clients on upload routes (`/sessions/*/sync`) via scoped WAF/Bot/BIC rules.
- Preview helpers (`/sessions/:id/preview-host`) expose externally reachable sandbox hostnames. Treat these URLs as sensitive runtime metadata and avoid posting them in public channels for private environments.
- Export endpoint (`/sessions/:id/export`) returns the full sandbox workspace archive. Keep gateway auth enabled and apply least-privilege network exposure.

## Input validation

- **File paths**: All file tools resolve paths under the working directory. Paths that escape the workspace (path traversal) are rejected via `sanitizePath()` in `src/utils/safety.ts`.
- **URLs**: The `fetch_url` tool only allows `http:` and `https:` URLs. Local and private addresses (localhost, 127.0.0.1, 192.168.x.x, 10.x.x.x, .local) are rejected by default to reduce SSRF risk. See `sanitizeUrl()` in `src/utils/safety.ts`.

## Dependencies

- CI runs `pnpm audit --audit-level=high`. High and critical vulnerabilities are treated as blocking. Fix or mitigate before merging.

## New stack (Confucius-aligned features)

- **Meta-agent / synthesized tools**: Session-scoped tools registered via `synthesize_tool` run the same sandbox as `run_command`; `SafetyChecker` and blocked-command rules apply. Scripts are not elevated.
- **Session memory**: Stored under `.xibecode/sessions/`; no API keys or secrets are written. Failure/learning summaries are plain text only.
- **PKG-style context**: Uses the local CodeGraph (AST) only; no external network or knowledge APIs.
- **Economy and multi-model routing**: When cost mode is economy, planning and execution model selection still use the economy model when configured. Self-correction retries in `run-pr` use the same config, so token/iteration caps apply to each attempt.
