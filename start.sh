#!/bin/sh
# Start the CS2 Case Opener dev server (wrangler dev) on port 3000 in the
# background. Safe to run twice: if it is already running, it just says so.
# absolute dir of this script (stays valid after the cd below)
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PORT=3000
PIDFILE="$DIR/.server.pid"
LOGFILE="$DIR/server.log"

# Already answering? (independent of the PID file state)
if curl -s -m 2 "http://localhost:$PORT/api/health" 2>/dev/null | grep -q '"ok":true'; then
  PID=$(cat "$PIDFILE" 2>/dev/null || echo '?')
  echo "Server already running (PID $PID) on http://localhost:$PORT"
  exit 0
fi

if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
  echo "ERROR: port $PORT is in use by another process. Run ./stop.sh first."
  exit 1
fi

cd "$DIR/server" || exit 1
# setsid: run in its own session/process group so stop.sh can kill the whole
# tree (npx -> wrangler -> workerd) with a single kill -- -PID.
setsid nohup npx wrangler dev --port "$PORT" > "$LOGFILE" 2>&1 &
echo $! > "$PIDFILE"

i=0
while [ $i -lt 30 ]; do
  if curl -s -m 2 "http://localhost:$PORT/api/health" 2>/dev/null | grep -q '"ok":true'; then
    echo "Server ready on http://localhost:$PORT (PID $(cat "$PIDFILE"), log: $LOGFILE)"
    exit 0
  fi
  i=$((i + 1))
  sleep 1
done

echo "Server started but not answering /api/health after 30s; check $LOGFILE"
exit 1
