/** Persistent local history of desktop actions (newest first, max 100). */
import { getStoragePath } from "./storagePath.js";
import { createJsonFileStore } from "./jsonFile.js";

const MAX_HISTORY = 100;
const store = createJsonFileStore(getStoragePath("desktop_history.json"), {
  fallbackValue: [], validate: Array.isArray, mode: 0o600,
});

export const loadDesktopHistory = () => store.read();

export async function addDesktopAction(record) {
  try {
    await store.update(history => [record, ...history].slice(0, MAX_HISTORY));
  } catch (err) {
    // History is diagnostic and must not interrupt the requested desktop action.
    console.error("[DesktopHistory] Write failed", { code: err.code || "STORAGE_WRITE_FAILED" });
  }
}

export async function clearDesktopHistory() {
  await store.write([]);
}
