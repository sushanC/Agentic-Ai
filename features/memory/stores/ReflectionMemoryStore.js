import { BaseMemoryStore } from "./BaseMemoryStore.js";
import { MemoryObject } from "../model/MemoryObject.js";
import { MEMORY_CONFIG } from "../config/MemoryConfig.js";
import { getStoragePath } from "../../../storage/storagePath.js";
import { createJsonFileStore } from "../../../storage/jsonFile.js";

const storeFile = createJsonFileStore(getStoragePath("reflections.json"), {
  fallbackValue: [], validate: Array.isArray, mode: 0o600,
});

/**
 * ReflectionMemoryStore.js
 *
 * Reflection memory store for self-improvement, failure analysis, and operational lessons.
 */
export class ReflectionMemoryStore extends BaseMemoryStore {
  constructor() {
    super("reflection", MEMORY_CONFIG.STORE_PRIORITIES.reflection);
    this.reflections = [];
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    const list = await storeFile.read();
    this.reflections = list.map(item => MemoryObject.create({ ...item, type: "reflection" }));
    this.initialized = true;
  }

  async _syncToDisk() {
    await storeFile.write(this.reflections);
  }

  async store(item) {
    await this.initialize();
    const obj = MemoryObject.create({
      ...item,
      type: "reflection",
      category: item.category || "self_improvement",
      importance: item.importance || 0.80,
    });

    this.reflections.push(obj);
    await this._syncToDisk();
    return obj;
  }

  async retrieve(query, options = {}) {
    await this.initialize();
    return this.reflections;
  }

  async delete(id) {
    await this.initialize();
    const idx = this.reflections.findIndex(r => r.id === id);
    if (idx !== -1) {
      this.reflections.splice(idx, 1);
      await this._syncToDisk();
      return true;
    }
    return false;
  }

  async search(filterFn) {
    await this.initialize();
    return this.reflections.filter(filterFn);
  }

  async clear() {
    this.reflections = [];
    await this._syncToDisk();
  }

  async getAll() {
    await this.initialize();
    return this.reflections;
  }
}
