import { BaseMemoryStore } from "./BaseMemoryStore.js";
import { MemoryObject } from "../model/MemoryObject.js";
import { MEMORY_CONFIG } from "../config/MemoryConfig.js";
import { getStoragePath } from "../../../storage/storagePath.js";
import { createJsonFileStore } from "../../../storage/jsonFile.js";

const storeFile = createJsonFileStore(getStoragePath("episodic.json"), {
  fallbackValue: [], validate: Array.isArray, mode: 0o600,
});

/**
 * EpisodicMemoryStore.js
 *
 * Episodic memory store for task execution experiences, outcomes, and lessons.
 */
export class EpisodicMemoryStore extends BaseMemoryStore {
  constructor() {
    super("episodic", MEMORY_CONFIG.STORE_PRIORITIES.episodic);
    this.episodes = [];
    this.initialized = false;
  }

  async initialize() {
    const list = await storeFile.read();
    this.episodes = list.map(item => MemoryObject.create({ ...item, type: "episodic" }));
    this.initialized = true;
  }

  async store(item) {
    await this.initialize();
    const obj = MemoryObject.create({
      ...item,
      type: "episodic",
      category: item.category || "task_experience",
      importance: item.importance || 0.75,
    });

    await storeFile.update(current => [...current, obj]);
    this.episodes.push(obj);
    return obj;
  }

  async retrieve(query, options = {}) {
    await this.initialize();
    return this.episodes;
  }

  async delete(id) {
    await this.initialize();
    let deleted = false;
    await storeFile.update(current => {
      const next = current.filter(item => item.id !== id);
      deleted = next.length !== current.length;
      return next;
    });
    this.episodes = this.episodes.filter(item => item.id !== id);
    return deleted;
  }

  async search(filterFn) {
    await this.initialize();
    return this.episodes.filter(filterFn);
  }

  async clear() {
    this.episodes = [];
    await storeFile.write([]);
  }

  async getAll() {
    await this.initialize();
    return this.episodes;
  }
}
