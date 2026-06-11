#!/usr/bin/env bash
# Oracle / Ubuntu ARM VPS — Node, pnpm, xvfb, Playwright Chromium deps.
# Run as root or with sudo: bash deploy/vps/install-deps.sh
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash deploy/vps/install-deps.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y curl git ca-certificates gnupg xvfb ufw

# Node 20 LTS (NodeSource)
node_major() {
  node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'
}
if ! command -v node >/dev/null 2>&1 || [[ "$(node_major || echo 0)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

corepack enable
corepack prepare pnpm@9.15.0 --activate

echo "Node $(node -v) | pnpm $(pnpm -v)"

# Firewall: SSH + HTTP/HTTPS (Oracle also needs VCN security list rules — see docs/VPS-DEPLOY.md)
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo ""
echo "Deps installed. Next (as your deploy user, from repo root):"
echo "  pnpm install"
echo "  pnpm --filter @omnichat/chat-types build && pnpm --filter @omnichat/automod build && pnpm --filter @omnichat/db build && pnpm --filter @omnichat/api build"
echo "  cd apps/api && pnpm exec playwright install --with-deps chromium"
