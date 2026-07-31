/**
 * advancedMemoryEngine.js — Backward Compatibility Adapter
 *
 * Delegates semantic retrieval, consolidation, and relationship graph operations
 * to MemoryManager and RelationshipGraph.
 */
import { memoryManager } from "./MemoryManager.js";
import { relationshipGraph } from "./graph/RelationshipGraph.js";

/**
 * Retrieve memory items semantically relevant to a user query.
 */
export async function getRelevantMemories(query, topK = 5) {
  const ciePayload = await memoryManager.retrieve(query, { topK });
  const memoryEntries = [];

  for (const [key, value] of Object.entries(ciePayload)) {
    const textVal = Array.isArray(value) ? value.join(", ") : String(value);
    memoryEntries.push({
      key,
      text: `${key}: ${textVal}`,
      value,
      importance: 0.85,
      similarityScore: ciePayload._scores?.[key] || 0.8,
      combinedScore: ciePayload._scores?.[key] || 0.8,
    });
  }

  return memoryEntries;
}

/**
 * Consolidate and deduplicate memory entries.
 */
export async function consolidateMemory() {
  await memoryManager.consolidate();
  return await memoryManager.getLegacyProfile();
}

/**
 * Add a relationship edge to the persistent relationship graph.
 */
export function addRelationship(subject, object, relation = "related_to") {
  relationshipGraph.addRelationship(subject, object, relation);
}

/**
 * Query related nodes from the relationship graph.
 */
export function getRelatedNodes(subject) {
  return relationshipGraph.getRelatedNodes(subject);
}

export function getRelationshipGraphDump() {
  return relationshipGraph.dumpGraph();
}
