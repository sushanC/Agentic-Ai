import { MEMORY_CONFIG } from "../config/MemoryConfig.js";

/**
 * MemoryImportanceEngine.js
 *
 * Dynamically computes and evolves memory importance ratings (0.0 to 1.0)
 * based on recency, access frequency, user emphasis, project relevance,
 * successful reuse, and reflection signals.
 */
export class MemoryImportanceEngine {
  /**
   * Calculate dynamic importance score for a MemoryObject.
   *
   * @param {object} memoryObj
   * @param {object} [context]
   * @returns {number} Normalized importance score (0.0 to 1.0)
   */
  calculateImportance(memoryObj, context = {}) {
    if (!memoryObj) return 0.5;

    let baseImportance = memoryObj.importance || 0.5;

    // 1. Recency Decay
    const ageHours = (Date.now() - (memoryObj.lastAccessed || memoryObj.updatedAt || Date.now())) / (1000 * 60 * 60);
    const recencyFactor = 1 / (1 + ageHours / MEMORY_CONFIG.RETRIEVAL.decayHalfLifeHours);

    // 2. Frequency Boost
    const frequencyFactor = Math.min(1.0, (memoryObj.accessCount || 0) * 0.1);

    // 3. User Emphasis Boost
    const userEmphasisBoost = context.isExplicitRemember || context.userEmphasis ? MEMORY_CONFIG.RETRIEVAL.boostUserEmphasis : 0;

    // 4. Composite calculation
    let calculated = (baseImportance * 0.5) + (recencyFactor * 0.2) + (frequencyFactor * 0.2) + userEmphasisBoost;

    return Math.max(0.1, Math.min(1.0, Math.round(calculated * 100) / 100));
  }
}

export const memoryImportanceEngine = new MemoryImportanceEngine();
