import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTranscript } from "../src/voice/normalizer.js";

test("normalizes Arabic characters and Persian punctuation spacing", () => {
  assert.equal(normalizeTranscript("كیفیت  خوب  است ،درسته ؟"), "کیفیت خوب است، درسته؟");
});

test("preserves Persian while normalizing common programming terms", () => {
  assert.equal(
    normalizeTranscript("برو توی فایل تایپ اسکریپت و جیسون رو بررسی کن"),
    "برو توی فایل TypeScript و JSON رو بررسی کن",
  );
});

test("preserves newlines and dotted technical names", () => {
  assert.equal(
    normalizeTranscript("در فایل Next.js و Node.js تابع API را بررسی کن"),
    "در فایل Next.js و Node.js تابع API را بررسی کن",
  );
  assert.equal(
    normalizeTranscript("در فایل React\nتابع API را بررسی کن"),
    "در فایل React\nتابع API را بررسی کن",
  );
});
