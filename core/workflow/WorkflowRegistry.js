/**
 * WorkflowRegistry.js
 *
 * Named workflow template registry.
 * Stores pre-defined WorkflowGraph factories (factory functions that, given a
 * CapabilityContext, produce a WorkflowGraph) under human-readable names.
 *
 * This enables:
 *   - Reusable workflow patterns ("research-and-note", "summarize-and-task", …)
 *   - Plugins and extensions to register custom workflow templates
 *   - Future tooling to list and describe available workflow patterns
 *
 * Extension point: Parallel execution, conditional branches, and loop nodes
 * can be registered as new templates without modifying WorkflowEngine.
 */
export class WorkflowRegistry {
  constructor() {
    /** @type {Map<string, WorkflowTemplate>} */
    this._templates = new Map();
  }

  /**
   * Register a named workflow template.
   *
   * @param {string}   name                   - Unique template name (e.g. "research-and-note")
   * @param {string}   description            - Human-readable description
   * @param {Function} factory                - Async factory: (CapabilityContext) → WorkflowGraph
   * @param {object}   [metadata={}]          - Arbitrary metadata (tags, version, author, …)
   */
  register(name, description, factory, metadata = {}) {
    if (!name || typeof name !== "string") {
      throw new TypeError("WorkflowRegistry.register: 'name' must be a non-empty string.");
    }
    if (typeof factory !== "function") {
      throw new TypeError(`WorkflowRegistry.register "${name}": 'factory' must be a function.`);
    }
    this._templates.set(name.toLowerCase(), {
      name:        name.toLowerCase(),
      description: String(description),
      factory,
      metadata: { registeredAt: Date.now(), ...metadata },
    });
  }

  /**
   * Unregister a template by name.
   * @param {string} name
   */
  unregister(name) {
    this._templates.delete(name.toLowerCase());
  }

  /**
   * Retrieve a template by name.
   * @param {string} name
   * @returns {{ name: string, description: string, factory: Function, metadata: object }|null}
   */
  getTemplate(name) {
    return this._templates.get(name.toLowerCase()) ?? null;
  }

  /**
   * Check if a template is registered.
   * @param {string} name
   * @returns {boolean}
   */
  hasTemplate(name) {
    return this._templates.has(name.toLowerCase());
  }

  /**
   * List all registered template names and descriptions.
   * @returns {{ name: string, description: string }[]}
   */
  listTemplates() {
    return Array.from(this._templates.values()).map(t => ({
      name:        t.name,
      description: t.description,
      metadata:    t.metadata,
    }));
  }

  /**
   * Execute a named template factory with the given context.
   * @param {string} name
   * @param {import("../capabilities/CapabilityContext.js").CapabilityContext} context
   * @returns {Promise<import("./WorkflowGraph.js").WorkflowGraph>}
   */
  async buildGraph(name, context) {
    const template = this.getTemplate(name);
    if (!template) {
      throw new Error(`WorkflowRegistry: no template registered under name "${name}".`);
    }
    return await template.factory(context);
  }
}

export const workflowRegistry = new WorkflowRegistry();
