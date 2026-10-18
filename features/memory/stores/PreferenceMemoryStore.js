import { BaseMemoryStore } from "./BaseMemoryStore.js";
import { MemoryObject } from "../model/MemoryObject.js";
import { MEMORY_CONFIG } from "../config/MemoryConfig.js";
import { getStoragePath } from "../../../storage/storagePath.js";
import { createJsonFileStore } from "../../../storage/jsonFile.js";

const storeFile = createJsonFileStore(getStoragePath("preferences.json"), {
  fallbackValue: {}, validate: value => value !== null && typeof value === "object" && !Array.isArray(value), mode: 0o600,
});

/**
 * PreferenceMemoryStore.js
 *
 * Persistent preference memory store for UI, coding style, LLM choice,
 * and response formatting preferences.
 */
export class PreferenceMemoryStore extends BaseMemoryStore {
  constructor() {
    super("preference", MEMORY_CONFIG.STORE_PRIORITIES.preference);
    this.prefs = new Map();
    this.initialized = false;
  }

  async initialize() {
    const json = await storeFile.read();
    this.prefs.clear();
    for (const [key, value] of Object.entries(json)) {
      const obj = MemoryObject.create({
        id: `pref_${key}`,
        type: "preference",
        category: "user_preference",
        content: { key, value },
        importance: 0.90,
      });
      this.prefs.set(key, obj);
    }
    this.initialized = true;
  }

  async store(item) {
    await this.initialize();
    const key = item.content?.key || item.key;
    const value = item.content?.value || item.value;

    if (!key) throw new Error("PreferenceMemoryStore requires key.");

    const obj = MemoryObject.create({
      id: `pref_${key}`,
      type: "preference",
      category: item.category || "user_preference",
      content: { key, value },
      importance: 0.90,
      updatedAt: Date.now(),
    });

    await storeFile.update(json => ({ ...json, [key]: value }));
    this.prefs.set(key, obj);
    return obj;
  }

  async retrieve(query, options = {}) {
    await this.initialize();
    return Array.from(this.prefs.values());
  }

  async delete(key) {
    await this.initialize();
    const cleanKey = key.replace(/^pref_/, "");
    let deleted = false;
    await storeFile.update(json => {
      deleted = Object.hasOwn(json, cleanKey);
      const { [cleanKey]: _removed, ...remaining } = json;
      return remaining;
    });
    this.prefs.delete(cleanKey);
    return deleted;
  }

  async search(filterFn) {
    await this.initialize();
    return Array.from(this.prefs.values()).filter(filterFn);
  }

  async clear() {
    this.prefs.clear();
    await storeFile.write({});
  }

  async getAll() {
    await this.initialize();
    return Array.from(this.prefs.values());
  }
}
