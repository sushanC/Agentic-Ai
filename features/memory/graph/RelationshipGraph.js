import fs from "fs/promises";
import { getStoragePath } from "../../../storage/storagePath.js";

const GRAPH_FILE = getStoragePath("relationship_graph.json");

/**
 * RelationshipGraph.js
 *
 * Persistent Relationship Graph Subsystem.
 * Replaces in-RAM graph with disk persistence (`relationship_graph.json`).
 * Manages directed edges, relationship traversal, graph expansion,
 * user relationships, project relationships, and semantic links.
 */
export class RelationshipGraph {
  constructor() {
    this.graph = new Map(); // subject -> Set of { target, relation }
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    try {
      const data = await fs.readFile(GRAPH_FILE, "utf-8");
      const json = JSON.parse(data);

      for (const [subject, edges] of Object.entries(json)) {
        const edgeSet = new Set();
        for (const edge of edges) {
          edgeSet.add(typeof edge === "string" ? { target: edge, relation: "related_to" } : edge);
        }
        this.graph.set(subject, edgeSet);
      }
    } catch {
      // File does not exist yet
    }
    this.initialized = true;
  }

  async _syncToDisk() {
    const json = {};
    for (const [subject, edgeSet] of this.graph.entries()) {
      json[subject] = Array.from(edgeSet);
    }
    await fs.writeFile(GRAPH_FILE, JSON.stringify(json, null, 2));
  }

  /**
   * Add a relationship edge to the graph.
   *
   * @param {string} subject
   * @param {string} object
   * @param {string} [relation="related_to"]
   */
  async addRelationship(subject, object, relation = "related_to") {
    if (!subject || !object) return;
    await this.initialize();

    const s = String(subject).toLowerCase().trim();
    const o = String(object).toLowerCase().trim();
    const r = String(relation).toLowerCase().trim();

    if (!this.graph.has(s)) {
      this.graph.set(s, new Set());
    }

    const set = this.graph.get(s);
    // Check for existing edge
    const exists = Array.from(set).some(e => e.target === o && e.relation === r);
    if (!exists) {
      set.add({ target: o, relation: r });
      await this._syncToDisk();
    }
  }

  /**
   * Query direct related nodes for a subject.
   * @param {string} subject
   * @returns {Array<{target: string, relation: string}>}
   */
  async getRelatedNodes(subject) {
    if (!subject) return [];
    await this.initialize();
    const s = String(subject).toLowerCase().trim();
    if (!this.graph.has(s)) return [];
    return Array.from(this.graph.get(s));
  }

  /**
   * Perform graph expansion / multi-hop traversal from a start node.
   * @param {string} startNode
   * @param {number} [maxDepth=2]
   * @returns {Array<{target: string, relation: string, depth: number}>}
   */
  async expandGraph(startNode, maxDepth = 2) {
    await this.initialize();
    const visited = new Set();
    const results = [];
    const queue = [{ node: String(startNode).toLowerCase().trim(), depth: 0 }];

    while (queue.length > 0) {
      const { node, depth } = queue.shift();
      if (visited.has(node) || depth >= maxDepth) continue;
      visited.add(node);

      const edges = await this.getRelatedNodes(node);
      for (const edge of edges) {
        results.push({ ...edge, depth: depth + 1 });
        if (!visited.has(edge.target)) {
          queue.push({ node: edge.target, depth: depth + 1 });
        }
      }
    }

    return results;
  }

  /**
   * Dump complete graph object for debugging.
   */
  async dumpGraph() {
    await this.initialize();
    const obj = {};
    for (const [k, v] of this.graph.entries()) {
      obj[k] = Array.from(v);
    }
    return obj;
  }
}

export const relationshipGraph = new RelationshipGraph();
