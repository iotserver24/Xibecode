# Security

## Secrets

- API keys and env-based secrets are never logged or included in error messages. Display config uses masked values (e.g. `sk-ant-...`).
- Store keys in environment variables or the local config file; avoid passing them on the command line in shared environments.

## Agent-triggered execution (sandbox)

- Commands executed via the agent’s `run_command` tool run with the **same user and privileges** as the XibeCode process. There is no sandboxing of shell commands by default.
- **Recommendation**: For untrusted code or third-party repositories, run XibeCode inside a container (e.g. Docker) or a dedicated sandbox (e.g. E2B) so that agent-triggered commands cannot affect the host.
- The `SafetyChecker` in `src/utils/safety.ts` blocks obviously dangerous commands (e.g. `rm -rf /`, fork bombs). This is a best-effort filter, not a full sandbox.

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
