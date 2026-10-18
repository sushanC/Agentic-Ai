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
    const list = await storeFile.read();
    this.reflections = list.map(item => MemoryObject.create({ ...item, type: "reflection" }));
    this.initialized = true;
  }

  async store(item) {
    await this.initialize();
    const obj = MemoryObject.create({
      ...item,
      type: "reflection",
      category: item.category || "self_improvement",
      importance: item.importance || 0.80,
    });

    await storeFile.update(current => [...current, obj]);
    this.reflections.push(obj);
    return obj;
  }

  async retrieve(query, options = {}) {
    await this.initialize();
    return this.reflections;
  }

  async delete(id) {
    await this.initialize();
    let deleted = false;
    await storeFile.update(current => {
      const next = current.filter(item => item.id !== id);
      deleted = next.length !== current.length;
      return next;
    });
    this.reflections = this.reflections.filter(item => item.id !== id);
    return deleted;
  }

  async search(filterFn) {
    await this.initialize();
    return this.reflections.filter(filterFn);
  }

  async clear() {
    this.reflections = [];
    await storeFile.write([]);
  }

  async getAll() {
    await this.initialize();
    return this.reflections;
  }
}
