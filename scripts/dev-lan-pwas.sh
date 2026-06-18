#!/bin/sh
# Guard + SM portals on Wi‑Fi (HTTPS so phone GPS works on LAN).

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"

if [ -z "$LAN_IP" ]; then
  echo "Could not detect Wi‑Fi IP. Connect to Wi‑Fi and run again."
  exit 1
fi

CERT_OUT="$(sh "$ROOT/scripts/gen-lan-dev-cert.sh")"
CERT_FILE="$(echo "$CERT_OUT" | sed -n '1p')"
KEY_FILE="$(echo "$CERT_OUT" | sed -n '2p')"

for port in 3001 3003; do
  lsof -ti:"$port" 2>/dev/null | xargs kill -9 2>/dev/null
done

LOG="$ROOT/.cursor/dev-lan-pwas.log"
mkdir -p "$(dirname "$LOG")"
: > "$LOG"

HTTPS_ARGS="--experimental-https --experimental-https-key $KEY_FILE --experimental-https-cert $CERT_FILE"
export LAN_DEV_ORIGIN="$LAN_IP"

(
  cd "$ROOT/apps/field-pwa" && LAN_DEV_ORIGIN="$LAN_IP" npx next dev -p 3001 -H 0.0.0.0 $HTTPS_ARGS
) >>"$LOG" 2>&1 &
FIELD_PID=$!

(
  cd "$ROOT/apps/sm-pwa" && LAN_DEV_ORIGIN="$LAN_IP" npx next dev -p 3003 -H 0.0.0.0 $HTTPS_ARGS
) >>"$LOG" 2>&1 &
SM_PID=$!

echo "Starting Guard + SM portals on Wi‑Fi (logs: .cursor/dev-lan-pwas.log)…"

READY=false
for _ in $(seq 1 60); do
  if curl -ksf -o /dev/null "https://${LAN_IP}:3001/" && curl -ksf -o /dev/null "https://${LAN_IP}:3003/"; then
    READY=true
    break
  fi
  sleep 1
done

echo ""
if $READY; then
  echo "Ready on your Wi‑Fi network:"
else
  echo "Servers still starting — try the URLs below in ~30s if they fail:"
fi
echo ""
echo "  Guard portal   https://${LAN_IP}:3001"
echo "  SM portal      https://${LAN_IP}:3003"
echo ""
echo "On your phone (same Wi‑Fi): open those URLs in Safari or Chrome."
echo "Tap through the certificate warning once — required for GPS on LAN."
echo ""
echo "PIDs: field-pwa=$FIELD_PID  sm-pwa=$SM_PID"
echo "Stop: lsof -ti:3001,3003 | xargs kill -9"
echo "Back to localhost only: npm run dev:restart"
echo ""
