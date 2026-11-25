# Voice engine

- Online provider: Cloudflare Workers AI only.
- Model: `@cf/openai/whisper-large-v3-turbo`.
- Transcription modes:
  - `auto` (default): try Cloudflare first, then fall back to local Whisper.
  - `local`: run whisper.cpp directly; do not call the Worker or upload audio.
- Local engine: `whisper-cli.exe` with a multilingual Q5 model and Silero VAD.
- Local-only mode requires the Windows runtime installed with `scripts/install-windows.ps1`; no Cloudflare account, Worker URL, or token is needed.
- Users can change modes from the OpenCode command palette using **Choose transcription mode**. The selection is persisted.
- A fresh installation can start in local-only mode by setting `"transcriptionMode": "local"` in the plugin's `options`.
- Audio recordings are temporary; successful recordings are deleted after transcription, and failed recordings are retained for recovery.
