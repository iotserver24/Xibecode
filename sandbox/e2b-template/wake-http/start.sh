#!/usr/bin/env bash
# Start the template wake HTTP server (idempotent).
set -euo pipefail
PORT="${VECTRA_WAKE_PORT:-${TELEGRAM_WEBHOOK_PORT:-8788}}"
PIDFILE=/tmp/vectra-wake-http.pid
LOG=/tmp/vectra-wake-http.log
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER="${SCRIPT_DIR}/server.py"
# Prefer image path when installed into the template
if [ -f /opt/vectra/wake-http/server.py ]; then
  SERVER=/opt/vectra/wake-http/server.py
fi

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  # Already running
  exit 0
fi

# Load hosting env if present
set -a
[ -f /home/user/.xibecode/daemon.env ] && . /home/user/.xibecode/daemon.env
[ -f /home/user/.xibecode/gateway.env ] && . /home/user/.xibecode/gateway.env
set +a

export VECTRA_WAKE_PORT="$PORT"
nohup python3 "$SERVER" >>"$LOG" 2>&1 &
echo $! >"$PIDFILE"
# Brief readiness
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sS -m 1 "http://127.0.0.1:${PORT}/health" 2>/dev/null | grep -q ok; then
    echo "vectra-wake-http: ready :${PORT}"
    exit 0
  fi
  sleep 0.3
done
echo "vectra-wake-http: started pid=$(cat "$PIDFILE") (health not ready yet)"
exit 0
