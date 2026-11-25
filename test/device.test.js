import test from "node:test";
import assert from "node:assert/strict";
import { selectMicrophoneDevice } from "../src/voice/device.js";
import { isLocalOnlyMode, normalizeTranscriptionMode } from "../src/voice/mode.js";

const devices = ["Microphone (NVIDIA Broadcast)", "Microphone (THRONMAX STREAMING MICROPHONE)"];

test("selects the explicitly configured NVIDIA Broadcast microphone", () => {
  assert.equal(
    selectMicrophoneDevice(devices, "Microphone (NVIDIA Broadcast)"),
    "Microphone (NVIDIA Broadcast)",
  );
});

test("does not silently fall back when an explicitly selected microphone is missing", () => {
  assert.equal(selectMicrophoneDevice(devices, "VANKYO CM7000"), null);
});

test("preserves the VANKYO preference when no microphone is explicitly configured", () => {
  assert.equal(
    selectMicrophoneDevice(["Microphone (NVIDIA Broadcast)", "VANKYO CM7000"], ""),
    "VANKYO CM7000",
  );
});

test("uses the first available microphone only when no preference exists", () => {
  assert.equal(selectMicrophoneDevice(devices, ""), devices[0]);
});

test("returns null when no microphone is available", () => {
  assert.equal(selectMicrophoneDevice([], ""), null);
});

test("normalizes local-only mode without requiring a Cloudflare Worker", () => {
  assert.equal(normalizeTranscriptionMode("local"), "local");
  assert.equal(isLocalOnlyMode("local"), true);
});

test("keeps automatic Cloudflare mode as the default", () => {
  assert.equal(normalizeTranscriptionMode("auto"), "auto");
  assert.equal(normalizeTranscriptionMode(undefined), "auto");
  assert.equal(isLocalOnlyMode("auto"), false);
});
