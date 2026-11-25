import { createSignal } from "solid-js";
import { Command, ComposerPill, Plugin, TitlebarItem } from "@opencode/plugin/gui";
import { VoiceIpc } from "./voice/ipc";
import { setupVoiceMain } from "./voice/main";

function parseResult(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return {
      state: "error",
      message: "پاسخ موتور صوتی قابل خواندن نیست.",
      text: "",
    };
  }
}

export default Plugin.define({
  i18n: {
    en: {
      "command.toggle": "Toggle voice dictation",
      "command.cancel": "Cancel voice recording",
      "command.description": "Start or stop Persian voice dictation",
      "command.devices": "List microphone inputs",
      "command.devices.description": "Show available Windows audio input devices",
      "command.microphone": "Choose microphone",
      "command.microphone.description": "Choose or change the voice input device",
      "command.mode": "Choose transcription mode",
      "command.mode.description": "Use Cloudflare with local fallback, or run fully offline",
      "mode.auto": "Automatic (Cloudflare + local fallback)",
      "mode.auto.description":
        "Use Cloudflare Workers AI when configured; otherwise fall back to local Whisper",
      "mode.local": "Local only (offline)",
      "mode.local.description":
        "Transcribe on this PC with Whisper.cpp; no Cloudflare setup or upload",
      "command.status": "Voice engine status",
      "command.status.description": "Show Cloudflare, local fallback, microphone, and usage status",
      "titlebar.ready": "Dictate",
      "titlebar.recording": "Recording",
    },
    fa: {
      "command.toggle": "شروع / توقف دیکته صوتی",
      "command.cancel": "لغو ضبط صدا",
      "command.description": "شروع یا توقف دیکته فارسی",
      "command.devices": "نمایش میکروفون‌های ورودی",
      "command.devices.description": "نمایش دستگاه‌های ورودی صوتی ویندوز",
      "command.microphone": "انتخاب میکروفون",
      "command.microphone.description": "انتخاب یا تغییر میکروفون دیکته صوتی",
      "command.mode": "انتخاب حالت پردازش صدا",
      "command.mode.description": "استفاده از Cloudflare با پشتیبان محلی یا اجرای کاملاً آفلاین",
      "mode.auto": "خودکار (Cloudflare با پشتیبان محلی)",
      "mode.auto.description":
        "در صورت پیکربندی از Cloudflare استفاده می‌کند و در غیر این صورت به Whisper محلی برمی‌گردد",
      "mode.local": "فقط محلی (آفلاین)",
      "mode.local.description":
        "پردازش صدا روی همین کامپیوتر با Whisper؛ بدون نیاز به Cloudflare و ارسال صدا",
      "command.status": "وضعیت موتور صوتی",
      "command.status.description": "نمایش وضعیت کلادفلر، موتور محلی، میکروفون و سهمیه تخمینی",
      "titlebar.ready": "دیکته صوتی",
      "titlebar.recording": "در حال ضبط",
    },
  },

  setup(ctx) {
    const voice = ctx.main(VoiceIpc);
    const [recording, setRecording] = createSignal(false);
    const [busy, setBusy] = createSignal(false);

    const notify = (message: string, variant: "default" | "success" | "error" = "default") => {
      ctx.toast.show({ title: "OpenCode Voice", description: message, variant });
    };

    const chooseMicrophone = async () => {
      try {
        const status = JSON.parse(await voice.status());
        if (!Array.isArray(status.microphoneDevices)) {
          notify(status.microphoneDevices?.error || "فهرست میکروفون‌ها در دسترس نیست.", "error");
          return false;
        }
        if (!status.microphoneDevices.length) {
          notify("هیچ میکروفونی پیدا نشد. اتصال میکروفون و دسترسی ویندوز را بررسی کن.", "error");
          return false;
        }
        const selected = await ctx.dialogs.select({
          title: ctx.t("command.microphone"),
          placeholder: "جست‌وجوی میکروفون...",
          current: status.selectedMicrophone || undefined,
          options: status.microphoneDevices.map((name: string) => ({
            title: name,
            value: name,
            description: name === status.selectedMicrophone ? "میکروفون فعلی" : undefined,
          })),
        });
        if (!selected) return false;
        await voice.setMicrophone(selected);
        return true;
      } catch (error) {
        notify(String(error), "error");
        return false;
      }
    };

    const ensureMicrophoneSelected = async () => {
      const status = JSON.parse(await voice.status());
      if (status.selectedMicrophone) return true;
      return chooseMicrophone();
    };

    const chooseTranscriptionMode = async () => {
      try {
        const status = JSON.parse(await voice.status());
        const selected = await ctx.dialogs.select({
          title: ctx.t("command.mode"),
          placeholder: "انتخاب حالت پردازش...",
          current: status.transcriptionMode || "auto",
          options: [
            {
              title: ctx.t("mode.auto"),
              value: "auto",
              description: ctx.t("mode.auto.description"),
            },
            {
              title: ctx.t("mode.local"),
              value: "local",
              description: ctx.t("mode.local.description"),
            },
          ],
        });
        if (!selected) return;
        await voice.setTranscriptionMode(selected);
        if (selected === "local" && !status.localReady) {
          notify(
            "حالت آفلاین انتخاب شد؛ برای استفاده ابتدا اسکریپت scripts\\install-windows.ps1 را اجرا کن.",
            "default",
          );
          return;
        }
        notify(
          selected === "local"
            ? "حالت فقط محلی فعال شد؛ هیچ صدایی به Cloudflare ارسال نمی‌شود."
            : "حالت خودکار فعال شد؛ Cloudflare در اولویت و Whisper پشتیبان است.",
          "success",
        );
      } catch (error) {
        notify(String(error), "error");
      }
    };

    const toggle = async () => {
      if (busy()) return;
      setBusy(true);
      try {
        if (!recording() && !(await ensureMicrophoneSelected())) return;
        const result = parseResult(await voice.toggle());
        if (result.state === "recording") {
          setRecording(true);
          notify(result.message || "ضبط شروع شد.");
          return;
        }

        setRecording(false);
        if (result.state === "transcribed" && result.text) {
          const composer = ctx.screen.current()?.composer;
          if (!composer) {
            notify("متن تشخیص داده شد اما Composer فعالی وجود ندارد.", "default");
            return;
          }
          composer.insert(result.text);
          composer.focus();
          return;
        }

        notify(result.message || "تبدیل گفتار ناموفق بود.", "error");
      } catch (error) {
        setRecording(false);
        notify(String(error), "error");
      } finally {
        setBusy(false);
      }
    };

    const cancel = async () => {
      if (!recording() || busy()) return;
      setBusy(true);
      try {
        await voice.cancel();
        setRecording(false);
      } catch (error) {
        notify(String(error), "error");
      } finally {
        setBusy(false);
      }
    };

    ctx.add(
      Command,
      () =>
        ({
          id: "toggle-dictation",
          title: ctx.t("command.toggle"),
          description: ctx.t("command.description"),
          group: "OpenCode Voice",
          section: "prompt",
          bind: "ctrl+d",
          editable: true,
          featured: true,
          run: () => {
            void toggle();
          },
        }) as const,
    );

    ctx.add(
      Command,
      () =>
        ({
          id: "list-microphones",
          title: ctx.t("command.devices"),
          description: ctx.t("command.devices.description"),
          group: "OpenCode Voice",
          section: "general",
          run: async () => {
            try {
              const raw = await voice.listDevices();
              const devices = JSON.parse(raw);
              if (!Array.isArray(devices)) {
                notify(devices.error || "فهرست میکروفون‌ها در دسترس نیست.", "error");
                return;
              }
              notify(
                devices.length
                  ? devices.map((name: string, index: number) => `${index + 1}. ${name}`).join("\n")
                  : "هیچ میکروفونی پیدا نشد.",
              );
            } catch (error) {
              notify(String(error), "error");
            }
          },
        }) as const,
    );

    ctx.add(
      Command,
      () =>
        ({
          id: "choose-microphone",
          title: ctx.t("command.microphone"),
          description: ctx.t("command.microphone.description"),
          group: "OpenCode Voice",
          section: "general",
          run: () => {
            void chooseMicrophone();
          },
        }) as const,
    );

    ctx.add(
      Command,
      () =>
        ({
          id: "choose-transcription-mode",
          title: ctx.t("command.mode"),
          description: ctx.t("command.mode.description"),
          group: "OpenCode Voice",
          section: "general",
          run: () => {
            void chooseTranscriptionMode();
          },
        }) as const,
    );

    ctx.add(
      Command,
      () =>
        ({
          id: "show-status",
          title: ctx.t("command.status"),
          description: ctx.t("command.status.description"),
          group: "OpenCode Voice",
          section: "general",
          run: async () => {
            try {
              const status = JSON.parse(await voice.status());
              const usage = status.estimatedUsage || {};
              const usageLine =
                status.transcriptionMode === "local"
                  ? "Cloudflare usage: Not applicable (local-only mode)"
                  : `Estimated Neurons today: ${Number(usage.estimatedNeurons || 0).toFixed(0)} / 10000`;
              const devices = Array.isArray(status.microphoneDevices)
                ? status.microphoneDevices.join(", ")
                : status.microphoneDevices?.error || "None";
              const lines = [
                `Transcription mode: ${status.transcriptionMode === "local" ? "Local only (offline)" : "Automatic (Cloudflare + local fallback)"}`,
                `Cloudflare Workers AI: ${status.cloudflareConfigured ? "Ready" : "Not configured (optional)"}`,
                `Local Whisper CUDA: ${status.localReady ? "Ready" : "Missing"}`,
                `Silero VAD: ${status.vadReady ? "Ready" : "Missing"}`,
                "Selected microphone: " +
                  (status.selectedMicrophone || "Configured microphone not found"),
                "Microphone selection: " + (status.microphoneReady ? "Ready" : "Not found"),
                `Microphones: ${devices}`,
                usageLine,
              ];
              notify(lines.join("\n"));
            } catch (error) {
              notify(String(error), "error");
            }
          },
        }) as const,
    );

    ctx.add(
      Command,
      () =>
        ({
          id: "cancel-dictation",
          title: ctx.t("command.cancel"),
          group: "OpenCode Voice",
          section: "prompt",
          bind: "escape",
          editable: true,
          hidden: true,
          enabled: recording(),
          run: () => {
            void cancel();
          },
        }) as const,
    );

    ctx.add(
      TitlebarItem,
      () =>
        ({
          id: "voice-dictation",
          label: recording() ? ctx.t("titlebar.recording") : ctx.t("titlebar.ready"),
          title: "Ctrl+D",
          icon: recording() ? "waveform" : "outline-audio",
          busy: busy(),
          pressed: recording(),
          run: () => {
            void toggle();
          },
        }) as const,
    );

    ctx.add(ComposerPill, {
      id: "voice-dictation",
      show: () => ({
        label: recording() ? ctx.t("titlebar.recording") : ctx.t("titlebar.ready"),
        title: "OpenCode Voice · Ctrl+D",
        icon: recording() ? ("waveform" as const) : ("outline-audio" as const),
        tone: recording() ? ("warning" as const) : undefined,
        run: () => {
          void toggle();
        },
      }),
    });
  },

  main: setupVoiceMain,
});
