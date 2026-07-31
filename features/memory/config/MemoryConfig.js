/**
 * MemoryConfig.js
 *
 * Centralized configuration parameters for the Cognitive Memory System.
 * Stores ranking weights, similarity thresholds, topK defaults, expiration policies,
 * and memory store priorities.
 */
export const MEMORY_CONFIG = Object.freeze({
  // Multi-Factor Ranking Engine Weights (must sum to 1.0)
  RANKING_WEIGHTS: Object.freeze({
    similarity: 0.40,       // Vector / semantic embedding similarity
    importance: 0.20,       // Dynamic importance score (0.0 to 1.0)
    recency: 0.15,          // Exponential age decay
    accessCount: 0.10,      // Frequency of retrieval
    confidence: 0.05,       // Memory confidence factor
    proximity: 0.10,        // Relationship graph proximity score
  }),

  // Retrieval & Filtering Parameters
  RETRIEVAL: Object.freeze({
    defaultTopK: 10,
    similarityThreshold: 0.40,
    decayHalfLifeHours: 48,  // Age half-life for recency decay
    boostUserEmphasis: 0.30, // Score boost for user emphasis ("remember")
  }),

  // Memory Store Priorities
  STORE_PRIORITIES: Object.freeze({
    working: 100,
    semantic: 90,
    preference: 85,
    project: 80,
    episodic: 70,
    reflection: 65,
    conversation: 50,
  }),

  // Expiration & Cache Limits
  LIMITS: Object.freeze({
    workingMemoryMaxItems: 50,
    conversationContextWindow: 20,
    embeddingCacheSize: 500,
  }),

  // Diagnostics & Logging
  DIAGNOSTICS: Object.freeze({
    enableVerbose: process.env.NODE_ENV !== "production",
  })
});
