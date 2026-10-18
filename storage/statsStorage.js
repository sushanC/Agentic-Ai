import { getStoragePath } from "./storagePath.js";
import { createJsonFileStore } from "./jsonFile.js";

const DEFAULT_STATS = {
  messages: 0,
  tasks_created: 0,
  notes_saved: 0,
  pdf_queries: 0,
  memory_updates: 0,
  model_usage: { deepseek: 0, gemini: 0, groq: 0, openrouter: 0, ollama: 0 },
};

const store = createJsonFileStore(getStoragePath("stats.json"), {
  fallbackValue: DEFAULT_STATS,
  validate: value => value !== null && typeof value === "object" && !Array.isArray(value)
    && (value.model_usage === undefined || (value.model_usage !== null && typeof value.model_usage === "object" && !Array.isArray(value.model_usage))),
  mode: 0o600,
});

function withDefaults(parsed) {
  return {
    ...DEFAULT_STATS,
    ...parsed,
    model_usage: { ...DEFAULT_STATS.model_usage, ...(parsed.model_usage || {}) },
  };
}

export async function loadStats() {
  return withDefaults(await store.read());
}

export const saveStats = stats => store.write(withDefaults(stats));

export async function incrementStat(key) {
  await store.update(current => {
    const stats = withDefaults(current);
    if (typeof stats[key] === "number") stats[key] += 1;
    return stats;
  });
}

export async function incrementModelUsage(model) {
  if (typeof model !== "string") return;
  const key = model.toLowerCase();
  await store.update(current => {
    const stats = withDefaults(current);
    if (typeof stats.model_usage[key] === "number") stats.model_usage[key] += 1;
    return stats;
  });
}
