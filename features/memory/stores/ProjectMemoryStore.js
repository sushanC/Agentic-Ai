import { BaseMemoryStore } from "./BaseMemoryStore.js";
import { MemoryObject } from "../model/MemoryObject.js";
import { MEMORY_CONFIG } from "../config/MemoryConfig.js";
import { getStoragePath } from "../../../storage/storagePath.js";
import { createJsonFileStore } from "../../../storage/jsonFile.js";

const storeFile = createJsonFileStore(getStoragePath("projects.json"), {
  fallbackValue: {}, validate: value => value !== null && typeof value === "object" && !Array.isArray(value), mode: 0o600,
});

/**
 * ProjectMemoryStore.js
 *
 * Long-running project knowledge memory store.
 * Tracks project architecture, modules, completed work, current phase,
 * known issues, and roadmap across sessions.
 */
export class ProjectMemoryStore extends BaseMemoryStore {
  constructor() {
    super("project", MEMORY_CONFIG.STORE_PRIORITIES.project);
    this.projects = new Map(); // projectName -> MemoryObject
    this.initialized = false;
  }

  async initialize() {
    const json = await storeFile.read();
    this.projects.clear();
    for (const [name, projData] of Object.entries(json)) {
      const obj = MemoryObject.create({
        id: `proj_${name}`,
        type: "project",
        category: "project_knowledge",
        content: { name, ...projData },
        importance: 0.85,
      });
      this.projects.set(name, obj);
    }
    this.initialized = true;
  }

  async store(item) {
    await this.initialize();
    const name = item.content?.name || item.name || "default_project";

    const obj = MemoryObject.create({
      id: `proj_${name}`,
      type: "project",
      category: item.category || "project_knowledge",
      content: item.content || item,
      importance: 0.85,
      updatedAt: Date.now(),
    });

    const { name: _ignored, ...storedData } = obj.content;
    await storeFile.update(json => ({ ...json, [name]: storedData }));
    this.projects.set(name, obj);
    return obj;
  }

  async retrieve(query, options = {}) {
    await this.initialize();
    return Array.from(this.projects.values());
  }

  async delete(name) {
    await this.initialize();
    const cleanName = name.replace(/^proj_/, "");
    let deleted = false;
    await storeFile.update(json => {
      deleted = Object.hasOwn(json, cleanName);
      const { [cleanName]: _removed, ...remaining } = json;
      return remaining;
    });
    this.projects.delete(cleanName);
    return deleted;
  }

  async search(filterFn) {
    await this.initialize();
    return Array.from(this.projects.values()).filter(filterFn);
  }

  async clear() {
    this.projects.clear();
    await storeFile.write({});
  }

  async getAll() {
    await this.initialize();
    return Array.from(this.projects.values());
  }
}
