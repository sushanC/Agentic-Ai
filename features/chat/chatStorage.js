import { getStoragePath } from "../../storage/storagePath.js";
import { createJsonFileStore } from "../../storage/jsonFile.js";

export function createChatStorage(filePath = getStoragePath("chat_history.json")) {
  const store = createJsonFileStore(filePath, {
    fallbackValue: [],
    validate: Array.isArray,
    mode: 0o600,
  });
  return {
    loadHistory: () => store.read(),
    saveHistory: history => store.write(history),
    updateHistory: updater => store.update(updater),
  };
}

const defaultStorage = createChatStorage();
export const loadHistory = (...args) => defaultStorage.loadHistory(...args);
export const saveHistory = (...args) => defaultStorage.saveHistory(...args);
export const updateHistory = (...args) => defaultStorage.updateHistory(...args);
