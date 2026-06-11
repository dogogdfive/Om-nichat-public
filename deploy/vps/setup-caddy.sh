#!/usr/bin/env bash
# Install Caddy and configure TLS reverse proxy for the API (WebSocket upgrade included).
# Usage: sudo bash deploy/vps/setup-caddy.sh api.yourname.duckdns.org
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "Usage: sudo bash deploy/vps/setup-caddy.sh api.yourname.duckdns.org"
  exit 1
fi

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run with sudo"
  exit 1
fi

apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN} {
	reverse_proxy localhost:8787
}
EOF

systemctl enable caddy
systemctl restart caddy

echo "Caddy listening on 443 for https://${DOMAIN}"
echo "Test: curl -s https://${DOMAIN}/health | head"
