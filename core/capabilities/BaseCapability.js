/**
 * BaseCapability.js
 *
 * Abstract base class for all capabilities in samGPT.
 * Every capability (Memory, Vision, Desktop, Browser, Research, Code, PDF, Task, Notes, Web, Chat, Voice)
 * inherits from BaseCapability and exposes a standardized 5-stage lifecycle.
 */
export class BaseCapability {
  /**
   * @param {string} name - Capability identifier (e.g. "memory", "desktop")
   * @param {string} displayName - Human readable name
   * @param {number} [priority=50] - Match priority (0-100)
   */
  constructor(name, displayName, priority = 50) {
    this.name = name;
    this.displayName = displayName;
    this.priority = priority;
    this.isInitialized = false;
  }

  /**
   * Lazy initialization hook for capability resources, tools, and models.
   */
  async initialize() {
    this.isInitialized = true;
  }

  /**
   * Evaluate whether this capability can handle a request.
   * @param {import("./CapabilityContext.js").CapabilityContext} capabilityContext
   * @returns {number|boolean} Match score (0.0 to 1.0) or boolean
   */
  canHandle(capabilityContext) {
    return false;
  }

  /**
   * Analyze phase of the lifecycle.
   * Extracts parameters, intents, and target entities.
   * @param {import("./CapabilityContext.js").CapabilityContext} capabilityContext
   * @returns {Promise<object>} Analysis payload
   */
  async analyze(capabilityContext) {
    return { intent: this.name };
  }

  /**
   * Plan phase of the lifecycle.
   * Generates action plan if multi-step, or returns single-step execution plan.
   * @param {import("./CapabilityContext.js").CapabilityContext} capabilityContext
   * @returns {Promise<object>} Execution plan
   */
  async plan(capabilityContext) {
    return { steps: [{ name: this.name, action: "execute" }] };
  }

  /**
   * Execute phase of the lifecycle.
   * Runs capability actions or delegates to ActionExecutor.
   * @param {import("./CapabilityContext.js").CapabilityContext} capabilityContext
   * @returns {Promise<import("./CapabilityResult.js").CapabilityResult>} Standardized result
   */
  async execute(capabilityContext) {
    throw new Error(`execute() not implemented on capability "${this.name}".`);
  }

  /**
   * Cleanup phase of the lifecycle.
   * Releases transient resources.
   */
  async cleanup() {
    // Optional resource cleanup hook
  }
}
