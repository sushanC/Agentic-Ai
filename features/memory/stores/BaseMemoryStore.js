/**
 * BaseMemoryStore.js
 *
 * Abstract base class for memory stores.
 * Defines standard CRUD and search interface implemented by specialized stores.
 */
export class BaseMemoryStore {
  constructor(name, priority = 50) {
    this.name = name;
    this.priority = priority;
  }

  async initialize() {
    // Optional initialization hook for disk loading
  }

  async store(memoryItem) {
    throw new Error(`store() not implemented on ${this.name}`);
  }

  async retrieve(query, options = {}) {
    throw new Error(`retrieve() not implemented on ${this.name}`);
  }

  async delete(id) {
    throw new Error(`delete() not implemented on ${this.name}`);
  }

  async search(filterFn) {
    throw new Error(`search() not implemented on ${this.name}`);
  }

  async clear() {
    throw new Error(`clear() not implemented on ${this.name}`);
  }

  async getAll() {
    return [];
  }
}
