# Usage: .\scripts\configure-database.ps1 "your-database-password"
# Or run without args to open the Supabase dashboard page.
param(
  [string]$Password
)

$ref = $env:SUPABASE_PROJECT_REF
if (-not $ref) {
  Write-Host "Set SUPABASE_PROJECT_REF to your Supabase project ref (from the dashboard URL)."
  Start-Process "https://supabase.com/dashboard"
  exit 1
}
$envFile = (Resolve-Path (Join-Path (Join-Path $PSScriptRoot "..") ".env")).Path

if (-not $Password) {
  Start-Process "https://supabase.com/dashboard/project/$ref/settings/database"
  Write-Host "Open the dashboard link above."
  Write-Host "Click Connect → URI and copy the password from the connection string."
  Write-Host "Then run: .\scripts\configure-database.ps1 YOUR_PASSWORD"
  exit 0
}

# Session pooler (IPv4) — direct db.* host is IPv6-only and fails on some Windows networks
$encoded = [uri]::EscapeDataString($Password)
$uri = "postgresql://postgres.${ref}:${encoded}@aws-1-us-west-1.pooler.supabase.com:5432/postgres"
$content = Get-Content $envFile -Raw
$content = $content -replace "DATABASE_URL=.*", "DATABASE_URL=$uri"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($envFile, ($content.TrimEnd() + "`n"), $utf8NoBom)
Write-Host "Updated DATABASE_URL in .env"
Write-Host "Run: pnpm db:migrate  (optional verify) then pnpm dev:api"
