import fs from "fs/promises";

import {
  getStoragePath
} from "./storagePath.js";

const STATS_FILE =
  getStoragePath("stats.json");

const DEFAULT_STATS = {
  messages: 0,
  tasks_created: 0,
  notes_saved: 0,
  pdf_queries: 0,
  memory_updates: 0,
  model_usage: {
    deepseek: 0,
    gemini: 0,
    groq: 0,
    openrouter: 0,
    ollama: 0
  }
};

export async function loadStats() {

  try {

    const data =
      await fs.readFile(
        STATS_FILE,
        "utf-8"
      );

    const parsed = JSON.parse(data);

    // Merge with defaults to handle
    // any missing keys from old files
    return {
      ...DEFAULT_STATS,
      ...parsed,
      model_usage: {
        ...DEFAULT_STATS.model_usage,
        ...(parsed.model_usage || {})
      }
    };

  } catch {

    return { ...DEFAULT_STATS };
  }
}

export async function saveStats(
  stats
) {

  await fs.writeFile(
    STATS_FILE,
    JSON.stringify(
      stats,
      null,
      2
    )
  );
}

export async function incrementStat(
  key
) {

  const stats = await loadStats();

  if (typeof stats[key] === "number") {
    stats[key] += 1;
    await saveStats(stats);
  }
}

export async function incrementModelUsage(
  model
) {

  const stats = await loadStats();

  const m = model.toLowerCase();

  if (
    stats.model_usage &&
    typeof stats.model_usage[m] === "number"
  ) {

    stats.model_usage[m] += 1;
    await saveStats(stats);
  }
}
