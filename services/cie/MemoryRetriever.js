import { loadMemory } from "../../storage/memoryStorage.js";
import { getEmbedding, cosineSimilarity } from "../embeddingService.js";
import { getContextConfig } from "./ContextManager.js";

// Cache to store memory key-value embeddings
const memoryEmbeddingsCache = new Map();
let lastMemoryState = null;

export async function retrieveRelevantMemory(prompt, intent, settings = {}) {
  const allMemory = await loadMemory();
  const config = getContextConfig(intent);

  if (!config.includeMemory) {
    return {};
  }

  const selectedKeys = new Set();

  // 1. Static keys from intent config
  if (config.memoryKeys) {
    config.memoryKeys.forEach(k => {
      if (allMemory[k] !== undefined) {
        selectedKeys.add(k);
      }
    });
  }

  // 2. Semantic retrieval (if enabled and applicable)
  const useSemantic = settings.enableSemanticMemoryRetrieval ?? true;
  const isMemoryIntent = intent === "Memory" || config.semanticMemoryOnly;

  if (useSemantic && (isMemoryIntent || !config.memoryKeys)) {
    const keys = Object.keys(allMemory);
    if (keys.length > 0) {
      try {
        const promptEmbedding = await getEmbedding(prompt);
        
        // Detect if memory has changed to invalidate cache
        const currentMemoryStr = JSON.stringify(allMemory);
        if (currentMemoryStr !== lastMemoryState) {
          memoryEmbeddingsCache.clear();
          lastMemoryState = currentMemoryStr;
        }

        const scoredKeys = [];

        for (const key of keys) {
          const val = allMemory[key];
          const valStr = typeof val === "object" ? JSON.stringify(val) : String(val);
          const textToEmbed = `${key}: ${valStr}`;

          let keyEmbedding = memoryEmbeddingsCache.get(textToEmbed);
          if (!keyEmbedding) {
            keyEmbedding = await getEmbedding(textToEmbed);
            memoryEmbeddingsCache.set(textToEmbed, keyEmbedding);
          }

          const similarity = cosineSimilarity(promptEmbedding, keyEmbedding);
          scoredKeys.push({ key, similarity });
        }

        // Sort by similarity descending
        scoredKeys.sort((a, b) => b.similarity - a.similarity);

        // Filter by threshold and limit
        const threshold = 0.25; // Good balance for Xenova/all-MiniLM-L6-v2
        const maxKeys = settings.maxMemoryKeys ?? 10;

        scoredKeys
          .filter(item => item.similarity >= threshold)
          .slice(0, maxKeys)
          .forEach(item => selectedKeys.add(item.key));

      } catch (err) {
        console.warn("⚠️ Semantic memory retrieval failed, falling back to all memory:", err.message);
        // Fallback: if semantic fails, we can add a few basic keys
        if (allMemory.name) selectedKeys.add("name");
      }
    }
  }

  // If no keys selected but it's general chat, at least include user name if available
  if (selectedKeys.size === 0 && allMemory.name && intent === "GeneralChat") {
    selectedKeys.add("name");
  }

  // Build the filtered memory object
  const filteredMemory = {};
  selectedKeys.forEach(k => {
    filteredMemory[k] = allMemory[k];
  });

  return filteredMemory;
}
