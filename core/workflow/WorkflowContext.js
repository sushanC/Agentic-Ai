/**
 * WorkflowContext.js
 *
 * Shared mutable state object that travels through the entire workflow execution.
 * Every node may read from and write to WorkflowContext, enabling outputs from
 * one capability to feed as inputs to the next.
 *
 * Responsibilities:
 * - Hold the original CapabilityContext fields (prompt, memory, history, summary, etc.)
 * - Provide a typed store for node outputs (keyed by node id)
 * - Provide a variables store for inter-node communication (keyed by arbitrary string)
 * - Emit clean, serialisable snapshots for diagnostics
 */
export class WorkflowContext {
  /**
   * @param {object} params
   * @param {string} params.prompt           - Original user prompt
   * @param {string} [params.toolContext]    - Tool context mode ("chat", "voice", ...)
   * @param {object} [params.semanticMemory] - Semantic memory from ContextAssembly
   * @param {Array}  [params.history]        - Conversation history
   * @param {string} [params.summary]        - Conversation summary
   * @param {object} [params.pdfMemory]      - PDF memory context
   * @param {object} [params.runtimeState]   - Active runtime state
   * @param {object} [params.userPreferences]
   */
  constructor({
    prompt         = "",
    toolContext    = "chat",
    semanticMemory = {},
    history        = [],
    summary        = "",
    pdfMemory      = {},
    runtimeState   = {},
    userPreferences = {},
  } = {}) {
    // Original request fields — read-only throughout execution
    this.prompt          = String(prompt);
    this.toolContext     = String(toolContext);
    this.semanticMemory  = semanticMemory;
    this.history         = history;
    this.summary         = summary;
    this.pdfMemory       = pdfMemory;
    this.runtimeState    = runtimeState;
    this.userPreferences = userPreferences;

    // Runtime mutable state
    /** @type {Map<string, object>} nodeId → CapabilityResult */
    this._nodeOutputs = new Map();
    /** @type {Map<string, any>} arbitrary key-value store for inter-node data */
    this._variables   = new Map();

    this._createdAt = Date.now();
  }

  // ─── Node Outputs ────────────────────────────────────────────────────────────

  /**
   * Store a capability result for a completed node.
   * @param {string} nodeId
   * @param {object} result - CapabilityResult
   */
  setNodeOutput(nodeId, result) {
    this._nodeOutputs.set(nodeId, result);
  }

  /**
   * Retrieve the capability result for a node.
   * @param {string} nodeId
   * @returns {object|null}
   */
  getNodeOutput(nodeId) {
    return this._nodeOutputs.get(nodeId) ?? null;
  }

  /**
   * Get all node outputs as a plain object.
   * @returns {object}
   */
  getAllNodeOutputs() {
    const obj = {};
    for (const [id, result] of this._nodeOutputs) {
      obj[id] = result;
    }
    return obj;
  }

  // ─── Variables ───────────────────────────────────────────────────────────────

  /**
   * Set an arbitrary variable in the shared context.
   * @param {string} key
   * @param {any}    value
   */
  setVariable(key, value) {
    this._variables.set(key, value);
  }

  /**
   * Get an arbitrary variable from the shared context.
   * @param {string} key
   * @param {any}    [defaultValue=null]
   * @returns {any}
   */
  getVariable(key, defaultValue = null) {
    return this._variables.has(key) ? this._variables.get(key) : defaultValue;
  }

  // ─── Prompt Composition ──────────────────────────────────────────────────────

  /**
   * Build a composed prompt for a workflow node that enriches the original
   * prompt with outputs from its upstream dependencies.
   *
   * @param {import("./WorkflowNode.js").WorkflowNode} node
   * @returns {string} Composed prompt
   */
  buildNodePrompt(node) {
    if (node.dependencies.length === 0) {
      // Root node — use original prompt (or node-specific override)
      return node.input.prompt ?? this.prompt;
    }

    // Append upstream output answers to the original prompt
    const upstreamParts = [];
    for (const depId of node.dependencies) {
      const depOutput = this._nodeOutputs.get(depId);
      if (depOutput && depOutput.answer) {
        upstreamParts.push(`[Context from '${depId}']: ${depOutput.answer}`);
      }
    }

    const override = node.input.prompt;
    const base     = override ?? this.prompt;

    return upstreamParts.length > 0
      ? `${upstreamParts.join("\n")}\n\nUser instruction: ${base}`
      : base;
  }

  // ─── Serialisation ────────────────────────────────────────────────────────────

  /**
   * Returns a plain snapshot for diagnostics — avoids leaking Map internals.
   * @returns {object}
   */
  toSnapshot() {
    return {
      prompt:      this.prompt,
      toolContext: this.toolContext,
      nodeOutputCount: this._nodeOutputs.size,
      variableCount:   this._variables.size,
      variables:  Object.fromEntries(this._variables),
      ageMs:      Date.now() - this._createdAt,
    };
  }
}
