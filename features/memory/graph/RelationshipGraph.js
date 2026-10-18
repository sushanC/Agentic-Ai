import { getStoragePath } from "../../../storage/storagePath.js";
import { createJsonFileStore } from "../../../storage/jsonFile.js";

const graphFile = createJsonFileStore(getStoragePath("relationship_graph.json"), {
  fallbackValue: {},
  validate: value => value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.values(value).every(Array.isArray),
  mode: 0o600,
});

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
    const json = await graphFile.read();
    this.graph.clear();
    for (const [subject, edges] of Object.entries(json)) {
      const edgeSet = new Set();
      for (const edge of edges) {
        edgeSet.add(typeof edge === "string" ? { target: edge, relation: "related_to" } : edge);
      }
      this.graph.set(subject, edgeSet);
    }
    this.initialized = true;
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

    let updated;
    await graphFile.update(json => {
      const edges = (json[s] || []).map(edge => typeof edge === "string" ? { target: edge, relation: "related_to" } : edge);
      if (!edges.some(edge => edge.target === o && edge.relation === r)) edges.push({ target: o, relation: r });
      updated = { ...json, [s]: edges };
      return updated;
    });
    this.graph.clear();
    for (const [subject, edges] of Object.entries(updated)) this.graph.set(subject, new Set(edges));
  }

  async removeRelationship(subject, object, relation = "related_to") {
    if (!subject || !object) return false;
    await this.initialize();
    const s = String(subject).toLowerCase().trim();
    const o = String(object).toLowerCase().trim();
    const r = String(relation).toLowerCase().trim();
    let removed = false;
    let updated;
    await graphFile.update(json => {
      const edges = (json[s] || []).map(edge => typeof edge === "string" ? { target: edge, relation: "related_to" } : edge);
      const nextEdges = edges.filter(edge => {
        const matches = edge.target === o && edge.relation === r;
        if (matches) removed = true;
        return !matches;
      });
      updated = { ...json };
      if (nextEdges.length) updated[s] = nextEdges;
      else delete updated[s];
      return updated;
    });
    this.graph.clear();
    for (const [subject, edges] of Object.entries(updated)) this.graph.set(subject, new Set(edges));
    return removed;
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
