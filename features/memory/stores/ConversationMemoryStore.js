import { BaseMemoryStore } from "./BaseMemoryStore.js";
import { MemoryObject } from "../model/MemoryObject.js";
import { MEMORY_CONFIG } from "../config/MemoryConfig.js";
import { loadHistory, saveHistory } from "../../../storage/historyStorage.js";
import { loadSummary, saveSummary } from "../../../storage/summaryStorage.js";

/**
 * ConversationMemoryStore.js
 *
 * Conversation memory store for history, context windows, and rolling summaries.
 */
export class ConversationMemoryStore extends BaseMemoryStore {
  constructor() {
    super("conversation", MEMORY_CONFIG.STORE_PRIORITIES.conversation);
  }

  async store(message) {
    const history = await loadHistory();
    history.push(message);
    await saveHistory(history);

    return MemoryObject.create({
      type: "conversation",
      category: "history",
      content: message,
      importance: 0.4,
    });
  }

  async retrieve(query, options = {}) {
    const history = await loadHistory();
    const summaryData = await loadSummary();
    const summary = summaryData?.summary || (typeof summaryData === "string" ? summaryData : "");
    const results = [];

    if (summary) {
      results.push(
        MemoryObject.create({
          id: "summary_latest",
          type: "conversation",
          category: "summary",
          content: { summary },
          importance: 0.8,
        })
      );
    }

    const limit = options.limit || MEMORY_CONFIG.LIMITS.conversationContextWindow;
    const recent = history.slice(-limit);

    for (let i = 0; i < recent.length; i++) {
      results.push(
        MemoryObject.create({
          id: `conv_${i}`,
          type: "conversation",
          category: "message",
          content: recent[i],
          importance: 0.4 + (i / recent.length) * 0.3,
        })
      );
    }

    return results;
  }

  async updateSummary(summaryText) {
    await saveSummary(summaryText);
  }

  async getSummary() {
    const data = await loadSummary();
    return data?.summary || (typeof data === "string" ? data : "");
  }

  async delete(id) {
    return true;
  }

  async search(filterFn) {
    const all = await this.retrieve();
    return all.filter(filterFn);
  }

  async clear() {
    await saveHistory([]);
    await saveSummary("");
  }

  async getAll() {
    return await this.retrieve();
  }
}
