#!/usr/bin/env python3
"""
Vectra / XibeCode sandbox wake HTTP (E2B custom template).

NOT part of the xibecode bot. Lives in the E2B template so a public URL exists:

  https://8788-{sandboxId}.e2b.app/wake
  https://8788-{sandboxId}.e2b.app/telegram

E2B auto-resumes a *paused* sandbox when traffic hits this URL
(docs: https://e2b.dev/docs/sandbox/auto-resume
       https://e2b.dev/docs/network/public-url).

Fast path (target ~1–2s user-perceived wake):
  Memory resume restores the running Node daemon → queue pending update +
  SIGUSR1 soft-wake (no cold Node restart).

Slow path (cold):
  Spawn xibecode daemon with minimal sleeps if the process is gone.
"""
from __future__ import annotations

import json
import os
import subprocess
import threading
import time
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
PIDFILE = "/tmp/xibecode-daemon.pid"
LOG = "/tmp/vectra-wake-http.log"

PENDING_PATHS = (
    "/home/user/.xibecode/daemon/pending-telegram-updates.jsonl",
    "/tmp/xibecode-pending-telegram-updates.jsonl",
)


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


def tg_api(method: str, payload: dict, timeout: float = 8.0) -> dict:
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
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        return {"ok": False, "description": str(e)}


def delete_webhook_async() -> None:
    """Fire-and-forget: clear host webhook so long-poll can bind (don't block soft-wake)."""

    def _run() -> None:
        load_daemon_env()
        if not TOKEN:
            return
        r = tg_api("deleteWebhook", {"drop_pending_updates": False}, timeout=4.0)
        log(f"deleteWebhook async: {r.get('ok')} {r.get('description', '')}")

    threading.Thread(target=_run, daemon=True).start()


def daemon_pid() -> int | None:
    try:
        with open(PIDFILE, encoding="utf-8") as f:
            raw = f.read().strip()
        if not raw:
            return None
        pid = int(raw)
        os.kill(pid, 0)
        return pid
    except (OSError, ValueError):
        return None


def soft_wake_daemon() -> bool:
    """
    If the daemon process is still alive after E2B memory resume, signal it
    instead of cold-starting Node (biggest latency win).
    """
    pid = daemon_pid()
    if pid is None:
        return False
    delete_webhook_async()
    try:
        # SIGUSR1 → telegram engine drains pending + aborts stale getUpdates
        os.kill(pid, 10)  # SIGUSR1 on Linux
        log(f"soft-wake SIGUSR1 → pid {pid}")
        return True
    except OSError as e:
        log(f"soft-wake failed pid={pid}: {e}")
        return False


def restart_daemon_fast() -> bool:
    """Cold start when soft-wake is not possible — minimize sleeps."""
    script = r"""
set +e
set -a
[ -f /home/user/.xibecode/daemon.env ] && . /home/user/.xibecode/daemon.env
[ -f /home/user/.xibecode/gateway.env ] && . /home/user/.xibecode/gateway.env
set +a
# Clear webhook (short timeout) so long-poll can bind
if [ -n "${TELEGRAM_BOT_TOKEN:-}${XIBECODE_TELEGRAM_BOT_TOKEN:-}" ]; then
  TOK="${TELEGRAM_BOT_TOKEN:-$XIBECODE_TELEGRAM_BOT_TOKEN}"
  curl -sS -m 3 -X POST "https://api.telegram.org/bot${TOK}/deleteWebhook" \
    -d "drop_pending_updates=false" >/dev/null 2>&1 || true
fi
if [ -f /tmp/xibecode-daemon.pid ]; then
  OLD="$(cat /tmp/xibecode-daemon.pid 2>/dev/null)"
  if [ -n "$OLD" ]; then kill "$OLD" 2>/dev/null || true; kill -9 "$OLD" 2>/dev/null || true; fi
  rm -f /tmp/xibecode-daemon.pid
fi
nohup xibecode daemon --workdir /home/user/workspace >/tmp/xibecode-daemon.log 2>&1 &
echo $! > /tmp/xibecode-daemon.pid
OK=0
# ~2s max (20 × 0.1s) — pid existence is enough; agent warms in background
for i in $(seq 1 20); do
  if [ -f /tmp/xibecode-daemon.pid ] && kill -0 "$(cat /tmp/xibecode-daemon.pid)" 2>/dev/null; then
    OK=1
    break
  fi
  sleep 0.1
done
if [ "$OK" = "1" ]; then echo DAEMON_OK; else echo DAEMON_FAIL; fi
"""
    try:
        t0 = time.monotonic()
        r = subprocess.run(
            ["bash", "-lc", script],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=WORKDIR,
        )
        out = (r.stdout or "") + (r.stderr or "")
        log(f"restart_daemon_fast {time.monotonic() - t0:.2f}s: {out[-400:]}")
        return "DAEMON_OK" in out
    except Exception as e:
        log(f"restart_daemon_fast error: {e}")
        return False


