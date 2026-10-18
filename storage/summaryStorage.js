import { getStoragePath } from "./storagePath.js";
import { createJsonFileStore } from "./jsonFile.js";

const store = createJsonFileStore(getStoragePath("summary.json"), {
  fallbackValue: { summary: "" },
  validate: value => typeof value === "string" || (value !== null && typeof value === "object" && !Array.isArray(value)),
  mode: 0o600,
});

export const loadSummary = () => store.read();
export const saveSummary = summary => store.write(summary);
