/**
 * FeatureRegistry.js
 *
 * Centralized feature registry for the Agent Core.
 * Allows feature modules (Voice, Notes, Tasks, PDF, Memory, Chat, Settings, Research, Desktop)
 * to register their capabilities, tools, and routes with the Core runtime.
 */
export class FeatureRegistry {
  constructor() {
    this.features = new Map();
  }

  /**
   * Register a feature module with the core.
   * @param {string} name - Feature identifier (e.g. "voice", "notes", "tasks")
   * @param {object} featureDefinition - Feature metadata, routes, tools, and handlers
   */
  registerFeature(name, featureDefinition = {}) {
    if (!name || typeof name !== "string") {
      throw new Error("Feature name must be a non-empty string.");
    }
    this.features.set(name, {
      name,
      registeredAt: new Date().toISOString(),
      tools: featureDefinition.tools || [],
      capabilities: featureDefinition.capabilities || [],
      routes: featureDefinition.routes || null,
      ...featureDefinition
    });
    console.log(`[FeatureRegistry] Feature registered: ${name}`);
  }

  /**
   * Look up a registered feature.
   * @param {string} name
   */
  getFeature(name) {
    return this.features.get(name);
  }

  /**
   * Return all registered feature definitions.
   * @returns {object[]}
   */
  getAllFeatures() {
    return Array.from(this.features.values());
  }

  /**
   * Check if a feature is registered.
   * @param {string} name
   * @returns {boolean}
   */
  hasFeature(name) {
    return this.features.has(name);
  }
}

// Global singleton instance
export const featureRegistry = new FeatureRegistry();
