import { randomUUID } from "crypto";

/**
 * MemoryObject.js
 *
 * Structured memory object factory and validator.
 * Replaces raw key-value strings with rich, structured memory entities.
 */
export class MemoryObject {
  /**
   * Create a structured MemoryObject instance.
   *
   * @param {object} params
   * @param {string} [params.id] - Unique identifier
   * @param {string} params.type - Memory store type ("working"|"conversation"|"semantic"|"preference"|"project"|"episodic"|"reflection")
   * @param {string} [params.category="general"] - Memory category tag
   * @param {any} params.content - Key-value pair or structured memory payload
   * @param {number} [params.importance=0.5] - Dynamic importance rating (0.0 to 1.0)
   * @param {number} [params.confidence=1.0] - Confidence rating (0.0 to 1.0)
   * @param {number} [params.createdAt] - Creation timestamp (ms)
   * @param {number} [params.updatedAt] - Update timestamp (ms)
   * @param {number} [params.lastAccessed] - Access timestamp (ms)
   * @param {number} [params.accessCount=0] - Number of times retrieved
   * @param {Array|null} [params.embeddingRef=null] - Pre-computed vector embedding
   * @param {Array} [params.relationships=[]] - Graph edges [{ target, relation }]
   * @returns {object} Structured MemoryObject
   */
  static create({
    id,
    type = "semantic",
    category = "general",
    content,
    importance = 0.5,
    confidence = 1.0,
    createdAt = Date.now(),
    updatedAt = Date.now(),
    lastAccessed = Date.now(),
    accessCount = 0,
    embeddingRef = null,
    relationships = [],
    ...restParams
  } = {}) {
    let rawContent = content;
    if (!rawContent && restParams && Object.keys(restParams).length > 0) {
      rawContent = restParams;
    }

    if (!rawContent) {
      throw new Error("MemoryObject requires non-empty content.");
    }

    const memoryId = id || (typeof rawContent === "object" && rawContent.key ? `mem_${rawContent.key}` : `mem_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`);

    return {
      id: String(memoryId),
      type: String(type),
      category: String(category),
      content: rawContent,
      importance: Math.max(0.0, Math.min(1.0, Number(importance))),
      confidence: Math.max(0.0, Math.min(1.0, Number(confidence))),
      createdAt: Number(createdAt),
      updatedAt: Number(updatedAt),
      lastAccessed: Number(lastAccessed),
      accessCount: Number(accessCount),
      embeddingRef: Array.isArray(embeddingRef) ? embeddingRef : null,
      relationships: Array.isArray(relationships) ? relationships : [],
    };
  }

  /**
   * Convert a MemoryObject into a flat text string suitable for vector embedding generation.
   * @param {object} memoryObj
   * @returns {string}
   */
  static toText(memoryObj) {
    if (!memoryObj || !memoryObj.content) return "";
    if (typeof memoryObj.content === "string") return memoryObj.content;
    if (typeof memoryObj.content === "object") {
      if (memoryObj.content.key && memoryObj.content.value) {
        const valStr = Array.isArray(memoryObj.content.value) ? memoryObj.content.value.join(", ") : String(memoryObj.content.value);
        return `${memoryObj.content.key}: ${valStr}`;
      }
      return JSON.stringify(memoryObj.content);
    }
    return String(memoryObj.content);
  }
}
