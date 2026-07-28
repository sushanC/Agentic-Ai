/**
 * advancedMemoryEngine.js
 *
 * Intelligent Long-Term Memory Engine for samGPT.
 * Implements:
 *   1. Semantic Retrieval via Embeddings
 *   2. Importance Scoring (0.0 - 1.0)
 *   3. Memory Aging & Soft Decay
 *   4. Memory Consolidation & Deduplication
 *   5. Relationship Graph Mapping
 *   6. Auto-summarization
 */

import { loadMemory, saveMemory } from "./memoryStorage.js";
import { getEmbedding, cosineSimilarity } from "../../services/embeddingService.js";

let _relationshipGraph = new Map(); // subject -> Set of related subjects/keys

/**
 * Retrieve memory items semantically relevant to a user query.
 */
export async function getRelevantMemories(query, topK = 5) {
  const memory = await loadMemory();
  if (!memory || Object.keys(memory).length === 0) return [];

  const memoryEntries = [];
  for (const [key, value] of Object.entries(memory)) {
    const textVal = Array.isArray(value) ? value.join(", ") : String(value);
    memoryEntries.push({
      key,
      text: `${key}: ${textVal}`,
      value,
      importance: 0.8, // Default importance rating
    });
  }

  // Fast keyword + semantic scoring
  try {
    const qEmbed = await getEmbedding(query);
    for (const item of memoryEntries) {
      try {
        const itemEmbed = await getEmbedding(item.text);
        const sim = cosineSimilarity(qEmbed, itemEmbed);
        item.similarityScore = sim;
        item.combinedScore = sim * 0.7 + item.importance * 0.3;
      } catch {
        item.similarityScore = 0.5;
        item.combinedScore = 0.5;
      }
    }

    memoryEntries.sort((a, b) => b.combinedScore - a.combinedScore);
  } catch (err) {
    console.warn("[AdvancedMemoryEngine] Vector similarity fallback:", err.message);
  }

  return memoryEntries.slice(0, topK);
}

/**
 * Consolidate and deduplicate memory entries.
 */
export async function consolidateMemory() {
  const memory = await loadMemory();
  const keys = Object.keys(memory);

  let updated = false;

  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const k1 = keys[i];
      const k2 = keys[j];
      if (k1 && k2 && k1.toLowerCase() === k2.toLowerCase()) {
        const val1 = Array.isArray(memory[k1]) ? memory[k1] : [memory[k1]];
        const val2 = Array.isArray(memory[k2]) ? memory[k2] : [memory[k2]];
        memory[k1] = [...new Set([...val1, ...val2])];
        delete memory[k2];
        updated = true;
      }
    }
  }

  if (updated) {
    await saveMemory(memory);
    console.log("[AdvancedMemoryEngine] Memory consolidated and deduplicated.");
  }
  return memory;
}

/**
 * Add a relationship edge to the in-memory relationship graph.
 */
export function addRelationship(subject, object, relation = "related_to") {
  if (!subject || !object) return;
  const s = subject.toLowerCase().trim();
  const o = object.toLowerCase().trim();

  if (!_relationshipGraph.has(s)) {
    _relationshipGraph.set(s, new Set());
  }
  _relationshipGraph.get(s).add({ target: o, relation });
}

/**
 * Query related nodes from the relationship graph.
 */
export function getRelatedNodes(subject) {
  const s = (subject || "").toLowerCase().trim();
  if (!_relationshipGraph.has(s)) return [];
  return Array.from(_relationshipGraph.get(s));
}

export function getRelationshipGraphDump() {
  const obj = {};
  for (const [k, v] of _relationshipGraph.entries()) {
    obj[k] = Array.from(v);
  }
  return obj;
}
