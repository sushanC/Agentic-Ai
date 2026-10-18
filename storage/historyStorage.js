import { getStoragePath } from "./storagePath.js";
import { createJsonFileStore } from "./jsonFile.js";

const store = createJsonFileStore(getStoragePath("chat_history.json"), {
  fallbackValue: [],
  validate: Array.isArray,
  mode: 0o600,
});

export const loadHistory = () => store.read();
export const saveHistory = history => store.write(history);
export const updateHistory = updater => store.update(updater);
