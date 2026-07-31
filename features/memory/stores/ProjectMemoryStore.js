import fs from "fs/promises";
import { BaseMemoryStore } from "./BaseMemoryStore.js";
import { MemoryObject } from "../model/MemoryObject.js";
import { MEMORY_CONFIG } from "../config/MemoryConfig.js";
import { getStoragePath } from "../../../storage/storagePath.js";

const PROJECTS_FILE = getStoragePath("projects.json");

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
    if (this.initialized) return;
    try {
      const data = await fs.readFile(PROJECTS_FILE, "utf-8");
      const json = JSON.parse(data);
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
    } catch {
      // File does not exist yet
    }
    this.initialized = true;
  }

  async _syncToDisk() {
    const json = {};
    for (const [name, obj] of this.projects.entries()) {
      const { name: _, ...rest } = obj.content;
      json[name] = rest;
    }
    await fs.writeFile(PROJECTS_FILE, JSON.stringify(json, null, 2));
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

    this.projects.set(name, obj);
    await this._syncToDisk();
    return obj;
  }

  async retrieve(query, options = {}) {
    await this.initialize();
    return Array.from(this.projects.values());
  }

  async delete(name) {
    await this.initialize();
    const deleted = this.projects.delete(name.replace(/^proj_/, ""));
    if (deleted) await this._syncToDisk();
    return deleted;
  }

  async search(filterFn) {
    await this.initialize();
    return Array.from(this.projects.values()).filter(filterFn);
  }

  async clear() {
    this.projects.clear();
    await this._syncToDisk();
  }

  async getAll() {
    await this.initialize();
    return Array.from(this.projects.values());
  }
}
