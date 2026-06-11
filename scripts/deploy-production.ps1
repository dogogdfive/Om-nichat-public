# Deploy from monorepo ROOT so Vercel sees apps/web and apps/api package.json.
# In Vercel dashboard set Root Directory: apps/web (omnichat-web) and apps/api (omnichat-api).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "=== Deploy WEB (run from repo root) ===" -ForegroundColor Cyan
Push-Location (Join-Path $Root "apps\web")
$webProj = Get-Content ".vercel\project.json" | ConvertFrom-Json
Pop-Location

$env:VERCEL_ORG_ID = $webProj.orgId
$env:VERCEL_PROJECT_ID = $webProj.projectId
vercel deploy --prod --yes --cwd $Root 2>&1 | Out-Host

Write-Host ""
Write-Host "Set omnichat-web Root Directory to 'apps/web' in Vercel if build fails." -ForegroundColor Yellow
Write-Host "Dashboard: https://vercel.com/sergios-projects-74b6e485/omnichat-web/settings"
