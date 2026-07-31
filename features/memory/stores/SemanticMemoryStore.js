import fs from "fs/promises";
import { BaseMemoryStore } from "./BaseMemoryStore.js";
import { MemoryObject } from "../model/MemoryObject.js";
import { MEMORY_CONFIG } from "../config/MemoryConfig.js";
import { getStoragePath } from "../../../storage/storagePath.js";

const PROFILE_FILE = getStoragePath("profile.json");

/**
 * SemanticMemoryStore.js
 *
 * Permanent facts memory store.
 * Wraps and syncs with profile.json for 100% backward compatibility.
 * Replaces flat profile model internally with structured MemoryObjects.
 */
export class SemanticMemoryStore extends BaseMemoryStore {
  constructor() {
    super("semantic", MEMORY_CONFIG.STORE_PRIORITIES.semantic);
    this.memoryMap = new Map(); // key -> MemoryObject
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    try {
      const data = await fs.readFile(PROFILE_FILE, "utf-8");
      const json = JSON.parse(data);

      for (const [key, value] of Object.entries(json)) {
        const memoryObj = MemoryObject.create({
          id: `sem_${key}`,
          type: "semantic",
          category: "user_fact",
          content: { key, value },
          importance: 0.85,
        });
        this.memoryMap.set(key, memoryObj);
      }
    } catch {
      // File does not exist or empty — start fresh
    }
    this.initialized = true;
  }

  async _syncToDisk() {
    const json = {};
    for (const [key, memObj] of this.memoryMap.entries()) {
      if (memObj.content && memObj.content.value !== undefined) {
        json[key] = memObj.content.value;
      }
    }
    await fs.writeFile(PROFILE_FILE, JSON.stringify(json, null, 2));
  }

  async store(item) {
    await this.initialize();
    let key, value;

    if (item.content && item.content.key) {
      key = item.content.key;
      value = item.content.value;
    } else if (item.key) {
      key = item.key;
      value = item.value;
    } else {
      throw new Error("SemanticMemoryStore expects a key-value fact.");
    }

    const existing = this.memoryMap.get(key);
    const obj = MemoryObject.create({
      id: existing ? existing.id : `sem_${key}`,
      type: "semantic",
      category: item.category || "user_fact",
      content: { key, value },
      importance: item.importance || 0.85,
      createdAt: existing ? existing.createdAt : Date.now(),
      updatedAt: Date.now(),
      accessCount: existing ? existing.accessCount + 1 : 1,
    });

    this.memoryMap.set(key, obj);
    await this._syncToDisk();
    return obj;
  }

  async retrieve(query, options = {}) {
    await this.initialize();
    return Array.from(this.memoryMap.values());
  }

  async delete(keyOrId) {
    await this.initialize();
    const cleanKey = keyOrId.replace(/^sem_/, "");
    const deleted = this.memoryMap.delete(cleanKey);
    if (deleted) {
      await this._syncToDisk();
    }
    return deleted;
  }

  async search(filterFn) {
    await this.initialize();
    return Array.from(this.memoryMap.values()).filter(filterFn);
  }

  async clear() {
    this.memoryMap.clear();
    await this._syncToDisk();
  }

  async getAll() {
    await this.initialize();
    return Array.from(this.memoryMap.values());
  }

  /**
   * Return legacy flat key-value object format for legacy callers.
   */
  async getLegacyObject() {
    await this.initialize();
    const result = {};
    for (const [key, memObj] of this.memoryMap.entries()) {
      result[key] = memObj.content.value;
    }
    return result;
  }
}
