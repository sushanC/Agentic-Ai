import { MEMORY_CONFIG } from "../config/MemoryConfig.js";
import { getEmbedding, cosineSimilarity } from "../../../services/embeddingService.js";
import { MemoryObject } from "../model/MemoryObject.js";
import { memoryDiagnostics } from "../diagnostics/MemoryDiagnostics.js";

/**
 * MemoryRanker.js
 *
 * Dedicated multi-factor Memory Ranker.
 * Combines vector embedding similarity, dynamic importance, recency,
 * confidence, access frequency, and relationship proximity.
 */
export class MemoryRanker {
  /**
   * Rank candidate memory items against a user search query.
   *
   * @param {Array<object>} candidates - Array of MemoryObject items
   * @param {string} query - User search prompt
   * @param {object} [options]
   * @returns {Promise<Array<object>>} Ranked MemoryObjects sorted by totalScore descending
   */
  async rank(candidates, query, options = {}) {
    if (!candidates || candidates.length === 0) return [];
    const startTime = Date.now();

    const weights = options.weights || MEMORY_CONFIG.RANKING_WEIGHTS;
    let queryEmbedding = null;

    try {
      if (query && typeof query === "string") {
        queryEmbedding = await getEmbedding(query);
      }
    } catch (err) {
      memoryDiagnostics.logError("MemoryRanker:Embedding", err);
    }

    const scored = [];

    for (const item of candidates) {
      const text = MemoryObject.toText(item);
      let similarityScore = 0.5;

      if (queryEmbedding && text) {
        try {
          let itemEmbed = item.embeddingRef;
          if (!itemEmbed) {
            itemEmbed = await getEmbedding(text);
            item.embeddingRef = itemEmbed;
          }
          similarityScore = cosineSimilarity(queryEmbedding, itemEmbed);
        } catch {
          similarityScore = 0.5;
        }
      }

      // Age recency calculation
      const ageHours = (Date.now() - (item.updatedAt || Date.now())) / (1000 * 60 * 60);
      const recencyScore = Math.exp(-ageHours / MEMORY_CONFIG.RETRIEVAL.decayHalfLifeHours);

      // Access frequency score
      const accessScore = Math.min(1.0, (item.accessCount || 0) / 10);

      // Relationship proximity score
      const proximityScore = (item.relationships && item.relationships.length > 0) ? 0.8 : 0.4;

      // Composite Weighted Score
      const totalScore = (
        (similarityScore * weights.similarity) +
        ((item.importance || 0.5) * weights.importance) +
        (recencyScore * weights.recency) +
        (accessScore * weights.accessCount) +
        ((item.confidence || 1.0) * weights.confidence) +
        (proximityScore * weights.proximity)
      );

      scored.push({
        memory: item,
        similarityScore,
        recencyScore,
        totalScore,
      });
    }

    // Sort descending by composite score
    scored.sort((a, b) => b.totalScore - a.totalScore);

    const rankingLatencyMs = Date.now() - startTime;
    memoryDiagnostics.logRetrieval("RankerComplete", {
      candidateCount: candidates.length,
      topScore: scored[0]?.totalScore,
      rankingLatencyMs,
    });

    return scored.map(s => ({
      ...s.memory,
      _similarityScore: s.similarityScore,
      _totalScore: s.totalScore,
    }));
  }
}

export const memoryRanker = new MemoryRanker();
