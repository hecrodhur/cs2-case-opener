#!/bin/sh
# Stop the CS2 Case Opener dev server started by start.sh (port 3000).
# Kills the server's whole process group, so no workerd child can linger.
# absolute dir of this script
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PORT=3000
PIDFILE="$DIR/.server.pid"

# Kill the process group that contains PID $1.
kill_group() {
  PGID=$(ps -o pgid= -p "$1" 2>/dev/null | tr -d ' ')
  if [ -n "$PGID" ] && kill -- -"$PGID" 2>/dev/null; then
    echo "Server stopped (process group $PGID)."
    rm -f "$PIDFILE"
    return 0
  fi
  return 1
}

# 1) PID file: start.sh wrote the group leader PID there.
if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE")
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null && kill_group "$PID"; then
    exit 0
  fi
  rm -f "$PIDFILE"
fi

# 2) Fallback: find whatever still listens on the port and kill its group.
LPID=$(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
if [ -n "$LPID" ]; then
  if kill_group "$LPID"; then
    exit 0
  fi
  kill "$LPID" 2>/dev/null
fi

# 3) Last resort: name match (covers a server started outside start.sh).
pkill -f "wrangler dev --port $PORT" 2>/dev/null

sleep 1
if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
  echo "WARNING: port $PORT is still in use."
  exit 1
fi
echo "Server stopped."
exit 0
