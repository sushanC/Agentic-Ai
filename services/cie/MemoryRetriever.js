import { loadMemory } from "../../features/memory/index.js";
import { getEmbedding, cosineSimilarity } from "../embeddingService.js";
import { getContextConfig } from "./ContextManager.js";

// Cache to store memory key-value embeddings
const memoryEmbeddingsCache = new Map();
let lastMemoryState = null;

// Helper to flatten nested objects into path-based keys
function flattenObject(obj, prefix = '') {
  let result = {};
  if (!obj || typeof obj !== 'object') return result;
  
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(result, flattenObject(val, fullKey));
    } else {
      result[fullKey] = val;
    }
  }
  return result;
}

export async function retrieveRelevantMemory(prompt, intent, settings = {}) {
  const allMemory = await loadMemory();
  const config = getContextConfig(intent);

  if (!config.includeMemory) {
    return {};
  }

  // Flatten the memory to support nested keys like contacts.professor
  const flatMemory = flattenObject(allMemory);
  const keys = Object.keys(flatMemory);

  if (keys.length === 0) {
    return {};
  }

  const selectedKeys = new Set();
  const scoresMap = {};

  // 1. Semantic retrieval (always used for memory intent or as requested)
  const useSemantic = settings.enableSemanticMemoryRetrieval ?? true;

  if (useSemantic) {
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
        const val = flatMemory[key];
        const valStr = typeof val === "object" ? JSON.stringify(val) : String(val);
        const textToEmbed = `${key}: ${valStr}`;

        let keyEmbedding = memoryEmbeddingsCache.get(textToEmbed);
        if (!keyEmbedding) {
          keyEmbedding = await getEmbedding(textToEmbed);
          memoryEmbeddingsCache.set(textToEmbed, keyEmbedding);
        }

        let similarity = cosineSimilarity(promptEmbedding, keyEmbedding);

        // Apply identity boost for email/communication tasks
        const isEmailIntent = intent === "Email" || intent === "EmailDraft" || intent === "EmailExtraction" || /email|professor|mail|send/i.test(prompt);
        if ((key === "user_name" || key === "name") && isEmailIntent) {
          similarity = Math.max(similarity + 0.25, 0.45); // Boost to ensure it passes threshold
        }

        scoredKeys.push({ key, similarity, value: val });
      }

      // Sort by similarity descending
      scoredKeys.sort((a, b) => b.similarity - a.similarity);

      // Filter by threshold
      const threshold = 0.43; // Standard threshold for semantic matching
      const maxKeys = settings.maxMemoryKeys ?? 10;

      scoredKeys
        .filter(item => item.similarity >= threshold)
        .slice(0, maxKeys)
        .forEach(item => {
          selectedKeys.add(item.key);
          scoresMap[item.key] = item.similarity;
        });

    } catch (err) {
      console.warn("⚠️ Semantic memory retrieval failed, falling back to basic matching:", err.message);
      // Fallback: if semantic fails, include basic keys
      if (flatMemory.name) {
        selectedKeys.add("name");
        scoresMap["name"] = 1.0;
      }
      if (flatMemory.user_name) {
        selectedKeys.add("user_name");
        scoresMap["user_name"] = 1.0;
      }
    }
  }

  // If no keys selected but it's general chat/greeting, at least include name if available
  if (selectedKeys.size === 0 && (intent === "GeneralChat" || intent === "Greeting")) {
    if (flatMemory.name) {
      selectedKeys.add("name");
      scoresMap["name"] = 0.5;
    } else if (flatMemory.user_name) {
      selectedKeys.add("user_name");
      scoresMap["user_name"] = 0.5;
    }
  }

  // Build the filtered memory object
  const filteredMemory = {};
  selectedKeys.forEach(k => {
    filteredMemory[k] = flatMemory[k];
  });

  // Attach scores as a non-enumerable property so they don't pollute the prompt
  Object.defineProperty(filteredMemory, "_scores", {
    value: scoresMap,
    enumerable: false,
    configurable: true,
    writable: true
  });

  return filteredMemory;
}
