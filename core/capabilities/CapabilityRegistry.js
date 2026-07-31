/**
 * CapabilityRegistry.js
 *
 * Dynamic discovery and registration hub for Capabilities in samGPT.
 * AgentRuntime and CapabilityManager query CapabilityRegistry rather than hardcoding capability classes.
 */
export class CapabilityRegistry {
  constructor() {
    this.capabilities = new Map(); // name -> BaseCapability instance
  }

  /**
   * Register a capability instance.
   * @param {import("./BaseCapability.js").BaseCapability} capabilityInstance
   */
  register(capabilityInstance) {
    if (!capabilityInstance || !capabilityInstance.name) {
      throw new Error("CapabilityRegistry: Capability instance with valid name is required.");
    }
    this.capabilities.set(capabilityInstance.name.toLowerCase(), capabilityInstance);
  }

  /**
   * Unregister a capability by name.
   * @param {string} name
   */
  unregister(name) {
    this.capabilities.delete(name.toLowerCase());
  }

  /**
   * Get capability by name.
   * @param {string} name
   * @returns {import("./BaseCapability.js").BaseCapability|null}
   */
  getCapability(name) {
    return this.capabilities.get(name.toLowerCase()) || null;
  }

  /**
   * Get all registered capabilities ordered by priority descending.
   * @returns {Array<import("./BaseCapability.js").BaseCapability>}
   */
  getAll() {
    return Array.from(this.capabilities.values()).sort((a, b) => b.priority - a.priority);
  }

  /**
   * Clear all registered capabilities.
   */
  clear() {
    this.capabilities.clear();
  }
}

export const capabilityRegistry = new CapabilityRegistry();
