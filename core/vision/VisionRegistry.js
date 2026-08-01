/**
 * VisionRegistry.js
 *
 * Dynamic discovery and registration hub for Vision Providers and Vision Analyzers.
 */
export class VisionRegistry {
  constructor() {
    this.providers = new Map(); // name -> VisionProvider instance
    this.analyzers = new Map(); // name -> Analyzer instance
  }

  // ─── Provider Management ───────────────────────────────────────────────────

  registerProvider(providerInstance) {
    if (!providerInstance || !providerInstance.name) {
      throw new Error("VisionRegistry: Provider with valid name is required.");
    }
    this.providers.set(providerInstance.name.toLowerCase(), providerInstance);
  }

  getProvider(name) {
    return this.providers.get(name.toLowerCase()) || null;
  }

  getAllProviders() {
    return Array.from(this.providers.values()).sort((a, b) => b.priority - a.priority);
  }

  // ─── Analyzer Management ───────────────────────────────────────────────────

  registerAnalyzer(analyzerInstance) {
    if (!analyzerInstance || !analyzerInstance.name) {
      throw new Error("VisionRegistry: Analyzer with valid name is required.");
    }
    this.analyzers.set(analyzerInstance.name.toLowerCase(), analyzerInstance);
  }

  getAnalyzer(name) {
    return this.analyzers.get(name.toLowerCase()) || null;
  }

  getAllAnalyzers() {
    return Array.from(this.analyzers.values());
  }

  clear() {
    this.providers.clear();
    this.analyzers.clear();
  }
}

export const visionRegistry = new VisionRegistry();
