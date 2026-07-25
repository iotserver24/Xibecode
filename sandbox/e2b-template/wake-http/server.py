#!/usr/bin/env python3
"""
Vectra / XibeCode sandbox wake HTTP (E2B custom template).

NOT part of the xibecode bot. Lives in the E2B template so a public URL exists:

  https://8788-{sandboxId}.e2b.app/wake
  https://8788-{sandboxId}.e2b.app/telegram

E2B auto-resumes a *paused* sandbox when traffic hits this URL
(docs: https://e2b.dev/docs/sandbox/auto-resume
       https://e2b.dev/docs/network/public-url).

Roles:
  GET  /health|/wake  — doorbell (wake + liveness)
  POST /telegram      — optional Telegram webhook target:
                        1) VM already waking from this request
                        2) restart xibecode daemon (long-poll bot, unchanged)
                        3) ack Telegram; user may need to resend once if the
                           update was only consumed by this webhook

Env (optional, from ~/.xibecode/daemon.env when started by hosting):
  VECTRA_WAKE_PORT          default 8788
  TELEGRAM_BOT_TOKEN        for optional setWebhook re-arm / notify
  TELEGRAM_WEBHOOK_SECRET   X-Telegram-Bot-Api-Secret-Token
  VECTRA_TG_WEBHOOK_URL     public URL if this process re-arms setWebhook
"""
from __future__ import annotations

import json
import os
import subprocess
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("VECTRA_WAKE_PORT") or os.environ.get("TELEGRAM_WEBHOOK_PORT") or "8788")
SECRET = (
    os.environ.get("TELEGRAM_WEBHOOK_SECRET")
    or os.environ.get("XIBECODE_TELEGRAM_WEBHOOK_SECRET")
    or ""
).strip()
TOKEN = (
    os.environ.get("TELEGRAM_BOT_TOKEN")
    or os.environ.get("XIBECODE_TELEGRAM_BOT_TOKEN")
    or ""
).strip()
PUBLIC_URL = (
    os.environ.get("VECTRA_TG_WEBHOOK_URL")
    or os.environ.get("TELEGRAM_WEBHOOK_URL")
    or ""
).strip()

WORKDIR = os.environ.get("XIBECODE_DAEMON_WORKDIR") or "/home/user/workspace"
DAEMON_ENV = "/home/user/.xibecode/daemon.env"
LOG = "/tmp/vectra-wake-http.log"


def log(msg: str) -> None:
    line = msg.rstrip() + "\n"
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line)
    except OSError:
        pass
    print(line, end="", flush=True)


def load_daemon_env() -> None:
    if not os.path.isfile(DAEMON_ENV):
        return
    try:
        with open(DAEMON_ENV, encoding="utf-8") as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v
    except OSError:
        pass
    global TOKEN, SECRET, PUBLIC_URL
    TOKEN = (
        os.environ.get("TELEGRAM_BOT_TOKEN")
        or os.environ.get("XIBECODE_TELEGRAM_BOT_TOKEN")
        or TOKEN
    ).strip()
    SECRET = (
        os.environ.get("TELEGRAM_WEBHOOK_SECRET")
        or os.environ.get("XIBECODE_TELEGRAM_WEBHOOK_SECRET")
        or SECRET
    ).strip()
    PUBLIC_URL = (
        os.environ.get("VECTRA_TG_WEBHOOK_URL")
        or os.environ.get("TELEGRAM_WEBHOOK_URL")
        or PUBLIC_URL
    ).strip()


