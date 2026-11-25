$ErrorActionPreference = "Stop"

$base = Join-Path $env:LOCALAPPDATA "OpenCodeVoice"
$bin = Join-Path $base "bin"
$models = Join-Path $base "models"
$downloads = Join-Path $base "downloads"
New-Item -ItemType Directory -Force -Path $bin, $models, $downloads | Out-Null

Write-Host "OpenCode Voice Pro - Windows runtime setup" -ForegroundColor Cyan

$ffmpeg = $null
$wingetPackages = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
if (Test-Path $wingetPackages) {
  $ffmpeg = Get-ChildItem $wingetPackages -Directory -Filter "Gyan.FFmpeg*" |
    ForEach-Object { Get-ChildItem $_.FullName -Recurse -Filter "ffmpeg.exe" -ErrorAction SilentlyContinue } |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $ffmpeg) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "FFmpeg is missing and WinGet is unavailable. Install FFmpeg (DirectShow-enabled) first."
  }
  winget install --id Gyan.FFmpeg.Shared --exact --silent --accept-package-agreements --accept-source-agreements --scope user
  $ffmpeg = Get-ChildItem $wingetPackages -Directory -Filter "Gyan.FFmpeg*" |
    ForEach-Object { Get-ChildItem $_.FullName -Recurse -Filter "ffmpeg.exe" -ErrorAction SilentlyContinue } |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $ffmpeg) { throw "Could not locate ffmpeg.exe after installation." }
[Environment]::SetEnvironmentVariable("OPENCODE_VOICE_FFMPEG", $ffmpeg, "User")
Write-Host "FFmpeg: $ffmpeg" -ForegroundColor Green

$archive = Join-Path $downloads "whisper-bin-win-cuda-12.4.0-x64.zip"
$extract = Join-Path $downloads "whisper-cuda-extracted"
$url = "https://github.com/ggml-org/whisper.cpp/releases/download/b5907/whisper-bin-win-cuda-12.4.0-x64.zip"

if (-not (Get-ChildItem $bin -Filter "whisper-cli.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1)) {
  if (-not (Test-Path $archive)) {
    Write-Host "Downloading official whisper.cpp CUDA runtime (~702 MB)..." -ForegroundColor Yellow
    curl.exe -L --fail --retry 3 --output $archive $url
    if ($LASTEXITCODE -ne 0) { throw "Failed to download whisper.cpp CUDA runtime." }
  }
  if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
  Expand-Archive -Path $archive -DestinationPath $extract -Force
  Get-ChildItem $extract -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring($extract.Length).TrimStart('\')
    $target = Join-Path $bin $relative
    New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
    Copy-Item $_.FullName $target -Force
  }
}

$whisper = Get-ChildItem $bin -Filter "whisper-cli.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
if (-not $whisper) { throw "whisper-cli.exe was not found in the downloaded archive." }
[Environment]::SetEnvironmentVariable("OPENCODE_VOICE_WHISPER_CLI", $whisper, "User")
Write-Host "Whisper CLI: $whisper" -ForegroundColor Green

$model = Join-Path $models "ggml-large-v3-turbo-q5_0.bin"
$modelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin"
$expectedModelBytes = 574041195
if (-not (Test-Path $model) -or (Get-Item $model).Length -ne $expectedModelBytes) {
  Write-Host "Downloading/resuming multilingual Large-v3-Turbo Q5 model..." -ForegroundColor Yellow
  curl.exe -L --fail --retry 10 --retry-all-errors --retry-delay 2 --continue-at - --output $model $modelUrl
  if ($LASTEXITCODE -ne 0) { throw "Failed to download Whisper model. Re-run this script to resume." }
}
if ((Get-Item $model).Length -ne $expectedModelBytes) {
  throw "Whisper model size check failed. Expected $expectedModelBytes bytes."
}
$modelHash = (Get-FileHash -Path $model -Algorithm SHA256).Hash.ToLowerInvariant()
if ($modelHash -ne "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2") {
  throw "Whisper model SHA256 verification failed."
}
[Environment]::SetEnvironmentVariable("OPENCODE_VOICE_WHISPER_MODEL", $model, "User")
Write-Host "Whisper model: $model" -ForegroundColor Green

$vadModel = Join-Path $models "ggml-silero-v6.2.0.bin"
$vadUrl = "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin"
$expectedVadBytes = 885098
if (-not (Test-Path $vadModel) -or (Get-Item $vadModel).Length -ne $expectedVadBytes) {
  Write-Host "Downloading Silero VAD model..." -ForegroundColor Yellow
  curl.exe -L --fail --retry 5 --retry-all-errors --retry-delay 2 --continue-at - --output $vadModel $vadUrl
  if ($LASTEXITCODE -ne 0) { throw "Failed to download Silero VAD model." }
}
if ((Get-Item $vadModel).Length -ne $expectedVadBytes) { throw "Silero VAD model size check failed." }
$vadHash = (Get-FileHash -Path $vadModel -Algorithm SHA256).Hash.ToLowerInvariant()
if ($vadHash -ne "2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987") {
  throw "Silero VAD model SHA256 verification failed."
}
[Environment]::SetEnvironmentVariable("OPENCODE_VOICE_WHISPER_VAD_MODEL", $vadModel, "User")
Write-Host "Silero VAD model: $vadModel" -ForegroundColor Green

Write-Host ""
Write-Host "Runtime installation complete. Restart OpenCode Desktop to load the new environment variables." -ForegroundColor Green
Write-Host "Choose Local only (offline) in the OpenCode Voice command palette to use Whisper without Cloudflare."
Write-Host "Cloudflare Worker setup is optional and only needed for Automatic mode."
