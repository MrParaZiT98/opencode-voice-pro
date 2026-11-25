export function normalizeTranscriptionMode(value) {
  return value === "local" ? "local" : "auto";
}

export function isLocalOnlyMode(value) {
  return normalizeTranscriptionMode(value) === "local";
}
