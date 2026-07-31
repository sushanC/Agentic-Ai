import fs from "fs/promises";
import { BaseMemoryStore } from "./BaseMemoryStore.js";
import { MemoryObject } from "../model/MemoryObject.js";
import { MEMORY_CONFIG } from "../config/MemoryConfig.js";
import { getStoragePath } from "../../../storage/storagePath.js";

const PREFERENCES_FILE = getStoragePath("preferences.json");

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
    if (this.initialized) return;
    try {
      const data = await fs.readFile(PREFERENCES_FILE, "utf-8");
      const json = JSON.parse(data);
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
    } catch {
      // File does not exist yet
    }
    this.initialized = true;
  }

  async _syncToDisk() {
    const json = {};
    for (const [key, obj] of this.prefs.entries()) {
      json[key] = obj.content.value;
    }
    await fs.writeFile(PREFERENCES_FILE, JSON.stringify(json, null, 2));
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

    this.prefs.set(key, obj);
    await this._syncToDisk();
    return obj;
  }

  async retrieve(query, options = {}) {
    await this.initialize();
    return Array.from(this.prefs.values());
  }

  async delete(key) {
    await this.initialize();
    const deleted = this.prefs.delete(key.replace(/^pref_/, ""));
    if (deleted) await this._syncToDisk();
    return deleted;
  }

  async search(filterFn) {
    await this.initialize();
    return Array.from(this.prefs.values()).filter(filterFn);
  }

  async clear() {
    this.prefs.clear();
    await this._syncToDisk();
  }

  async getAll() {
    await this.initialize();
    return Array.from(this.prefs.values());
  }
}
