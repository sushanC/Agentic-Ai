import {
  loadHistory,
  saveHistory
} from "./chatStorage.js";

export function createConversationService(storage = { loadHistory, saveHistory }) {
  return {
    async addMessage(role, content) {
      const history = await storage.loadHistory();
      history.push({ role, content, timestamp: Date.now() });
      await storage.saveHistory(history);
    },
    async getRecentHistory(limit = 20) {
      const history = await storage.loadHistory();
      return history.slice(-limit);
    },
  };
}

const defaultConversationService = createConversationService();
export const addMessage = (...args) => defaultConversationService.addMessage(...args);
export const getRecentHistory = (...args) => defaultConversationService.getRecentHistory(...args);
