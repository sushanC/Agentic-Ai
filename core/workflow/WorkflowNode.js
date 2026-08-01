/**
 * WorkflowNode.js
 *
 * Immutable data structure representing a single unit of work in a WorkflowGraph.
 * Each node encapsulates a task description, the capability required to execute it,
 * its dependency relationships, execution status, input/output payloads, and metadata.
 *
 * Node lifecycle: pending → running → completed | failed | skipped
 */

/** @enum {string} */
export const NodeStatus = Object.freeze({
  PENDING:   "pending",
  RUNNING:   "running",
  COMPLETED: "completed",
  FAILED:    "failed",
  SKIPPED:   "skipped",
});

export class WorkflowNode {
  /**
   * Create a WorkflowNode.
   *
   * @param {object} params
   * @param {string}   params.id                 - Unique node identifier within the graph
   * @param {string}   params.task               - Human-readable task description (planner language)
   * @param {string}   params.requiredCapability - Capability name that will execute this node
   * @param {string[]} [params.dependencies=[]]  - IDs of nodes that must complete before this one
   * @param {object}   [params.input={}]         - Static input for the capability (may be augmented at runtime)
   * @param {object}   [params.metadata={}]      - Arbitrary metadata for extensions
   */
  constructor({
    id,
    task,
    requiredCapability,
    dependencies = [],
    input = {},
    metadata = {},
  }) {
    if (!id || typeof id !== "string") {
      throw new TypeError("WorkflowNode: 'id' must be a non-empty string.");
    }
    if (!task || typeof task !== "string") {
      throw new TypeError("WorkflowNode: 'task' must be a non-empty string.");
    }
    if (!requiredCapability || typeof requiredCapability !== "string") {
      throw new TypeError("WorkflowNode: 'requiredCapability' must be a non-empty string.");
    }
    if (!Array.isArray(dependencies)) {
      throw new TypeError("WorkflowNode: 'dependencies' must be an array.");
    }

    this.id                 = id;
    this.task               = task;
    this.requiredCapability = requiredCapability.toLowerCase();
    this.dependencies       = [...dependencies];
    this.input              = { ...input };
    this.metadata           = { ...metadata, createdAt: Date.now() };

    // Mutable runtime fields (set by WorkflowExecutor)
    this.status = NodeStatus.PENDING;
    this.output = null;
    this.error  = null;
    this.startedAt  = null;
    this.finishedAt = null;
  }

  /**
   * Mark this node as running.
   * @returns {this}
   */
  markRunning() {
    this.status    = NodeStatus.RUNNING;
    this.startedAt = Date.now();
    return this;
  }

  /**
   * Mark this node as completed with its output.
   * @param {object} output - CapabilityResult from execution
   * @returns {this}
   */
  markCompleted(output) {
    this.status     = NodeStatus.COMPLETED;
    this.output     = output;
    this.finishedAt = Date.now();
    return this;
  }

  /**
   * Mark this node as failed with the error.
   * @param {Error} error
   * @returns {this}
   */
  markFailed(error) {
    this.status     = NodeStatus.FAILED;
    this.error      = error;
    this.finishedAt = Date.now();
    return this;
  }

  /**
   * Mark this node as skipped (e.g. a dependency failed).
   * @returns {this}
   */
  markSkipped() {
    this.status     = NodeStatus.SKIPPED;
    this.finishedAt = Date.now();
    return this;
  }

  /**
   * Returns a plain serializable snapshot of this node.
   * @returns {object}
   */
  toJSON() {
    return {
      id:                 this.id,
      task:               this.task,
      requiredCapability: this.requiredCapability,
      dependencies:       this.dependencies,
      status:             this.status,
      input:              this.input,
      output:             this.output,
      error:              this.error ? (this.error.message || String(this.error)) : null,
      startedAt:          this.startedAt,
      finishedAt:         this.finishedAt,
      metadata:           this.metadata,
    };
  }
}
