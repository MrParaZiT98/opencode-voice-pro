# OpenCode Voice — Cloudflare Worker

This Worker is the only online speech provider. It calls Cloudflare Workers AI with @cf/openai/whisper-large-v3-turbo and Persian language hinting.

## Deploy your own Worker

Each user should deploy a separate Worker in their own Cloudflare account.

From the repository root:

```powershell
npx --yes wrangler@4.168.0 login
npm run worker:deploy
```

Wrangler prints the deployed Worker URL. Keep that URL; the configuration script will ask for it.

## Configure the access secret

Still from the repository root, run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\configure-cloudflare.ps1
```

Enter the Worker URL ending in /transcribe when prompted. The script generates a random bearer secret, uploads it to the Worker as VOICE_AUTH_TOKEN, and stores the matching URL and token in Windows user-level environment variables. It does not print the token or write it into the repository.

Restart OpenCode Desktop after configuration.

## Local development

Copy .dev.vars.example to .dev.vars and replace the placeholder with a local-only secret. Never commit .dev.vars, Cloudflare API tokens, or production secrets.

## Free-tier note

Keep your Cloudflare account on the Workers Free plan and do not enable paid overages if you want to avoid unexpected charges. The app falls back to local Whisper when the Worker or Workers AI is unavailable, including quota exhaustion. The local usage estimate is informational; Cloudflare's account-level dashboard is authoritative.
