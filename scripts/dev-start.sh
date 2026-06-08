#!/bin/sh
# Start turbo dev, or print a friendly message if all portal ports are already up.

PORTS="3000 3001 3002 3003"
BLOCKED=""

for port in $PORTS; do
  if lsof -ti:"$port" >/dev/null 2>&1; then
    BLOCKED="$BLOCKED $port"
  fi
done

if [ -n "$BLOCKED" ]; then
  # All four app ports must be free to start fresh; any in use → likely already running.
  ALL_UP=true
  for port in $PORTS; do
    if ! lsof -ti:"$port" >/dev/null 2>&1; then
      ALL_UP=false
      break
    fi
  done

  if $ALL_UP; then
    echo ""
    echo "Dev servers are already running — no need to start again."
    echo ""
    echo "  Client PWA   http://127.0.0.1:3000"
    echo "  Field PWA    http://127.0.0.1:3001"
    echo "  Back-office  http://127.0.0.1:3002"
    echo "  SM PWA       http://127.0.0.1:3003"
    echo ""
    echo "To restart cleanly: npm run dev:restart"
    echo ""
    exit 0
  fi

  echo ""
  echo "Port(s) already in use:$BLOCKED"
  echo "Some dev servers are running but not all four."
  echo "Run: npm run dev:restart"
  echo ""
  exit 1
fi

exec turbo dev
