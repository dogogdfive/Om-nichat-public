#!/usr/bin/env bash
# Install systemd unit for always-on API. Run from repo after build + .env configured.
# Usage: sudo bash deploy/vps/install-services.sh [/opt/om-nichat]
set -euo pipefail

INSTALL_DIR="${1:-/opt/om-nichat}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run with sudo"
  exit 1
fi

if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  echo "Missing $INSTALL_DIR/.env — copy deploy/vps/env.example and fill values"
  exit 1
fi

if [[ ! -f "$INSTALL_DIR/apps/api/dist/index.js" ]]; then
  echo "Missing build — run bash deploy/vps/build-api.sh in $INSTALL_DIR first"
  exit 1
fi

id omnichat &>/dev/null || useradd --system --home "$INSTALL_DIR" --shell /usr/sbin/nologin omnichat
chown -R omnichat:omnichat "$INSTALL_DIR"

sed "s|/opt/om-nichat|$INSTALL_DIR|g" "$REPO_ROOT/deploy/vps/omnichat-api.service" > /etc/systemd/system/omnichat-api.service

systemctl daemon-reload
systemctl enable omnichat-api
systemctl restart omnichat-api

echo "omnichat-api started. Logs: journalctl -u omnichat-api -f"
echo "Health: curl -s http://127.0.0.1:8787/health"
