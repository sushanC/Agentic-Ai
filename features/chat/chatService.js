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

export async function handleStandardChat(
  message
) {

  await addMessage("user", message);
  await updateMemory(message);

  const result = await routeRequest(message);
  const reply = result.answer;

  await addMessage("assistant", reply);
  await updateSummary();
  await incrementStat("messages");

  return { reply };
}

export async function loadChatHistory() {
  return await loadHistory();
}
