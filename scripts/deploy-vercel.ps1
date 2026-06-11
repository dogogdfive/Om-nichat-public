# Deploy omnichat.wtf to Vercel (web + API). Run from repo root.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Add-VercelEnv {
    param([string]$Cwd, [string]$Name, [string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return }
    $prev = $env:VERCEL_PROJECT_ID
    Push-Location $Cwd
    try {
        $Value | vercel env add $Name production --force 2>$null
        if ($LASTEXITCODE -ne 0) {
            $Value | vercel env add $Name production 2>$null
        }
        Write-Host "  env $Name"
    } finally {
        Pop-Location
    }
}

function Set-ProjectEnvs {
    param([string]$Cwd, [string[]]$Keys)
    $lines = Get-Content (Join-Path $Root "scripts\vercel-production-env.txt") | Where-Object { $_ -match "=" -and $_ -notmatch "^\s*#" }
    $map = @{}
    foreach ($line in $lines) {
        $i = $line.IndexOf("=")
        $k = $line.Substring(0, $i).Trim()
        $v = $line.Substring($i + 1).Trim()
        $map[$k] = $v
    }
    foreach ($key in $Keys) {
        if ($map.ContainsKey($key)) {
            Add-VercelEnv -Cwd $Cwd -Name $key -Value $map[$key]
        }
    }
}

Write-Host "Linking omnichat-web..."
Push-Location (Join-Path $Root "apps\web")
vercel link --yes --project omnichat-web 2>&1 | Out-Host
Pop-Location

Write-Host "Linking omnichat-api..."
Push-Location (Join-Path $Root "apps\api")
vercel link --yes --project omnichat-api 2>&1 | Out-Host
Pop-Location

Write-Host "Setting web env..."
Set-ProjectEnvs -Cwd (Join-Path $Root "apps\web") -Keys @(
    "NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_X_API_URL"
)

Write-Host "Setting API env..."
Set-ProjectEnvs -Cwd (Join-Path $Root "apps\api") -Keys @(
    "WEB_APP_URL", "API_PUBLIC_URL", "DATABASE_URL", "SESSION_SECRET",
    "TOKEN_ENCRYPTION_KEY", "JWT_SECRET", "SUPER_ADMIN_EMAILS",
    "TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET", "TWITCH_REDIRECT_URI",
    "KICK_CLIENT_ID", "KICK_CLIENT_SECRET", "KICK_REDIRECT_URI",
    "X_CLIENT_ID", "X_CLIENT_SECRET", "X_REDIRECT_URI", "NODEJS_HELPERS"
)

Write-Host "Deploying API..."
Push-Location (Join-Path $Root "apps\api")
vercel deploy --prod --yes 2>&1 | Out-Host
Pop-Location

Write-Host "Deploying web..."
Push-Location (Join-Path $Root "apps\web")
vercel deploy --prod --yes 2>&1 | Out-Host
Pop-Location

Write-Host "Adding domains..."
vercel domains add omnichat.wtf --project omnichat-web 2>&1 | Out-Host
vercel domains add api.omnichat.wtf --project omnichat-api 2>&1 | Out-Host

Write-Host "Done. Check https://omnichat.wtf and https://api.omnichat.wtf/health"
