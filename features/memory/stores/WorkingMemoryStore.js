import { BaseMemoryStore } from "./BaseMemoryStore.js";
import { MemoryObject } from "../model/MemoryObject.js";
import { MEMORY_CONFIG } from "../config/MemoryConfig.js";

/**
 * WorkingMemoryStore.js
 *
 * Temporary context store for active tasks.
 * Fast in-memory storage, auto-cleared, never saved to disk.
 */
export class WorkingMemoryStore extends BaseMemoryStore {
  constructor() {
    super("working", MEMORY_CONFIG.STORE_PRIORITIES.working);
    this.items = new Map();
  }

  async store(memoryItem) {
    const obj = MemoryObject.create({
      ...memoryItem,
      type: "working",
      importance: memoryItem.importance || 0.9,
    });
    this.items.set(obj.id, obj);

    // Evict oldest if exceeding capacity limit
    if (this.items.size > MEMORY_CONFIG.LIMITS.workingMemoryMaxItems) {
      const oldestKey = this.items.keys().next().value;
      this.items.delete(oldestKey);
    }
    return obj;
  }

  async retrieve(query, options = {}) {
    return Array.from(this.items.values());
  }

  async delete(id) {
    return this.items.delete(id);
  }

  async search(filterFn) {
    return Array.from(this.items.values()).filter(filterFn);
  }

  async clear() {
    this.items.clear();
  }

  async getAll() {
    return Array.from(this.items.values());
  }
}
