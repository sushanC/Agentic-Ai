import {
  loadHistory,
  saveHistory,
  updateHistory
} from "./chatStorage.js";

export function createConversationService(storage = { loadHistory, saveHistory, updateHistory }) {
  return {
    async addMessage(role, content) {
      if (storage.updateHistory) {
        return storage.updateHistory(history => [...history, { role, content, timestamp: Date.now() }]);
      }
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
