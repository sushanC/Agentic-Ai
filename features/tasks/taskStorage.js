import { getStoragePath } from "../../storage/storagePath.js";
import { createJsonFileStore } from "../../storage/jsonFile.js";

const store = createJsonFileStore(getStoragePath("tasks.json"), {
  fallbackValue: [], validate: Array.isArray, mode: 0o600,
});

export const loadTasks = () => store.read();
export const saveTasks = tasks => store.write(tasks);
export const updateTasks = updater => store.update(updater);
