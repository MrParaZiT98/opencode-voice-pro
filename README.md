# OpenCode Voice Pro

[English](README.md) | [فارسی](README.fa.md)

Windows-first Persian voice dictation for OpenCode Desktop.

A Windows-focused fork and extension of [renjfk/opencode-voice](https://github.com/renjfk/opencode-voice). The upstream MIT license and attribution are retained.

## Features

- Ctrl+D starts/stops dictation; Esc cancels recording
- First-use microphone picker; selection is saved for future sessions
- Windows microphone capture through FFmpeg DirectShow (16 kHz, mono, PCM WAV)
- Choose between Cloudflare Workers AI (@cf/openai/whisper-large-v3-turbo) and a fully offline local-only mode
- Local-only mode uses whisper.cpp CUDA with Silero VAD and never contacts Cloudflare or uploads audio
- Automatic mode prefers Cloudflare and falls back to local Whisper if the Worker, network, or AI allowance is unavailable
- Persian language hint (fa) and software-development vocabulary prompt
- Rules-based Persian transcript normalization
- Transcript is inserted into the OpenCode Desktop Composer for review; it is never submitted automatically
- Successful temporary recordings are deleted; failed recordings are retained for recovery

## Requirements

- Windows 11 x64
- OpenCode Desktop with GUI plugin support
- Node.js 22 or newer
- FFmpeg with DirectShow support (installed by the setup script when WinGet is available)
- NVIDIA GPU with a compatible CUDA runtime for the bundled local fallback
- Optional: a Cloudflare account to deploy your own Worker (not required for local-only mode)

## Installation

### 1. Clone the repository and build the GUI bundle

```powershell
git clone https://github.com/MrParaZiT98/opencode-voice-pro.git
cd opencode-voice-pro
npm ci
npm run build:gui
```

### 2. Install the local speech runtime

Run PowerShell from the repository root:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install-windows.ps1
```

The script installs FFmpeg (using WinGet if needed), the whisper.cpp Windows CUDA runtime, the multilingual Large-v3-Turbo Q5 model, and the Silero VAD model. Downloads are large; allow time and disk space.

### 3. Optional: enable Cloudflare Workers AI

Skip this entire step if you want to use OpenCode Voice offline only. Local-only mode does not need a Cloudflare account, Worker URL, or token.

For automatic online transcription with local fallback, each user deploys a Worker in their own Cloudflare account. From the repository root:

```powershell
npx --yes wrangler@4.168.0 login
npm run worker:deploy
.\scripts\configure-cloudflare.ps1
```

Copy the Worker URL printed by Wrangler when prompted by the configuration script. The script creates a random bearer secret, uploads it to your Worker, and stores the URL and secret in your Windows user environment. It does not write credentials to this repository.

Restart OpenCode Desktop after the script completes.

### 4. Register the local plugin in OpenCode Desktop

Open:

```text
%USERPROFILE%\.config\opencode\opencode.json
```

Add the local project path to the existing plugins array (do not replace your other plugins). For a fully offline installation, set `transcriptionMode` to `local`; for Cloudflare with local fallback, use `auto` or omit the option:

```json
{
  "plugins": [
    {
      "package": "C:\\path\\to\\opencode-voice-pro",
      "options": {
        "transcriptionMode": "local"
      }
    }
  ]
}
```

Replace the example path with the actual folder where you cloned the repository. If your config already has a plugins array, add this object to that array.

Restart OpenCode Desktop. On first use, press Ctrl+D and choose a microphone.

## Usage

- Ctrl+D: start/stop dictation
- Esc: cancel an active recording
- Command palette → Choose microphone: change the selected input
- Command palette → Choose transcription mode: select Automatic (Cloudflare + local fallback) or Local only (offline)
- Command palette → Voice engine status: check the selected mode, Worker, Whisper, VAD, microphone, and estimated usage

Recognized text is inserted into the Composer. Review it and submit it yourself.

## Cloudflare free-tier note

Cloudflare is optional. In Local only mode, audio is processed on your PC by whisper.cpp and is not sent to Cloudflare; no Cloudflare account or Worker configuration is needed. In Automatic mode, the project uses your own Worker first and falls back to local Whisper if the Worker or AI allowance is unavailable. Keep your Cloudflare account on the Free plan and do not enable paid overages if you want to avoid unexpected charges. The local usage counter is an estimate; Cloudflare's dashboard is authoritative.

## Development

```powershell
npm ci
npm test
npm run check
npm run build:gui
```

## Upstream and license

- Upstream project: https://github.com/renjfk/opencode-voice
- License: MIT (see LICENSE and UPSTREAM.md)
