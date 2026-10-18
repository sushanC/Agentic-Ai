import { handleStandardChat as defaultHandleStandardChat, loadChatHistory as defaultLoadChatHistory } from "./chatService.js";
import { handleStreamChatService as defaultHandleStreamChatService } from "./streamService.js";
import { logSafeError } from "../../services/httpSecurity.js";

export function createChatController(dependencies = {}) {
  const handleStandardChat = dependencies.handleStandardChat || ((...args) => defaultHandleStandardChat(...args));
  const handleStreamChatService = dependencies.handleStreamChatService || ((...args) => defaultHandleStreamChatService(...args));
  const loadChatHistory = dependencies.loadChatHistory || ((...args) => defaultLoadChatHistory(...args));
  const logError = dependencies.logError || ((...args) => logSafeError(...args));
  return {
    async postChat(req, res) {
      const message = req.body?.message;
      if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "message is required" });
      }
      try {
        const result = await handleStandardChat(message, { requestContext: req.requestContext });
        res.json(result);
      } catch (err) {
        logError("Chat request failed", err);
        res.status(500).json({ error: "AI request failed" });
      }
    },

    async postStreamChat(req, res) {
      const message = req.body?.message;
      if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "message is required" });
      }
      try {
        await handleStreamChatService(message, res, { requestContext: req.requestContext });
      } catch (err) {
        logError("Streaming chat request failed", err);
        if (!res.headersSent) return res.status(500).end();
        return res.end();
      }
    },

    async getHistory(_req, res) {
      try {
        res.json(await loadChatHistory());
      } catch (err) {
        logError("Chat history request failed", err);
        res.status(500).json({ error: "Failed to load history" });
      }
    },
  };
}

const defaultController = createChatController();
export const postChat = (...args) => defaultController.postChat(...args);
export const postStreamChat = (...args) => defaultController.postStreamChat(...args);
export const getHistory = (...args) => defaultController.getHistory(...args);
