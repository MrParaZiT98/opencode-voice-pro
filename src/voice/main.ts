import { spawn, type ChildProcess } from "node:child_process";
import { Plugin } from "@opencode/plugin/gui";
import { Schema } from "effect";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { VoiceIpc } from "./ipc";
import { selectMicrophoneDevice } from "./device.js";
import { normalizeTranscript } from "./normalizer.js";
import { isLocalOnlyMode, normalizeTranscriptionMode } from "./mode.js";
import { getEstimatedUsage, recordEstimatedUsage } from "./quota";

function jsonResult(state, message, text = "", source = "") {
  return JSON.stringify({ state, message, text, source });
}

function runProcess(
  executable: string,
  args: string[],
  timeoutMs = 120000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`Process timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

function parseDirectShowDevices(stderr) {
  const devices = [];
  const seen = new Set();
  for (const match of stderr.matchAll(/"([^"]+)"\s+\(audio\)/gi)) {
    const name = match[1].trim();
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      devices.push(name);
    }
  }
  return devices;
}

class VoiceEngine {
  options: Record<string, any>;
  log: { write: (...args: any[]) => void };
  ffmpeg: string;
  recording: ChildProcess | null;
  recordingExit: Promise<{ code: number; signal: string | null }> | null;
  recordingFile: string | null;
  recordingStartedAt: number;
  recordingStderr: string;
  busy: boolean;
  preferredMicrophone: string;
  microphoneStore: { value: string; set: (value: string) => void };
  transcriptionMode: string;
  transcriptionModeStore: { value: string; set: (value: string) => void };

  constructor(
    options: Record<string, any>,
    log: { write: (...args: any[]) => void },
    microphoneStore: { value: string; set: (value: string) => void },
    transcriptionModeStore: { value: string; set: (value: string) => void },
  ) {
    this.options = options ?? {};
    this.log = log;
    this.ffmpeg = this.options.ffmpegPath || process.env.OPENCODE_VOICE_FFMPEG || "ffmpeg";
    this.recording = null;
    this.recordingExit = null;
    this.recordingFile = null;
    this.recordingStartedAt = 0;
    this.recordingStderr = "";
    this.busy = false;
    this.microphoneStore = microphoneStore;
    this.transcriptionModeStore = transcriptionModeStore;
    this.transcriptionMode = normalizeTranscriptionMode(transcriptionModeStore.value);
    this.preferredMicrophone = String(
      this.options.microphone || process.env.OPENCODE_VOICE_MIC || microphoneStore.value || "",
    ).trim();
  }

  async setTranscriptionMode(mode: string) {
    if (mode !== "auto" && mode !== "local") {
      throw new Error("حالت پردازش صوتی نامعتبر است.");
    }
    this.transcriptionMode = mode;
    this.transcriptionModeStore.set(mode);
    this.log?.write("info", "Voice transcription mode changed", { mode });
    return mode;
  }

  async setMicrophone(name: string) {
    const devices = await this.listDevices();
    const requested = String(name || "").trim();
    const selected = devices.find((device) => device.toLowerCase() === requested.toLowerCase());
    if (!selected) throw new Error("میکروفون انتخاب‌شده در دسترس نیست؛ اتصال دستگاه را بررسی کن.");
    this.preferredMicrophone = selected;
    this.microphoneStore.set(selected);
    this.log?.write("info", "Voice microphone selected", { device: selected });
    return selected;
  }

  async listDevices() {
    const result = await runProcess(
      this.ffmpeg,
      ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"],
      15000,
    );
    return parseDirectShowDevices(result.stderr);
  }

  async status() {
    const base = path.join(process.env.LOCALAPPDATA || os.homedir(), "OpenCodeVoice");
    const whisperCli =
      this.options.whisperPath ||
      process.env.OPENCODE_VOICE_WHISPER_CLI ||
      path.join(base, "bin", "whisper-cli.exe");
    const model =
      this.options.whisperModelPath ||
      process.env.OPENCODE_VOICE_WHISPER_MODEL ||
      path.join(base, "models", "ggml-large-v3-turbo-q5_0.bin");
    const vadModel =
      this.options.whisperVadModelPath ||
      process.env.OPENCODE_VOICE_WHISPER_VAD_MODEL ||
      path.join(base, "models", "ggml-silero-v6.2.0.bin");
    const workerUrl = this.options.workerUrl || process.env.OPENCODE_VOICE_WORKER_URL;
    const workerToken = process.env.OPENCODE_VOICE_WORKER_TOKEN;
    const devices = await this.listDevices().catch((error) => ({ error: error.message }));
    const requestedMicrophone = this.preferredMicrophone;
    const selectedMicrophone = requestedMicrophone
      ? selectMicrophoneDevice(devices, requestedMicrophone)
      : null;
    return {
      transcriptionMode: this.transcriptionMode,
      cloudflareConfigured: Boolean(workerUrl && workerToken),
      localReady: existsSync(whisperCli) && existsSync(model),
      vadReady: existsSync(vadModel),
      microphoneDevices: devices,
      preferredMicrophone: requestedMicrophone,
      selectedMicrophone,
      microphoneReady: Boolean(selectedMicrophone),
      estimatedUsage: await getEstimatedUsage(),
    };
  }

  async start() {
    if (this.recording) return jsonResult("recording", "ضبط از قبل فعال است.");
    if (this.busy) return jsonResult("error", "موتور صوتی مشغول پردازش است.");

    let devices;
    try {
      devices = await this.listDevices();
    } catch (error) {
      return jsonResult(
        "error",
        `FFmpeg در دسترس نیست یا امکان دسترسی به میکروفون وجود ندارد: ${error.message}`,
      );
    }

    if (!devices.length) {
      return jsonResult(
        "error",
        "هیچ میکروفون DirectShow پیدا نشد. دسترسی Microphone ویندوز را بررسی کن.",
      );
    }

    const requested = this.preferredMicrophone;
    if (!requested) {
      return jsonResult("error", "برای شروع دیکته، ابتدا میکروفون خود را انتخاب کن.");
    }
    const device = selectMicrophoneDevice(devices, requested);
    if (!device) {
      return jsonResult(
        "error",
        requested
          ? "میکروفون انتخاب‌شده پیدا نشد: " +
              requested +
              ". ورودی DirectShow و دسترسی میکروفون را بررسی کن."
          : "هیچ میکروفون ورودی قابل انتخابی پیدا نشد.",
      );
    }

    const tempRoot = path.join(os.tmpdir(), "opencode-voice");
    await fs.mkdir(tempRoot, { recursive: true });
    const wavFile = path.join(tempRoot, `recording-${randomUUID()}.wav`);
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "dshow",
      "-i",
      `audio=${device}`,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      "-y",
      wavFile,
    ];

    const child = spawn(this.ffmpeg, args, {
      windowsHide: true,
      stdio: ["pipe", "ignore", "pipe"],
    });

    this.recordingStderr = "";
    child.stderr?.on("data", (chunk) => {
      this.recordingStderr += chunk.toString();
      if (this.recordingStderr.length > 12000)
        this.recordingStderr = this.recordingStderr.slice(-12000);
    });

    const closed = new Promise<{ code: number; signal: string | null }>((resolve) => {
      child.once("close", (code, signal) => resolve({ code: code ?? -1, signal: signal ?? null }));
    });

    try {
      await new Promise((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
    } catch (error) {
      try {
        child.kill();
      } catch {}
      return jsonResult("error", `شروع ضبط ناموفق بود: ${error.message}`);
    }

    this.recording = child;
    this.recordingExit = closed;
    this.recordingFile = wavFile;
    this.recordingStartedAt = Date.now();
    this.log?.write("info", "Voice recording started", { device });
    return jsonResult("recording", `در حال ضبط با میکروفون ${device}`);
  }

  async stopRecorder() {
    const child = this.recording;
    if (!child) return;
    this.recording = null;

    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        try {
          child.kill();
        } catch {}
        resolve({ code: -1, signal: "timeout" });
      }, 8000);
    });

    try {
      child.stdin?.write("q\n");
    } catch {
      try {
        child.kill();
      } catch {}
    }

    const result = await Promise.race([
      this.recordingExit ?? Promise.resolve({ code: -1, signal: null }),
      timeout,
    ]);
    clearTimeout(timer);
    this.recordingExit = null;
    return result;
  }

  async transcribeCloudflare(wavFile) {
    const workerUrl = this.options.workerUrl || process.env.OPENCODE_VOICE_WORKER_URL;
    const token = process.env.OPENCODE_VOICE_WORKER_TOKEN;
    if (!workerUrl || !token) {
      throw new Error(
        "Cloudflare Worker هنوز پیکربندی نشده است؛ URL و OPENCODE_VOICE_WORKER_TOKEN لازم است.",
      );
    }

    const audio = await fs.readFile(wavFile);
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "audio/wav",
      },
      body: audio,
      signal: AbortSignal.timeout(90000),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload.message || payload.error || `HTTP ${response.status}`;
      throw new Error(`Cloudflare Workers AI: ${detail}`);
    }
    if (!payload.text || !String(payload.text).trim()) {
      throw new Error("Cloudflare هیچ متنی از صدا تشخیص نداد.");
    }
    return String(payload.text).trim();
  }

  async transcribeLocal(wavFile) {
    const appData = process.env.LOCALAPPDATA || os.homedir();
    const base = path.join(appData, "OpenCodeVoice");
    const whisperCli =
      this.options.whisperPath ||
      process.env.OPENCODE_VOICE_WHISPER_CLI ||
      path.join(base, "bin", "whisper-cli.exe");
    const model =
      this.options.whisperModelPath ||
      process.env.OPENCODE_VOICE_WHISPER_MODEL ||
      path.join(base, "models", "ggml-large-v3-turbo-q5_0.bin");

    if (!existsSync(whisperCli)) throw new Error(`whisper-cli پیدا نشد: ${whisperCli}`);
    if (!existsSync(model)) throw new Error(`مدل Whisper پیدا نشد: ${model}`);

    const vadModel =
      this.options.whisperVadModelPath ||
      process.env.OPENCODE_VOICE_WHISPER_VAD_MODEL ||
      path.join(base, "models", "ggml-silero-v6.2.0.bin");
    const args = ["-m", model, "-f", wavFile, "-l", "fa", "-nt", "-np"];
    if (existsSync(vadModel)) {
      args.push(
        "-vm",
        vadModel,
        "--vad",
        "-vt",
        "0.45",
        "-vspd",
        "250",
        "-vsd",
        "400",
        "-vp",
        "80",
      );
    }

    const result = await runProcess(whisperCli, args, 240000);
    if (result.code !== 0) {
      throw new Error(result.stderr.trim().slice(-1200) || `whisper-cli exited ${result.code}`);
    }
    return result.stdout.trim();
  }

  async stopAndTranscribe() {
    if (!this.recording) return jsonResult("error", "ضبط فعالی وجود ندارد.");
    if (this.busy) return jsonResult("error", "موتور صوتی مشغول پردازش است.");

    this.busy = true;
    const wavFile = this.recordingFile;
    const durationSeconds = Math.max(0, (Date.now() - this.recordingStartedAt) / 1000);
    try {
      await this.stopRecorder();
      this.recordingFile = null;

      const stat = await fs.stat(wavFile).catch(() => null);
      if (!stat || stat.size <= 44) {
        await fs.unlink(wavFile).catch(() => {});
        return jsonResult("error", "فایل ضبط خالی است؛ میکروفون یا سطح صدای ورودی را بررسی کن.");
      }

      let text = "";
      let source = isLocalOnlyMode(this.transcriptionMode) ? "local" : "cloudflare";
      let cloudError = "";
      if (source === "local") {
        text = await this.transcribeLocal(wavFile);
      } else {
        try {
          text = await this.transcribeCloudflare(wavFile);
        } catch (error) {
          cloudError = error.message;
          this.log?.write("warn", "Cloudflare transcription failed; switching to local Whisper", {
            error: cloudError,
          });
          source = "local";
          text = await this.transcribeLocal(wavFile);
        }
      }

      if (!String(text || "").trim()) {
        await fs.unlink(wavFile).catch(() => {});
        return jsonResult("error", "گفتاری قابل تشخیص پیدا نشد.");
      }
      const normalized = normalizeTranscript(text);
      if (!normalized) {
        await fs.unlink(wavFile).catch(() => {});
        return jsonResult("error", "گفتاری قابل تشخیص پیدا نشد.");
      }

      if (source === "cloudflare") {
        await recordEstimatedUsage(durationSeconds).catch(() => {});
      }

      await fs.unlink(wavFile).catch((error) => {
        this.log?.write("warn", "Could not delete temporary recording", { error: error.message });
      });

      this.log?.write("info", "Voice transcription completed", {
        source,
        durationSeconds: Math.round(durationSeconds),
        characters: normalized.length,
      });

      return jsonResult(
        "transcribed",
        source === "local"
          ? isLocalOnlyMode(this.transcriptionMode)
            ? "دیکته به‌صورت آفلاین با Whisper محلی انجام شد."
            : `Cloudflare در دسترس نبود؛ متن با Whisper محلی تولید شد. ${cloudError}`
          : "متن آماده درج در Composer است.",
        normalized,
        source,
      );
    } catch (error) {
      this.log?.write("error", "Voice transcription failed", { error: error.message, wavFile });
      return jsonResult(
        "error",
        `${error.message} فایل صوتی موقت برای بازیابی نگهداری شد: ${wavFile}`,
      );
    } finally {
      this.busy = false;
      this.recordingStartedAt = 0;
    }
  }

  async toggle() {
    if (this.recording) return this.stopAndTranscribe();
    return this.start();
  }

  async cancel() {
    if (this.recording) {
      const child = this.recording;
      this.recording = null;
      try {
        child.kill();
      } catch {}
    }
    if (this.recordingFile) {
      await fs.unlink(this.recordingFile).catch(() => {});
      this.recordingFile = null;
    }
    this.recordingExit = null;
    this.recordingStartedAt = 0;
    this.log?.write("info", "Voice recording cancelled");
    return true;
  }

  async dispose() {
    await this.cancel();
  }
}

export const setupVoiceMain: Plugin.MainSetup = (ctx) => {
  const microphoneStore = ctx.storage.store("microphone", { schema: Schema.String, initial: "" });
  const initialMode = ctx.options?.transcriptionMode === "local" ? "local" : "auto";
  const transcriptionModeStore = ctx.storage.store("transcriptionMode", {
    schema: Schema.String,
    initial: initialMode,
  });
  const engine = new VoiceEngine(ctx.options, ctx.log, microphoneStore, transcriptionModeStore);
  ctx.provide(VoiceIpc, {
    toggle: async () => engine.toggle(),
    cancel: async () => engine.cancel(),
    listDevices: async () =>
      JSON.stringify(await engine.listDevices().catch((error) => ({ error: error.message }))),
    setMicrophone: async (name: string) => engine.setMicrophone(name),
    setTranscriptionMode: async (mode: string) => engine.setTranscriptionMode(mode),
    status: async () => JSON.stringify(await engine.status()),
  });
  return () => void engine.dispose();
};
