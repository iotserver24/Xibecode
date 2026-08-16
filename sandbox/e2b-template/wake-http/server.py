#!/usr/bin/env python3
"""
Vectra / XibeCode sandbox wake HTTP (E2B custom template).

NOT part of the xibecode bot. Lives in the E2B template so a public URL exists:

  https://8788-{sandboxId}.e2b.app/wake
  https://8788-{sandboxId}.e2b.app/telegram
  https://8788-{sandboxId}.e2b.app/f/{token}/{name}   workspace file share

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
import mimetypes
import os
import re
import secrets
import subprocess
import threading
import time
import urllib.error
import urllib.parse
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
SHARES_PATH = os.environ.get("XIBECODE_SHARES_PATH") or "/home/user/.xibecode/shares.json"
MAX_SHARE_BYTES = 50 * 1024 * 1024

PENDING_PATHS = (
    "/home/user/.xibecode/daemon/pending-telegram-updates.jsonl",
    "/tmp/xibecode-pending-telegram-updates.jsonl",
)

SENSITIVE_PATH_RE = re.compile(
    r"(?:^|/)(?:\.ssh|\.gnupg|\.aws|\.kube|\.docker|\.npmrc|\.env(?:\..*)?|"
    r"id_rsa|id_ed25519|credentials|passwd|shadow)(?:$|/)",
    re.I,
)
_SHARE_LOCK = threading.Lock()


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


def resolve_sandbox_id() -> str:
    for key in ("E2B_SANDBOX_ID", "XIBECODE_SANDBOX_ID", "SANDBOX_ID"):
        v = (os.environ.get(key) or "").strip()
        if v:
            return v
    for p in ("/run/e2b/.E2B_SANDBOX_ID", "/run/e2b/E2B_SANDBOX_ID"):
        try:
            v = open(p, encoding="utf-8").read().strip()
            if v:
                return v
        except OSError:
            continue
    return ""


def preview_domain() -> str:
    raw = (
        os.environ.get("XIBECODE_E2B_PREVIEW_DOMAIN")
        or os.environ.get("E2B_DOMAIN")
        or "e2b.app"
    ).strip()
    return raw.lstrip(".") or "e2b.app"


def public_share_base() -> str:
    sid = resolve_sandbox_id()
    if not sid:
        return ""
    return f"https://{PORT}-{sid}.{preview_domain()}"


def public_share_url(token: str, name: str) -> str:
    quoted = urllib.parse.quote(name or "file", safe="._-")
    base = public_share_base()
    if base:
        return f"{base}/f/{token}/{quoted}"
    return f"/f/{token}/{quoted}"


def validate_share_path(
    raw: str,
    workdir: str | None = None,
) -> tuple[str | None, str | None]:
    """Return (abs_path, None) or (None, reason)."""
    workdir = os.path.realpath(workdir or WORKDIR)
    text = (raw or "").strip()
    if not text:
        return None, "empty path"
    text = os.path.expanduser(text)
    if not os.path.isabs(text):
        text = os.path.join(workdir, text)
    try:
        abs_path = os.path.realpath(text)
    except OSError:
        return None, "invalid path"
    tmp = os.path.realpath("/tmp")
    allowed = (
        abs_path == workdir
        or abs_path.startswith(workdir + os.sep)
        or abs_path == tmp
        or abs_path.startswith(tmp + os.sep)
    )
    if not allowed:
        return None, "path outside workspace"
    if SENSITIVE_PATH_RE.search(abs_path):
        return None, "sensitive path blocked"
    if abs_path.startswith(("/etc", "/proc", "/sys", "/dev")):
        return None, "system path blocked"
    if not os.path.isfile(abs_path):
        return None, "file not found"
    try:
        size = os.path.getsize(abs_path)
    except OSError:
        return None, "file not found"
    if size > MAX_SHARE_BYTES:
        return None, "file too large"
    return abs_path, None


def load_shares(path: str | None = None) -> dict:
    p = path or SHARES_PATH
    try:
        with open(p, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get("tokens"), dict):
            return data
    except (OSError, json.JSONDecodeError):
        pass
    return {"tokens": {}}


def save_shares(data: dict, path: str | None = None) -> None:
    p = path or SHARES_PATH
    d = os.path.dirname(p)
    if d:
        os.makedirs(d, exist_ok=True)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, p)


def create_share(
    raw_path: str,
    name: str | None = None,
    *,
    workdir: str | None = None,
    shares_path: str | None = None,
) -> tuple[dict | None, str | None]:
    abs_path, err = validate_share_path(raw_path, workdir)
    if err or not abs_path:
        return None, err or "invalid path"
    filename = (name or os.path.basename(abs_path) or "file").replace("/", "_")
    filename = filename.strip() or "file"
    rec = {
        "path": abs_path,
        "name": filename,
        "created": int(time.time()),
    }
    store_path = shares_path or SHARES_PATH
    with _SHARE_LOCK:
        data = load_shares(store_path)
        token = secrets.token_urlsafe(18)
        while token in data["tokens"]:
            token = secrets.token_urlsafe(18)
        data["tokens"][token] = rec
        save_shares(data, store_path)
    return {
        "ok": True,
        "token": token,
        "name": filename,
        "path": abs_path,
        "url": public_share_url(token, filename),
    }, None


def lookup_share(token: str, shares_path: str | None = None) -> dict | None:
    if not token:
        return None
    with _SHARE_LOCK:
        rec = load_shares(shares_path or SHARES_PATH)["tokens"].get(token)
    return rec if isinstance(rec, dict) else None


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

    def _client_is_local(self) -> bool:
        host = self.client_address[0] if self.client_address else ""
        return host in ("127.0.0.1", "::1", "localhost")

    def _share_authorized(self) -> bool:
        if self._client_is_local():
            return True
        auth = self.headers.get("Authorization") or ""
        token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
        if not token:
            token = (self.headers.get("X-Xibecode-Share-Secret") or "").strip()
        allowed = {
            SECRET,
            (os.environ.get("XIBECODE_APP_INBOX_SECRET") or "").strip(),
            (os.environ.get("XIBECODE_GATEWAY_TOKEN") or "").strip(),
        }
        allowed.discard("")
        return bool(token) and token in allowed

    def _send_shared_file(self, token: str, _want_name: str | None = None) -> None:
        rec = lookup_share(token)
        if not rec:
            self._send(404, {"ok": False, "error": "not found"})
            return
        abs_path = str(rec.get("path") or "")
        name = str(rec.get("name") or os.path.basename(abs_path) or "file")
        if not abs_path or not os.path.isfile(abs_path):
            self._send(404, {"ok": False, "error": "file gone"})
            return
        try:
            size = os.path.getsize(abs_path)
        except OSError:
            self._send(404, {"ok": False, "error": "file gone"})
            return
        if size > MAX_SHARE_BYTES:
            self._send(413, {"ok": False, "error": "too large"})
            return
        ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
        if ctype in ("text/html", "application/xhtml+xml", "image/svg+xml"):
            ctype = "application/octet-stream"
        disp = name.replace('"', "")
        inline = ctype.startswith("image/")
        try:
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(size))
            self.send_header(
                "Content-Disposition",
                f'{"inline" if inline else "attachment"}; filename="{disp}"',
            )
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "private, max-age=300")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            with open(abs_path, "rb") as f:
                while True:
                    chunk = f.read(64 * 1024)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except BrokenPipeError:
            pass

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
                    "shares": True,
                },
            )
            return
        if path.startswith("/f/"):
            rest = path[len("/f/") :]
            token, _, rest_name = rest.partition("/")
            name = urllib.parse.unquote(rest_name) if rest_name else None
            self._send_shared_file(urllib.parse.unquote(token), name)
            return
        if path.startswith("/d/"):
            token = urllib.parse.unquote(path[len("/d/") :].split("/", 1)[0])
            self._send_shared_file(token, None)
            return
        self._send(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        path = (self.path or "/").split("?", 1)[0]
        length = int(self.headers.get("Content-Length") or "0")
        raw = self.rfile.read(length) if length > 0 else b"{}"

        if path == "/share":
            if not self._share_authorized():
                self._send(401, {"ok": False, "error": "unauthorized"})
                return
            try:
                body = json.loads(raw.decode("utf-8") or "{}")
            except (UnicodeDecodeError, json.JSONDecodeError):
                self._send(400, {"ok": False, "error": "invalid JSON"})
                return
            if not isinstance(body, dict):
                self._send(400, {"ok": False, "error": "invalid JSON"})
                return
            file_path = str(body.get("path") or "")
            name = body.get("name")
            name_s = str(name) if name else None
            rec, err = create_share(file_path, name_s)
            if err or not rec:
                self._send(400, {"ok": False, "error": err or "share failed"})
                return
            log(f"share minted token={rec['token']} name={rec['name']}")
            self._send(200, rec)
            return

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
