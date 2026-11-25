const replacements = [
  [/تایپ[\s\u200c]+اسکریپت/giu, "TypeScript"],
  [/جاوا[\s\u200c]+اسکریپت/giu, "JavaScript"],
  [/نکست[\s\u200c]+جی[\s\u200c]*اس/giu, "Next.js"],
  [/نود[\s\u200c]+جی[\s\u200c]*اس/giu, "Node.js"],
  [/ری[\s\u200c]*اکت/giu, "React"],
  [/جیسون/giu, "JSON"],
  [/ای[\s\u200c]+پی[\s\u200c]+آی/giu, "API"],
  [/گیت[\s\u200c]+هاب/giu, "GitHub"],
  [/پستگرس[\s\u200c]+کیو[\s\u200c]+ال/giu, "PostgreSQL"],
  [/وب[\s\u200c]+سوکت/giu, "WebSocket"],
  [/تیلویند/giu, "Tailwind CSS"],
  [/داکر/giu, "Docker"],
  [/پایتون/giu, "Python"],
  [/ام[\s\u200c]+سی[\s\u200c]+پی/giu, "MCP"],
];

export function normalizeTranscript(input) {
  let text = String(input ?? "").normalize("NFC");
  text = text
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ـ/g, "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\r\n?/g, "\n");

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  return text
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\s+([،؛؟.!:])/g, "$1")
    .replace(/([،؛؟!?])(?=\S)/g, "$1 ")
    .replace(/ {2,}/g, " ")
    .trim();
}
