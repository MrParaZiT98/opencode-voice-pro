interface WorkersAI {
  run(
    model: string,
    input: Record<string, unknown>,
  ): Promise<{
    text?: string;
    word_count?: number;
    transcription_info?: Record<string, unknown>;
  }>;
}

interface Env {
  AI: WorkersAI;
  VOICE_AUTH_TOKEN: string;
}

const MODEL = "@cf/openai/whisper-large-v3-turbo";
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const TECHNICAL_PROMPT =
  "Persian software engineering dictation. Preserve exact technical names: TypeScript, JavaScript, React, Next.js, Node.js, OpenCode, API, REST, JSON, PostgreSQL, Docker, GitHub, MCP, WebSocket, Tailwind CSS, CUDA, Whisper, Cloudflare, Workers AI.";

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, model: MODEL, provider: "Cloudflare Workers AI" });
    }

    if (request.method !== "POST" || url.pathname !== "/transcribe") {
      return json({ error: "not_found" }, 404);
    }

    const authorization = request.headers.get("Authorization") || "";
    const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!env.VOICE_AUTH_TOKEN || !constantTimeEqual(supplied, env.VOICE_AUTH_TOKEN)) {
      return json({ error: "unauthorized" }, 401);
    }

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.toLowerCase().startsWith("audio/")) {
      return json({ error: "unsupported_media_type", message: "Send audio as audio/wav." }, 415);
    }

    const declaredLength = Number(request.headers.get("Content-Length") || 0);
    if (declaredLength > MAX_AUDIO_BYTES) {
      return json({ error: "audio_too_large", message: "Maximum recording size is 20 MB." }, 413);
    }

    try {
      const buffer = await request.arrayBuffer();
      if (!buffer.byteLength || buffer.byteLength > MAX_AUDIO_BYTES) {
        return json({ error: "invalid_audio_size" }, 413);
      }

      const audio = Buffer.from(buffer).toString("base64");
      const result = await env.AI.run(MODEL, {
        audio,
        language: "fa",
        task: "transcribe",
        initial_prompt: TECHNICAL_PROMPT,
        vad_filter: true,
        condition_on_previous_text: false,
        no_speech_threshold: 0.6,
      });

      const text = String(result?.text || "").trim();
      if (!text) return json({ error: "no_speech", message: "No speech was detected." }, 422);

      return json({
        text,
        wordCount: result.word_count ?? null,
        transcriptionInfo: result.transcription_info ?? null,
        model: MODEL,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const quota = /quota|neuron|billing|limit|exceed|402|429/i.test(message);
      return json(
        {
          error: quota ? "quota_exceeded" : "workers_ai_error",
          message: quota
            ? "Cloudflare Workers AI daily allowance may be exhausted."
            : "Cloudflare Workers AI request failed.",
        },
        quota ? 429 : 502,
      );
    }
  },
} satisfies ExportedHandler<Env>;
