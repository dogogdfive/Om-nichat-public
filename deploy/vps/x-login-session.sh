#!/usr/bin/env bash
# One-time X login session, viewable in a browser via noVNC.
# Stops the API (frees the persistent profile), opens a headed Chromium on a
# virtual display, exposes it at https://vnc.<ip>.sslip.io, then restores everything.
# Usage: sudo bash deploy/vps/x-login-session.sh <vnc-password>
set -euo pipefail

PASS="${1:?usage: x-login-session.sh <vnc-password>}"
TIMEOUT_MS="${X_LOGIN_TIMEOUT_MS:-900000}"

cleanup() {
  pkill websockify >/dev/null 2>&1 || true
  pkill x11vnc >/dev/null 2>&1 || true
  pkill -f 'Xvfb :98' >/dev/null 2>&1 || true
  systemctl start omnichat-api
}
trap cleanup EXIT

systemctl stop omnichat-api
pkill websockify >/dev/null 2>&1 || true
pkill x11vnc >/dev/null 2>&1 || true
pkill -f 'Xvfb :98' >/dev/null 2>&1 || true
sleep 1

Xvfb :98 -screen 0 1280x900x24 &
sleep 2
x11vnc -display :98 -passwd "$PASS" -forever -shared -bg -o /tmp/x11vnc.log
websockify -D --web=/usr/share/novnc 6080 localhost:5900

echo "noVNC ready — open https://vnc.167-233-69-105.sslip.io/vnc.html"

cd /opt/om-nichat
sudo -u omnichat env \
  DISPLAY=:98 \
  X_LOGIN_TIMEOUT_MS="$TIMEOUT_MS" \
  PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu22.04-x64 \
  PLAYWRIGHT_BROWSERS_PATH=/opt/om-nichat/.cache/ms-playwright \
  node apps/api/scripts/x-login-vps.mjs
