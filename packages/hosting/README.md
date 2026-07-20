# XibeCode Hosting

Sell **managed infrastructure** while the CLI stays open source.

Users sign up on this dashboard, provision a **4 vCPU / 8 GB** E2B sandbox (via your `e2b-gateway`), then run **AI + Telegram gateway setup** as remote commands inside that sandbox.

## Architecture

```
Browser dashboard  →  hosting API (this package)
                         │
                         ▼
                   e2b-gateway  →  E2B (your API key, never exposed to tenants)
                         │
                         ▼
              sandbox (xibecode-full-sandbox, 4c/8G)
```

- **Tenants never see your `E2B_API_KEY`.**
- They only store *their* LLM + Telegram tokens inside *their* sandbox (`~/.xibecode/gateway.env`).

## Requirements

1. Running **e2b-gateway** with `E2B_API_KEY` and `XIBECODE_E2B_TEMPLATE=xibecode-full-sandbox` (or template id).
2. Template built with **4 CPU / 8192 MB** (see `sandbox/e2b-template/README.md`).
3. Node 18+.

## Env

| Variable | Purpose |
|----------|---------|
| `PORT` / `XIBECODE_HOSTING_PORT` | Dashboard port (default `3847`) |
| `XIBECODE_HOSTING_JWT_SECRET` | Cookie JWT secret (required in prod) |
| `XIBECODE_HOSTING_DATA_DIR` | JSON DB path (default `~/.xibecode/hosting`) |
| `XIBECODE_SANDBOX_GATEWAY_URL` | e2b-gateway base URL |
| `XIBECODE_GATEWAY_TOKEN` | Bearer token for the gateway |

## Run

```bash
cd packages/hosting
pnpm install
pnpm dev
# open http://127.0.0.1:3847
```

Production:

```bash
pnpm build && pnpm start
```

## API (brief)

- `POST /api/auth/register` `{ email, password }`
- `POST /api/auth/login`
- `GET  /api/instances`
- `POST /api/instances` `{ name }` → creates gateway session / sandbox
- `POST /api/instances/:id/setup` `{ provider, apiKey, baseUrl?, model?, telegramBotToken }`
- `DELETE /api/instances/:id`

## Business note

Tools (`xibecode` on npm) stay free/open source. Revenue is **always-on sandboxes + ops** (this app + your gateway + E2B bill, markup optional).
