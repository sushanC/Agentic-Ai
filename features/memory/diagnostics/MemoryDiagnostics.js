import { MEMORY_CONFIG } from "../config/MemoryConfig.js";

/**
 * MemoryDiagnostics.js
 *
 * Structured diagnostic tracking for the Cognitive Memory System.
 * Records latency, embedding cache performance, store hit rates,
 * and memory selection metrics.
 */
export class MemoryDiagnostics {
  constructor() {
    this.metrics = {
      totalRetrievals: 0,
      cacheHits: 0,
      cacheMisses: 0,
      lastRetrievalLatencyMs: 0,
      lastRankingLatencyMs: 0,
      lastEmbeddingLatencyMs: 0,
    };
  }

  recordCacheHit() {
    this.metrics.cacheHits++;
  }

  recordCacheMiss() {
    this.metrics.cacheMisses++;
  }

  logRetrieval(tag, details) {
    if (!MEMORY_CONFIG.DIAGNOSTICS.enableVerbose) return;
    console.log(`[MemoryDiagnostics:${tag}]`, JSON.stringify(details));
  }

  logError(tag, error) {
    console.error(`[MemoryDiagnostics:${tag}] Error:`, error.message || error);
  }

  getMetrics() {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    const hitRate = total > 0 ? (this.metrics.cacheHits / total).toFixed(2) : "0.00";
    return {
      ...this.metrics,
      cacheHitRate: Number(hitRate),
    };
  }
}

export const memoryDiagnostics = new MemoryDiagnostics();
