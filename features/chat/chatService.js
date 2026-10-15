import {
  loadHistory
} from "./chatStorage.js";

import {
  addMessage
} from "./conversationService.js";

import {
  updateMemory
} from "../memory/index.js";

import {
  routeRequest
} from "../../services/toolRouter.js";

import {
  updateSummary
} from "../../services/summaryService.js";

import {
  incrementStat
} from "../../storage/statsStorage.js";
import { logSafeError } from "../../services/httpSecurity.js";

export async function handleStandardChat(
  message
) {

  await addMessage("user", message);
  await updateMemory(message);

  let reply;
  try {
    const result = await routeRequest(message);
    reply = result.answer || result.userMessage || result.response;
  } catch (err) {
    logSafeError("[chatService] Request execution failed", err);
  }

  if (!reply || typeof reply !== "string" || reply.trim() === "") {
    reply = "Sorry for the inconvenience. I wasn't able to complete that request. Please try again.";
  }

  await addMessage("assistant", reply);
  await updateSummary();
  await incrementStat("messages");

  return { reply };
}

export async function loadChatHistory() {
  return await loadHistory();
}
