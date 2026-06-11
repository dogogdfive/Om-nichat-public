# Minimal Oracle handoff: generates SSH key, prints Oracle paste steps, SSH-deploys when you have IP + domain.
# Run from repo root: .\scripts\oracle-vps-handoff.ps1
param(
    [string]$VpsIp = "",
    [string]$ApiDomain = "",
    [string]$WebUrl = "https://omnichat-web-sergios-projects-74b6e485.vercel.app"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$KeyDir = Join-Path $env:USERPROFILE ".ssh"
$KeyPath = Join-Path $KeyDir "omnichat-oracle"
$RepoUrl = "https://github.com/dogogdfive/Om-nichat.git"

if (-not (Test-Path $KeyDir)) { New-Item -ItemType Directory -Path $KeyDir | Out-Null }
if (-not (Test-Path "$KeyPath")) {
    Write-Host "Generating SSH key for Oracle VM..."
    ssh-keygen -t ed25519 -f $KeyPath -N '""' -C "omnichat-oracle"
}
$PubKey = Get-Content "$KeyPath.pub" -Raw

Write-Host ""
Write-Host "========== STEP 1 (you, ~10 min) — Oracle VM =========="
Write-Host "1. Open https://cloud.oracle.com and sign in"
Write-Host "2. Create VM: Ubuntu 22.04 Minimal aarch64, VM.Standard.A1.Flex (2 OCPU / 12 GB)"
Write-Host "3. Paste this SSH public key when asked:"
Write-Host ""
Write-Host $PubKey
Write-Host ""
Write-Host "4. Security list: allow TCP 22, 80, 443"
Write-Host "5. DuckDNS: point your subdomain at the VM public IP"
Write-Host ""

if (-not $VpsIp) {
    $VpsIp = Read-Host "Enter VPS public IP (or press Enter to stop here)"
    if (-not $VpsIp) { exit 0 }
}
if (-not $ApiDomain) {
    $ApiDomain = Read-Host "Enter API domain (e.g. omnichat-api.duckdns.org)"
}

$ApiUrl = "https://$ApiDomain".TrimEnd("/")
Write-Host ""
Write-Host "========== STEP 2 — Deploying to $VpsIp =========="

$RemoteScript = @"
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
if [ ! -d /opt/om-nichat/.git ]; then
  sudo mkdir -p /opt/om-nichat
  sudo chown ubuntu:ubuntu /opt/om-nichat 2>/dev/null || sudo chown \$(whoami):\$(whoami) /opt/om-nichat
  git clone $RepoUrl /opt/om-nichat
fi
cd /opt/om-nichat
git pull || true
sudo bash deploy/vps/install-deps.sh
bash deploy/vps/build-api.sh
if [ ! -f .env ]; then cp deploy/vps/env.example .env; fi
grep -q '^API_PUBLIC_URL=' .env && sed -i 's|^API_PUBLIC_URL=.*|API_PUBLIC_URL=$ApiUrl|' .env || echo API_PUBLIC_URL=$ApiUrl >> .env
grep -q '^WEB_APP_URL=' .env && sed -i 's|^WEB_APP_URL=.*|WEB_APP_URL=$WebUrl|' .env || echo WEB_APP_URL=$WebUrl >> .env
grep -q '^X_SERVER_SCRAPE_ENABLED=' .env && sed -i 's|^X_SERVER_SCRAPE_ENABLED=.*|X_SERVER_SCRAPE_ENABLED=1|' .env || echo X_SERVER_SCRAPE_ENABLED=1 >> .env
grep -q '^X_SCRAPE_HEADLESS=' .env && sed -i 's|^X_SCRAPE_HEADLESS=.*|X_SCRAPE_HEADLESS=0|' .env || echo X_SCRAPE_HEADLESS=0 >> .env
grep -q '^USE_LOCAL_DB=' .env && sed -i 's|^USE_LOCAL_DB=.*|USE_LOCAL_DB=1|' .env || echo USE_LOCAL_DB=1 >> .env
grep -q '^SUPER_ADMIN_EMAILS=' .env && sed -i 's|^SUPER_ADMIN_EMAILS=.*|SUPER_ADMIN_EMAILS=you@example.com|' .env || echo SUPER_ADMIN_EMAILS=you@example.com >> .env
echo ''
echo '>>> EDIT .env: add X_AUTH_TOKEN and X_CT0 from Chrome DevTools, then re-run install-services'
echo '>>> nano .env'
sudo bash deploy/vps/setup-caddy.sh $ApiDomain
sudo bash deploy/vps/install-services.sh /opt/om-nichat
curl -s http://127.0.0.1:8787/health | head -c 500 || true
"@

$RemoteScript | ssh -i $KeyPath -o StrictHostKeyChecking=accept-new "ubuntu@$VpsIp" "bash -s"

Write-Host ""
Write-Host "========== STEP 3 — Vercel web =========="
Write-Host "Run: .\scripts\vercel-web-vps.ps1 -ApiUrl `"$ApiUrl`""
Write-Host "Health: curl $ApiUrl/health"
