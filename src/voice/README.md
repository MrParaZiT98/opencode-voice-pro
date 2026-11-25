# Voice engine

- Online provider: Cloudflare Workers AI only.
- Model: `@cf/openai/whisper-large-v3-turbo`.
- Language hint: Persian (`fa`), with a programming vocabulary prompt.
- Local fallback: `whisper-cli.exe` with a multilingual Q5 model and Silero VAD.
- Audio capture: FFmpeg DirectShow, 16 kHz mono PCM WAV.
- Shortcut: Ctrl+D toggles recording; Esc cancels while recording.
- Transcripts are inserted into the Desktop Composer and are never submitted automatically.
- Temporary WAV files are deleted after successful transcription. A file is retained only when both online and local transcription fail, to prevent loss of the user's recording.
