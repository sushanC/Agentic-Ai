import { NodeStatus, WorkflowNode } from "./WorkflowNode.js";

/**
 * WorkflowGraph.js
 *
 * Directed Acyclic Graph (DAG) of WorkflowNodes.
 * Supports adding nodes, querying executable nodes (all dependencies completed),
 * topological ordering, cycle detection, and full traversal.
 *
 * Design notes:
 * - Nodes are stored in insertion order (Map preserves insertion order).
 * - Dependency resolution is done by examining node.dependencies against live node statuses.
 * - The graph deliberately does NOT store edge objects — dependencies are encoded on each node.
 */
export class WorkflowGraph {
  constructor() {
    /** @type {Map<string, WorkflowNode>} */
    this._nodes = new Map();
  }

  // ─── Mutation ───────────────────────────────────────────────────────────────

  /**
   * Add a WorkflowNode to the graph.
   * @param {WorkflowNode} node
   * @throws {Error} if a node with the same id already exists.
   */
  addNode(node) {
    if (!(node instanceof WorkflowNode)) {
      throw new TypeError("WorkflowGraph.addNode: argument must be a WorkflowNode instance.");
    }
    if (this._nodes.has(node.id)) {
      throw new Error(`WorkflowGraph: duplicate node id "${node.id}".`);
    }
    this._nodes.set(node.id, node);
  }

  // ─── Queries ────────────────────────────────────────────────────────────────

  /**
   * Retrieve a node by its id.
   * @param {string} id
   * @returns {WorkflowNode|null}
   */
  getNode(id) {
    return this._nodes.get(id) ?? null;
  }

  /**
   * Get all nodes in insertion order.
   * @returns {WorkflowNode[]}
   */
  getAllNodes() {
    return Array.from(this._nodes.values());
  }

  /**
   * Returns the number of nodes in the graph.
   * @returns {number}
   */
  get size() {
    return this._nodes.size;
  }

  /**
   * Returns nodes that are ready to execute:
   * status is PENDING and all dependency nodes are COMPLETED.
   * @returns {WorkflowNode[]}
   */
  getExecutableNodes() {
    const executable = [];
    for (const node of this._nodes.values()) {
      if (node.status !== NodeStatus.PENDING) continue;
      const depsAllDone = node.dependencies.every(depId => {
        const dep = this._nodes.get(depId);
        return dep && dep.status === NodeStatus.COMPLETED;
      });
      if (depsAllDone) {
        executable.push(node);
      }
    }
    return executable;
  }

  /**
   * Returns nodes that have been completed.
   * @returns {WorkflowNode[]}
   */
  getCompletedNodes() {
    return Array.from(this._nodes.values()).filter(n => n.status === NodeStatus.COMPLETED);
  }

  /**
   * Returns nodes that have failed.
   * @returns {WorkflowNode[]}
   */
  getFailedNodes() {
    return Array.from(this._nodes.values()).filter(n => n.status === NodeStatus.FAILED);
  }

  /**
   * Returns true when all nodes have reached a terminal state (completed, failed, or skipped).
   * @returns {boolean}
   */
  isFinished() {
    const terminalStatuses = new Set([NodeStatus.COMPLETED, NodeStatus.FAILED, NodeStatus.SKIPPED]);
    return Array.from(this._nodes.values()).every(n => terminalStatuses.has(n.status));
  }

  // ─── Topology & Validation Helpers ──────────────────────────────────────────

  /**
   * Detect whether the graph contains a cycle.
   * Uses DFS coloring (white=0, grey=1, black=2).
   * @returns {boolean} true if a cycle exists.
   */
  isCyclic() {
    const WHITE = 0, GREY = 1, BLACK = 2;
    const color = new Map();
    for (const id of this._nodes.keys()) color.set(id, WHITE);

    const dfs = (nodeId) => {
      color.set(nodeId, GREY);
      const node = this._nodes.get(nodeId);
      if (!node) return false;
      for (const depId of node.dependencies) {
        if (!color.has(depId)) continue; // unknown dep — handled by validator
        if (color.get(depId) === GREY) return true;  // back-edge → cycle
        if (color.get(depId) === WHITE && dfs(depId)) return true;
      }
      color.set(nodeId, BLACK);
      return false;
    };

    for (const id of this._nodes.keys()) {
      if (color.get(id) === WHITE && dfs(id)) return true;
    }
    return false;
  }

  /**
   * Returns nodes in a valid topological order (dependencies before dependents).
   * Assumes the graph is acyclic.
   * @returns {WorkflowNode[]}
   */
  topologicalSort() {
    const visited = new Set();
    const result  = [];

    const visit = (nodeId) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = this._nodes.get(nodeId);
      if (!node) return;
      for (const depId of node.dependencies) {
        visit(depId);
      }
      result.push(node);
    };

    for (const id of this._nodes.keys()) visit(id);
    return result;
  }

  /**
   * Serialise the graph to a plain object for logging / diagnostics.
   * @returns {object}
   */
  toJSON() {
    return {
      nodeCount: this._nodes.size,
      nodes: Array.from(this._nodes.values()).map(n => n.toJSON()),
    };
  }
}
