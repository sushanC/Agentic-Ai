import { memoryRegistry } from "./registry/MemoryRegistry.js";
import { memoryRanker } from "./ranking/MemoryRanker.js";
import { memoryImportanceEngine } from "./importance/MemoryImportanceEngine.js";
import { memoryContextBuilder } from "./context/MemoryContextBuilder.js";
import { relationshipGraph } from "./graph/RelationshipGraph.js";
import { conversationCompressor } from "./compression/ConversationCompressor.js";
import { memoryDiagnostics } from "./diagnostics/MemoryDiagnostics.js";
import { extractMemory } from "../../services/ai.js";
import { normalizeMemory } from "./memoryNormalizer.js";

/**
 * MemoryManager.js
 *
 * Single Orchestrator and Public Facade for the Cognitive Memory System.
 * Every memory operation flows through MemoryManager.
 * Coordinates MemoryRegistry, MemoryRanker, MemoryImportanceEngine,
 * MemoryContextBuilder, and RelationshipGraph.
 */
export class MemoryManager {
  constructor() {
    this.registry = memoryRegistry;
    this.ranker = memoryRanker;
    this.importanceEngine = memoryImportanceEngine;
    this.contextBuilder = memoryContextBuilder;
    this.graph = relationshipGraph;
    this.compressor = conversationCompressor;
    this.diagnostics = memoryDiagnostics;
  }

  /**
   * Store a memory item into the appropriate specialized store.
   *
   * @param {object} item - Fact, preference, experience, or memory object
   * @param {object} [options]
   * @param {string} [options.storeName="semantic"] - Target store name
   * @returns {Promise<object>} Stored MemoryObject
   */
  async store(item, options = {}) {
    const storeName = options.storeName || item.type || "semantic";
    const store = this.registry.getStore(storeName);

    if (!store) {
      throw new Error(`MemoryManager: Store "${storeName}" is not registered.`);
    }

    // Calculate dynamic importance
    const calculatedImportance = this.importanceEngine.calculateImportance(item, options);
    const enrichedItem = { ...item, importance: calculatedImportance };

    const storedObj = await store.store(enrichedItem);

    // Sync relationship graph if relationships exist
    if (storedObj.content && storedObj.content.key) {
      await this.graph.addRelationship("user", storedObj.content.key, "has_property");
    }

    this.diagnostics.logRetrieval("Store", { storeName, id: storedObj.id });
    return storedObj;
  }

  /**
   * Unified memory retrieval pipeline.
   * Interacts with all enabled stores via MemoryRegistry ➔ MemoryRanker ➔ MemoryContextBuilder.
   *
   * @param {string} query - User search query or prompt
   * @param {object} [options]
   * @param {Array<string>} [options.stores] - Specific store names to query (all if omitted)
   * @param {number} [options.topK=10] - Number of ranked memories to return
   * @returns {Promise<object>} Formatted CIE payload object with `_scores` metadata
   */
  async retrieve(query, options = {}) {
    const startTime = Date.now();
    const enabledStores = options.stores
      ? options.stores.map(s => this.registry.getStore(s)).filter(Boolean)
      : this.registry.getAllStores();

    // 1. Parallel candidate retrieval from stores
    const candidatePromises = enabledStores.map(store => store.retrieve(query, options));
    const storeResults = await Promise.all(candidatePromises);
    const allCandidates = storeResults.flat();

    if (allCandidates.length === 0) {
      return this.contextBuilder.buildCiePayload([]);
    }

    // 2. Rank candidates using multi-factor MemoryRanker
    const rankedMemories = await this.ranker.rank(allCandidates, query, options);
    const topMemories = rankedMemories.slice(0, options.topK || 10);

    // 3. Build CIE Payload
    const payload = this.contextBuilder.buildCiePayload(topMemories);

    this.diagnostics.logRetrieval("Retrieve", {
      query,
      candidateCount: allCandidates.length,
      returnedCount: topMemories.length,
      latencyMs: Date.now() - startTime,
    });

    return payload;
  }

  /**
   * Update memory by extracting new facts from a user message.
   * Replaces legacy updateMemory().
   *
   * @param {string} userMessage
   */
  async update(userMessage) {
    if (!userMessage) return;
    try {
      const extractedFacts = await extractMemory(userMessage);
      if (!extractedFacts || Object.keys(extractedFacts).length === 0) return;

      const cleaned = normalizeMemory(extractedFacts);
      for (const [key, value] of Object.entries(cleaned)) {
        await this.store({ content: { key, value } }, { storeName: "semantic" });
      }

      this.diagnostics.logRetrieval("Update", { extractedCount: Object.keys(cleaned).length });
    } catch (err) {
      this.diagnostics.logError("Update", err);
    }
  }

  /**
   * Delete a memory item across stores.
   *
   * @param {string} keyOrId
   * @param {string} [storeName="semantic"]
   */
  async delete(keyOrId, storeName = "semantic") {
    const store = this.registry.getStore(storeName);
    if (!store) return false;
    return await store.delete(keyOrId);
  }

  /**
   * Search memory items with a filter function.
   * @param {Function} filterFn
   * @param {string} [storeName]
   */
  async search(filterFn, storeName) {
    if (storeName) {
      const store = this.registry.getStore(storeName);
      return store ? await store.search(filterFn) : [];
    }

    const stores = this.registry.getAllStores();
    const results = await Promise.all(stores.map(s => s.search(filterFn)));
    return results.flat();
  }

  /**
   * Consolidate and deduplicate memory entries across stores.
   */
  async consolidate() {
    const semanticStore = this.registry.getStore("semantic");
    if (semanticStore && semanticStore.initialize) {
      await semanticStore.initialize();
    }
    await this.compressor.compressIfNeeded();
    this.diagnostics.logRetrieval("Consolidate", { status: "complete" });
  }

  /**
   * Return legacy flat object representation of semantic facts.
   */
  async getLegacyProfile() {
    const store = this.registry.getStore("semantic");
    return store ? await store.getLegacyObject() : {};
  }
}

export const memoryManager = new MemoryManager();
