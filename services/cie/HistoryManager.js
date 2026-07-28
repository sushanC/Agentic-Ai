import { getRecentHistory } from "../../features/chat/index.js";
import { getContextConfig } from "./ContextManager.js";

export async function getDynamicHistory(intent, settings = {}) {
  const config = getContextConfig(intent);
  let limit = config.historyLimit;

  // Apply settings override if present
  if (settings.maxHistory !== undefined) {
    limit = Math.min(limit, settings.maxHistory);
  }

  if (limit <= 0) {
    return [];
  }

  return await getRecentHistory(limit);
}
