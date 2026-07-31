import { WorkingMemoryStore } from "../stores/WorkingMemoryStore.js";
import { ConversationMemoryStore } from "../stores/ConversationMemoryStore.js";
import { SemanticMemoryStore } from "../stores/SemanticMemoryStore.js";
import { PreferenceMemoryStore } from "../stores/PreferenceMemoryStore.js";
import { ProjectMemoryStore } from "../stores/ProjectMemoryStore.js";
import { EpisodicMemoryStore } from "../stores/EpisodicMemoryStore.js";
import { ReflectionMemoryStore } from "../stores/ReflectionMemoryStore.js";

/**
 * MemoryRegistry.js
 *
 * Central registry for discovering, registering, and accessing memory stores.
 * MemoryManager interacts ONLY with MemoryRegistry rather than hardcoding store instances.
 */
export class MemoryRegistry {
  constructor() {
    this.stores = new Map();
    this._registerDefaults();
  }

  _registerDefaults() {
    this.registerStore("working", new WorkingMemoryStore());
    this.registerStore("conversation", new ConversationMemoryStore());
    this.registerStore("semantic", new SemanticMemoryStore());
    this.registerStore("preference", new PreferenceMemoryStore());
    this.registerStore("project", new ProjectMemoryStore());
    this.registerStore("episodic", new EpisodicMemoryStore());
    this.registerStore("reflection", new ReflectionMemoryStore());
  }

  /**
   * Register a memory store instance.
   * @param {string} name - Unique store name
   * @param {import("../stores/BaseMemoryStore.js").BaseMemoryStore} storeInstance
   */
  registerStore(name, storeInstance) {
    if (!name || !storeInstance) {
      throw new Error("MemoryRegistry: Store name and instance are required.");
    }
    this.stores.set(name.toLowerCase(), storeInstance);
  }

  /**
   * Get store by name.
   * @param {string} name
   * @returns {import("../stores/BaseMemoryStore.js").BaseMemoryStore}
   */
  getStore(name) {
    return this.stores.get(name.toLowerCase()) || null;
  }

  /**
   * Get all registered memory stores ordered by priority descending.
   * @returns {Array<import("../stores/BaseMemoryStore.js").BaseMemoryStore>}
   */
  getAllStores() {
    return Array.from(this.stores.values()).sort((a, b) => b.priority - a.priority);
  }

  /**
   * Unregister a store.
   * @param {string} name
   */
  unregisterStore(name) {
    this.stores.delete(name.toLowerCase());
  }
}

export const memoryRegistry = new MemoryRegistry();