def tg_api(method: str, payload: dict) -> dict:
    if not TOKEN:
        return {"ok": False, "description": "no token"}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{TOKEN}/{method}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return json.loads(res.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        return {"ok": False, "description": str(e)}


def restart_daemon() -> bool:
    """Restart long-poll xibecode daemon (bot code unchanged)."""
    script = r"""
set +e
set -a
[ -f /home/user/.xibecode/daemon.env ] && . /home/user/.xibecode/daemon.env
[ -f /home/user/.xibecode/gateway.env ] && . /home/user/.xibecode/gateway.env
set +a
# Long-poll bot needs no webhook; clear so getUpdates can bind
if [ -n "${TELEGRAM_BOT_TOKEN:-}${XIBECODE_TELEGRAM_BOT_TOKEN:-}" ]; then
  TOK="${TELEGRAM_BOT_TOKEN:-$XIBECODE_TELEGRAM_BOT_TOKEN}"
  curl -sS -m 10 -X POST "https://api.telegram.org/bot${TOK}/deleteWebhook" \
    -d "drop_pending_updates=false" >/dev/null 2>&1 || true
fi
if [ -f /tmp/xibecode-daemon.pid ]; then
  kill "$(cat /tmp/xibecode-daemon.pid)" 2>/dev/null || true
  sleep 1
fi
pkill -f "xibecode daemon" 2>/dev/null || true
sleep 1
nohup xibecode daemon --workdir /home/user/workspace >/tmp/xibecode-daemon.log 2>&1 &
echo $! > /tmp/xibecode-daemon.pid
OK=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  sleep 1
  if pgrep -f "xibecode daemon" >/dev/null 2>&1; then OK=1; break; fi
done
if [ "$OK" = "1" ]; then echo DAEMON_OK; else echo DAEMON_FAIL; fi
"""
    try:
        r = subprocess.run(
            ["bash", "-lc", script],
            capture_output=True,
            text=True,
            timeout=90,
            cwd=WORKDIR,
        )
        out = (r.stdout or "") + (r.stderr or "")
        log(f"restart_daemon: {out[-500:]}")
        return "DAEMON_OK" in out
    except Exception as e:
        log(f"restart_daemon error: {e}")
        return False


def rearm_webhook() -> None:
    """After pause cycle, host may re-arm; we can also re-point Telegram here."""
    if not TOKEN or not PUBLIC_URL:
        return
    body: dict = {
        "url": PUBLIC_URL,
        "allowed_updates": ["message", "callback_query"],
        "drop_pending_updates": False,
    }
    if SECRET:
        body["secret_token"] = SECRET
    r = tg_api("setWebhook", body)
    log(f"rearm setWebhook: {r}")


def handle_telegram_update(raw: bytes) -> None:
    load_daemon_env()
    chat_id = None
    try:
        data = json.loads(raw.decode("utf-8") or "{}")
        msg = data.get("message") or {}
        chat = msg.get("chat") or {}
        chat_id = chat.get("id")
        text = (msg.get("text") or "").strip()
        log(f"telegram update_id={data.get('update_id')} text_len={len(text)}")
    except Exception as e:
        log(f"parse update: {e}")

    # This HTTP hit already woke the VM (E2B auto-resume). Restart the *bot*
    # long-poll (separate process — not this server).
    ok = restart_daemon()

    if chat_id is not None and TOKEN:
        if ok:
            tg_api(
                "sendMessage",
                {
                    "chat_id": chat_id,
                    "text": (
                        "Sandbox is awake — please send your message again "
                        "(the first DM woke the machine; the coding bot uses long-poll)."
                    ),
                },
            )
        else:
            tg_api(
                "sendMessage",
                {
                    "chat_id": chat_id,
                    "text": (
                        "Could not start the coding bot after wake. "
                        "Use Wake / resume on the dashboard."
                    ),
                },
            )

    # Daemon long-poll owns Telegram while running. Host/cron re-arms this
    # webhook URL when the sandbox pauses again (E2B lifecycle).


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        log("%s - " % self.address_string() + (fmt % args))

    def _send(self, code: int, obj: dict) -> None:
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = (self.path or "/").split("?", 1)[0]
        if path in ("/", "/health", "/wake", "/telegram"):
            self._send(
                200,
                {
                    "ok": True,
                    "service": "vectra-wake-http",
                    "port": PORT,
                    "note": "E2B template doorbell — not xibecode bot",
                },
            )
            return
        self._send(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        path = (self.path or "/").split("?", 1)[0]
        length = int(self.headers.get("Content-Length") or "0")
        raw = self.rfile.read(length) if length > 0 else b"{}"

        if path in ("/wake", "/"):
            self._send(200, {"ok": True, "service": "vectra-wake-http", "woke": True})
            return

        if path == "/telegram":
            if SECRET:
                hdr = self.headers.get("X-Telegram-Bot-Api-Secret-Token") or ""
                if hdr != SECRET:
                    self._send(401, {"ok": False, "error": "bad secret"})
                    return
            # Ack Telegram immediately (delivery success); work in background
            self._send(200, {"ok": True, "accepted": True})
            threading.Thread(target=handle_telegram_update, args=(raw,), daemon=True).start()
            return

        self._send(404, {"ok": False, "error": "not found"})


def main() -> None:
    load_daemon_env()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    log(f"vectra-wake-http listening 0.0.0.0:{PORT} (template doorbell)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
