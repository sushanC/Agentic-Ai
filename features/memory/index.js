/**
 * features/memory/index.js
 *
 * Public entry point for the Cognitive Memory System.
 * Re-exports MemoryManager as the central entry point, while preserving
 * all legacy memory exports for 100% backward compatibility.
 */

// Central Orchestrator & Subsystem Exports
export { MemoryManager, memoryManager } from "./MemoryManager.js";
export { MemoryRegistry, memoryRegistry } from "./registry/MemoryRegistry.js";
export { MemoryObject } from "./model/MemoryObject.js";
export { RelationshipGraph, relationshipGraph } from "./graph/RelationshipGraph.js";
export { MEMORY_CONFIG } from "./config/MemoryConfig.js";
export { MemoryDiagnostics, memoryDiagnostics } from "./diagnostics/MemoryDiagnostics.js";

// Legacy Compatibility Exports
export { default as memoryRoutes } from "./memoryRoutes.js";
export { loadMemory, saveMemory, deleteMemoryKey } from "./memoryStorage.js";
export { normalizeMemory } from "./memoryNormalizer.js";
export {
  getRelevantMemories,
  consolidateMemory,
  addRelationship,
  getRelatedNodes,
  getRelationshipGraphDump
} from "./advancedMemoryEngine.js";
export {
  mergeMemory,
  updateMemory,
  handleMemory,
  getMemoryFacts
} from "./memoryService.js";
export * as memoryService from "./memoryService.js";
export * as memoryController from "./memoryController.js";
