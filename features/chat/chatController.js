import {
  handleStandardChat,
  loadChatHistory
} from "./chatService.js";

import {
  handleStreamChatService
} from "./streamService.js";

export async function postChat(req, res) {
  try {
    const { message } = req.body;
    const result = await handleStandardChat(message);
    res.json(result);
  } catch (err) {
    console.error(err);
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
    console.error(err);
    res.status(500).end();
  }
}

export async function getHistory(req, res) {
  try {
    const history = await loadChatHistory();
    res.json(history);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to load history"
    });
  }
}
