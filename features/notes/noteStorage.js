import { getStoragePath } from "../../storage/storagePath.js";
import { createJsonFileStore } from "../../storage/jsonFile.js";

const store = createJsonFileStore(getStoragePath("notes.json"), {
  fallbackValue: [], validate: Array.isArray, mode: 0o600,
});

export const loadNotes = () => store.read();
export const saveNotes = notes => store.write(notes);
export const updateNotes = updater => store.update(updater);
