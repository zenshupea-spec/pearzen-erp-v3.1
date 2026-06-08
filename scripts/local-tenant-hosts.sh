#!/bin/sh
# Map tenant subdomains to localhost for dev (requires sudo once).
# Run: sudo sh scripts/local-tenant-hosts.sh

set -e

MARK="# pearzen-tenant-dev"
HOSTS="/etc/hosts"
BASE="${NEXT_PUBLIC_TENANT_BASE_DOMAIN:-pearzen.tech}"

entries="
127.0.0.1 cvs.${BASE}
127.0.0.1 forge.${BASE}
127.0.0.1 erp.${BASE}
"

if grep -q "$MARK" "$HOSTS" 2>/dev/null; then
  echo "Pearzen tenant hosts already present in $HOSTS"
  exit 0
fi

printf '\n%s\n' "$MARK" >> "$HOSTS"
printf '%s\n' "$entries" >> "$HOSTS"
echo "Added tenant subdomains to $HOSTS"
