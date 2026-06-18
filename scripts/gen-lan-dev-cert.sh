#!/bin/sh
# Self-signed dev cert for phone testing over Wi‑Fi (no mkcert / sudo).

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$ROOT/.cursor/lan-certs"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
MARKER="$CERT_DIR/.lan-ip"
CONF="$CERT_DIR/openssl.cnf"

mkdir -p "$CERT_DIR"

if [ -z "$LAN_IP" ]; then
  echo "Could not detect Wi‑Fi IP."
  exit 1
fi

regen=false
if [ ! -f "$CERT_DIR/cert.pem" ] || [ ! -f "$CERT_DIR/key.pem" ]; then
  regen=true
elif [ ! -f "$MARKER" ] || [ "$(cat "$MARKER")" != "$LAN_IP" ]; then
  regen=true
fi

if $regen; then
  cat >"$CONF" <<EOF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = pearzen-dev

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
IP.2 = ${LAN_IP}
EOF

  openssl req -x509 -newkey rsa:2048 \
    -keyout "$CERT_DIR/key.pem" \
    -out "$CERT_DIR/cert.pem" \
    -days 365 \
    -nodes \
    -config "$CONF" \
    -extensions v3_req \
    >/dev/null 2>&1

  echo "$LAN_IP" >"$MARKER"
fi

echo "$CERT_DIR/cert.pem"
echo "$CERT_DIR/key.pem"
