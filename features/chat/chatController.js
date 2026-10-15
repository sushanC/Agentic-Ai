import {
  handleStandardChat,
  loadChatHistory
} from "./chatService.js";

import {
  handleStreamChatService
} from "./streamService.js";
import { logSafeError } from "../../services/httpSecurity.js";

export async function postChat(req, res) {
  try {
    const { message } = req.body;
    const result = await handleStandardChat(message);
    res.json(result);
  } catch (err) {
    logSafeError("Chat request failed", err);
    res.status(500).json({
      error: "AI request failed"
    });
  }
}

export async function postStreamChat(req, res) {
  try {
    const { message } = req.body;
    await handleStreamChatService(message, res);
  } catch (err) {
    logSafeError("Streaming chat request failed", err);
    res.status(500).end();
  }
}

export async function getHistory(req, res) {
  try {
    const history = await loadChatHistory();
    res.json(history);
  } catch (err) {
    logSafeError("Chat history request failed", err);
    res.status(500).json({
      error: "Failed to load history"
    });
  }
}
