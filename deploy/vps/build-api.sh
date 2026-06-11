#!/usr/bin/env bash
# Build OMnichat API and install Playwright Chromium (run from repo root as deploy user).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "==> pnpm install"
pnpm install

echo "==> build workspace packages"
pnpm --filter @omnichat/chat-types build
pnpm --filter @omnichat/automod build
pnpm --filter @omnichat/db build
pnpm --filter @omnichat/api build

echo "==> Playwright Chromium"
cd apps/api
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu22.04-x64 pnpm exec playwright install chromium

echo ""
echo "Build OK. Ensure .env exists at repo root, then:"
echo "  sudo bash deploy/vps/install-services.sh"
