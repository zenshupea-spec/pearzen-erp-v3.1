#!/bin/sh
# Start Pearzen dev servers when they are not already listening.
# Safe to run repeatedly — exits 0 if all four app ports are already up.

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORTS="3000 3001 3002 3003"
LOG="$ROOT/.cursor/dev-servers.log"

all_up() {
  for port in $PORTS; do
    if ! lsof -ti:"$port" >/dev/null 2>&1; then
      return 1
    fi
  done
  return 0
}

any_up() {
  for port in $PORTS; do
    if lsof -ti:"$port" >/dev/null 2>&1; then
      return 0
    fi
  done
  return 1
}

mkdir -p "$(dirname "$LOG")"

if all_up; then
  exit 0
fi

cd "$ROOT"

if any_up; then
  echo "[ensure-dev] Partial dev stack detected — restarting cleanly" >>"$LOG"
  nohup npm run dev:restart >>"$LOG" 2>&1 &
else
  echo "[ensure-dev] Starting dev stack" >>"$LOG"
  nohup npm run dev >>"$LOG" 2>&1 &
fi

disown 2>/dev/null || true
exit 0
