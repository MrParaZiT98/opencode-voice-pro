$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$workerUrl = [Environment]::GetEnvironmentVariable("OPENCODE_VOICE_WORKER_URL", "User")
if (-not $workerUrl) {
  $workerUrl = Read-Host "Enter the deployed Worker URL ending in /transcribe"
}
if (-not $workerUrl.StartsWith("https://") -or -not $workerUrl.EndsWith("/transcribe")) {
  throw "Worker URL must be HTTPS and end with /transcribe."
}
$config = "cloudflare-worker/wrangler.jsonc"

Write-Host "Checking Cloudflare authentication..." -ForegroundColor Cyan
npx --yes wrangler@4.168.0 whoami | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Cloudflare login is required. Run: npx wrangler login"
}

$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$token = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")

Write-Host "Uploading a newly generated Worker secret..." -ForegroundColor Yellow
$token | npx --yes wrangler@4.168.0 secret put VOICE_AUTH_TOKEN --config $config
if ($LASTEXITCODE -ne 0) {
  throw "Secret upload failed. No token was printed. Re-run this script after checking Wrangler authentication."
}

[Environment]::SetEnvironmentVariable("OPENCODE_VOICE_WORKER_URL", $workerUrl, "User")
[Environment]::SetEnvironmentVariable("OPENCODE_VOICE_WORKER_TOKEN", $token, "User")

Write-Host ""
Write-Host "Cloudflare Worker credentials configured successfully." -ForegroundColor Green
Write-Host "The secret is stored in Cloudflare and a user-level Windows environment variable; it is not written to the repository."
Write-Host "Close and reopen OpenCode Desktop to load the new environment variables."
