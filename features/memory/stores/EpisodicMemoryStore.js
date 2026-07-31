import fs from "fs/promises";
import { BaseMemoryStore } from "./BaseMemoryStore.js";
import { MemoryObject } from "../model/MemoryObject.js";
import { MEMORY_CONFIG } from "../config/MemoryConfig.js";
import { getStoragePath } from "../../../storage/storagePath.js";

const EPISODIC_FILE = getStoragePath("episodic.json");

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
    if (this.initialized) return;
    try {
      const data = await fs.readFile(EPISODIC_FILE, "utf-8");
      const list = JSON.parse(data);
      this.episodes = list.map(item => MemoryObject.create({ ...item, type: "episodic" }));
    } catch {
      // File does not exist yet
    }
    this.initialized = true;
  }

  async _syncToDisk() {
    await fs.writeFile(EPISODIC_FILE, JSON.stringify(this.episodes, null, 2));
  }

  async store(item) {
    await this.initialize();
    const obj = MemoryObject.create({
      ...item,
      type: "episodic",
      category: item.category || "task_experience",
      importance: item.importance || 0.75,
    });

    this.episodes.push(obj);
    await this._syncToDisk();
    return obj;
  }

  async retrieve(query, options = {}) {
    await this.initialize();
    return this.episodes;
  }

  async delete(id) {
    await this.initialize();
    const idx = this.episodes.findIndex(e => e.id === id);
    if (idx !== -1) {
      this.episodes.splice(idx, 1);
      await this._syncToDisk();
      return true;
    }
    return false;
  }

  async search(filterFn) {
    await this.initialize();
    return this.episodes.filter(filterFn);
  }

  async clear() {
    this.episodes = [];
    await this._syncToDisk();
  }

  async getAll() {
    await this.initialize();
    return this.episodes;
  }
}
