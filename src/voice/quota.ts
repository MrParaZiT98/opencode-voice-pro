import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const NEURONS_PER_AUDIO_MINUTE = 46.63;

function usagePath() {
  const base = process.env.LOCALAPPDATA || os.homedir();
  return path.join(base, "OpenCodeVoice", "usage.json");
}

function utcDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function recordEstimatedUsage(durationSeconds) {
  const file = usagePath();
  await fs.mkdir(path.dirname(file), { recursive: true });

  let usage = { date: utcDate(), requests: 0, audioSeconds: 0, estimatedNeurons: 0 };
  try {
    const saved = JSON.parse(await fs.readFile(file, "utf8"));
    if (saved?.date === utcDate()) usage = { ...usage, ...saved };
  } catch {
    // First run or invalid local usage cache.
  }

  const seconds = Math.max(0, Number(durationSeconds) || 0);
  usage.requests += 1;
  usage.audioSeconds += seconds;
  usage.estimatedNeurons += (seconds / 60) * NEURONS_PER_AUDIO_MINUTE;
  await fs.writeFile(file, JSON.stringify(usage, null, 2), "utf8");
  return usage;
}

export async function getEstimatedUsage() {
  try {
    const saved = JSON.parse(await fs.readFile(usagePath(), "utf8"));
    if (saved?.date === utcDate()) return saved;
  } catch {
    // No usage yet.
  }
  return { date: utcDate(), requests: 0, audioSeconds: 0, estimatedNeurons: 0 };
}
