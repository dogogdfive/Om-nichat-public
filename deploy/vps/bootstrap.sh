#!/usr/bin/env bash
# One-shot VPS bootstrap after git clone. Run from repo root on the VM.
# Usage: bash deploy/vps/bootstrap.sh omnichat-api.duckdns.org
set -euo pipefail

DOMAIN="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ -z "$DOMAIN" ]]; then
  echo "Usage: bash deploy/vps/bootstrap.sh api.yourname.duckdns.org"
  exit 1
fi

if [[ ! -f .env ]]; then
  cp deploy/vps/env.example .env
  echo "Created .env from template — edit X cookies and secrets, then re-run."
  exit 1
fi

if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
  bash deploy/vps/install-deps.sh
  sudo -u "${SUDO_USER:-$USER}" bash deploy/vps/build-api.sh
  bash deploy/vps/setup-caddy.sh "$DOMAIN"
  bash deploy/vps/install-services.sh "$ROOT"
else
  echo "First run system deps as root:"
  echo "  sudo bash deploy/vps/bootstrap.sh $DOMAIN"
  exit 1
fi

echo ""
echo "Bootstrap complete. Test: curl -s https://${DOMAIN}/health"
