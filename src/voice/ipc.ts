import { Ipc } from "@opencode/plugin/gui";
import { Schema } from "effect";

export const VoiceIpc = Ipc.define({
  id: "opencode-voice-pro.voice",
  methods: {
    toggle: { output: Schema.String },
    cancel: { output: Schema.Boolean },
    listDevices: { output: Schema.String },
    setMicrophone: { input: Schema.String, output: Schema.String },
    status: { output: Schema.String },
  },
});