def ensure_daemon() -> bool:
    """Prefer soft-wake (resume) over cold restart."""
    if soft_wake_daemon():
        return True
    return restart_daemon_fast()


def queue_pending_update(data: dict) -> str | None:
    """
    Hand the wake DM to the long-poll daemon so the user does not need to resend.
    Daemon drains this file on start / SIGUSR1 (xibecode ≥1.17.2).
    """
    line = json.dumps(data, ensure_ascii=False) + "\n"
    for p in PENDING_PATHS:
        try:
            d = os.path.dirname(p)
            if d:
                os.makedirs(d, exist_ok=True)
            with open(p, "w", encoding="utf-8") as f:
                f.write(line)
            log(f"queued pending telegram update → {p}")
            return p
        except OSError as e:
            log(f"queue pending failed {p}: {e}")
    return None


def handle_telegram_update(raw: bytes) -> None:
    t0 = time.monotonic()
    load_daemon_env()
    chat_id = None
    data: dict = {}
    try:
        data = json.loads(raw.decode("utf-8") or "{}")
        msg = data.get("message") or {}
        chat = msg.get("chat") or {}
        chat_id = chat.get("id")
        text = (msg.get("text") or "").strip()
        log(f"telegram update_id={data.get('update_id')} text_len={len(text)}")
    except Exception as e:
        log(f"parse update: {e}")

    queued = queue_pending_update(data) if data else None
    ok = ensure_daemon()
    elapsed = time.monotonic() - t0
    log(f"wake path done ok={ok} queued={bool(queued)} {elapsed:.2f}s")

    if chat_id is not None and TOKEN and not ok:
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
                    "daemon_alive": daemon_pid() is not None,
                    "note": "E2B template doorbell — soft-wake when possible",
                },
            )
            return
        self._send(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        path = (self.path or "/").split("?", 1)[0]
        length = int(self.headers.get("Content-Length") or "0")
        raw = self.rfile.read(length) if length > 0 else b"{}"

        if path in ("/wake", "/"):
            # Pure doorbell — E2B already resumed on this request
            self._send(
                200,
                {
                    "ok": True,
                    "service": "vectra-wake-http",
                    "woke": True,
                    "daemon_alive": daemon_pid() is not None,
                },
            )
            return

        if path == "/telegram":
            if SECRET:
                hdr = self.headers.get("X-Telegram-Bot-Api-Secret-Token") or ""
                if hdr != SECRET:
                    self._send(401, {"ok": False, "error": "bad secret"})
                    return
            # Ack Telegram immediately; work in background
            self._send(200, {"ok": True, "accepted": True})
            threading.Thread(target=handle_telegram_update, args=(raw,), daemon=True).start()
            return

        self._send(404, {"ok": False, "error": "not found"})


def main() -> None:
    load_daemon_env()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    log(f"vectra-wake-http listening 0.0.0.0:{PORT} (soft-wake + fast restart)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
