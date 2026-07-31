import { MemoryObject } from "../model/MemoryObject.js";

/**
 * MemoryContextBuilder.js
 *
 * Formats ranked MemoryObject items into structured prompt-ready context blocks
 * for the Context Intelligence Engine (CIE) and system prompt injection.
 */
export class MemoryContextBuilder {
  /**
   * Build structured memory context payload for CIE injection.
   *
   * @param {Array<object>} rankedMemories - Array of ranked MemoryObjects
   * @returns {object} Filtered memory object with non-enumerable `_scores` map
   */
  buildCiePayload(rankedMemories = []) {
    const memoryPayload = {};
    const scoresMap = {};

    for (const mem of rankedMemories) {
      if (mem.content && typeof mem.content === "object" && mem.content.key) {
        memoryPayload[mem.content.key] = mem.content.value;
        scoresMap[mem.content.key] = mem._totalScore || mem._similarityScore || 0.8;
      } else {
        const textKey = mem.id || `mem_${Math.random().toString(36).substring(2, 6)}`;
        memoryPayload[textKey] = MemoryObject.toText(mem);
        scoresMap[textKey] = mem._totalScore || 0.8;
      }
    }

    // Attach scores as non-enumerable property for CIE telemetry
    Object.defineProperty(memoryPayload, "_scores", {
      value: scoresMap,
      enumerable: false,
      configurable: true,
      writable: true,
    });

    return memoryPayload;
  }

  /**
   * Format memory items into a formatted text string for system prompt injection.
   *
   * @param {Array<object>} rankedMemories
   * @returns {string} Formatted markdown/text memory section
   */
  buildPromptText(rankedMemories = []) {
    if (!rankedMemories || rankedMemories.length === 0) return "";

    const lines = ["### Relevant User Memory & Context:"];
    for (const mem of rankedMemories) {
      const text = MemoryObject.toText(mem);
      lines.push(`- [${mem.type.toUpperCase()}] ${text}`);
    }
    return lines.join("\n");
  }
}

export const memoryContextBuilder = new MemoryContextBuilder();
