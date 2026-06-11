# Deploy web to Vercel with API on your VPS (not Vercel serverless API).
# Usage: .\scripts\vercel-web-vps.ps1 -ApiUrl "https://api.yourname.duckdns.org"
param(
    [Parameter(Mandatory = $true)]
    [string]$ApiUrl
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$WebDir = Join-Path $Root "apps\web"

$ApiUrl = $ApiUrl.TrimEnd("/")

Write-Host "Setting NEXT_PUBLIC_API_URL=$ApiUrl on omnichat-web (production)..."
Push-Location $WebDir
try {
    $ApiUrl | vercel env add NEXT_PUBLIC_API_URL production --force 2>$null
    if ($LASTEXITCODE -ne 0) {
        $ApiUrl | vercel env add NEXT_PUBLIC_API_URL production 2>$null
    }
    Write-Host "Deploying web..."
    vercel deploy --prod --yes
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Done. Web should call API at $ApiUrl"
Write-Host "Verify: curl $ApiUrl/health"
Write-Host "Open your Vercel URL -> /chat -> WebSocket should connect via wss://"
