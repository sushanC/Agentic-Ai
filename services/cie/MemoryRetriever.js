import { memoryManager } from "../../features/memory/index.js";
import { getContextConfig } from "./ContextManager.js";

/**
 * MemoryRetriever.js — Context Intelligence Engine Adapter
 *
 * Delegates memory retrieval to MemoryManager, which searches all enabled
 * specialized memory stores (semantic, working, project, episodic, reflection).
 */
export async function retrieveRelevantMemory(prompt, intent, settings = {}) {
  const config = getContextConfig(intent);

  if (!config.includeMemory) {
    return {};
  }

  const maxKeys = settings.maxMemoryKeys ?? 10;
  const memoryPayload = await memoryManager.retrieve(prompt, { topK: maxKeys, intent });

  // If payload is empty and it's a general greeting, ensure basic identity properties exist if stored
  if (Object.keys(memoryPayload).length === 0 && (intent === "GeneralChat" || intent === "Greeting")) {
    const profile = await memoryManager.getLegacyProfile();
    if (profile.name) {
      memoryPayload.name = profile.name;
    } else if (profile.user_name) {
      memoryPayload.user_name = profile.user_name;
    }
  }

  return memoryPayload;
}
