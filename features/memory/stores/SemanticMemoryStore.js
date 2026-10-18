import { BaseMemoryStore } from "./BaseMemoryStore.js";
import { MemoryObject } from "../model/MemoryObject.js";
import { MEMORY_CONFIG } from "../config/MemoryConfig.js";
import { loadProfile, updateProfile, updateProfileValue, removeProfileKey, saveProfile } from "../../../storage/profileStorage.js";

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
    const json = await loadProfile();
    this.memoryMap.clear();
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
    this.initialized = true;
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

    await updateProfile({ [key]: value });
    this.memoryMap.set(key, obj);
    return obj;
  }

  async retrieve(query, options = {}) {
    await this.initialize();
    return Array.from(this.memoryMap.values());
  }

  async delete(keyOrId) {
    await this.initialize();
    const cleanKey = keyOrId.replace(/^sem_/, "");
    const before = await loadProfile();
    const deleted = Object.hasOwn(before, cleanKey);
    await removeProfileKey(cleanKey);
    this.memoryMap.delete(cleanKey);
    return deleted;
  }

  async search(filterFn) {
    await this.initialize();
    return Array.from(this.memoryMap.values()).filter(filterFn);
  }

  async clear() {
    await saveProfile({});
    this.memoryMap.clear();
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

  async replaceLegacyObject(profile) {
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      throw new TypeError("Semantic profile must be an object.");
    }
    await saveProfile(profile);
    this.memoryMap.clear();
    for (const [key, value] of Object.entries(profile)) {
      this.memoryMap.set(key, MemoryObject.create({
        id: `sem_${key}`,
        type: "semantic",
        category: "user_fact",
        content: { key, value },
        importance: 0.85,
      }));
    }
    this.initialized = true;
  }

  async updateValue(key, updater) {
    if (typeof updater !== "function") throw new TypeError("Semantic value update requires a function.");
    await this.initialize();
    const value = await updateProfileValue(key, updater);
    const existing = this.memoryMap.get(key);
    this.memoryMap.set(key, MemoryObject.create({
      id: existing?.id || `sem_${key}`,
      type: "semantic",
      category: existing?.category || "user_fact",
      content: { key, value },
      importance: existing?.importance || 0.85,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
      accessCount: existing ? existing.accessCount + 1 : 1,
    }));
    return value;
  }
}
