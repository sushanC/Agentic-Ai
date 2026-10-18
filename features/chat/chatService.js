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
import { ErrorNormalizer } from "../../core/errors/ErrorNormalizer.js";

export function createChatService(dependencies = {}) {
  const storeMessage = dependencies.addMessage || addMessage;
  const updateUserMemory = dependencies.updateMemory || updateMemory;
  const route = dependencies.routeRequest || routeRequest;
  const refreshSummary = dependencies.updateSummary || updateSummary;
  const countMessage = dependencies.incrementStat || incrementStat;
  const readHistory = dependencies.loadHistory || loadHistory;
  const logError = dependencies.logError || logSafeError;
  const normalizeError = dependencies.normalizeError || ErrorNormalizer.normalize;

  return {
    async handleStandardChat(message, options = {}) {
      await storeMessage("user", message);
      await updateUserMemory(message);

      let reply;
      try {
        const result = await route(message, "chat", options);
        if (result?.success === false) {
          reply = result.userMessage || result.error?.userMessage || (typeof result.answer === "string" ? result.answer : null)
            || normalizeError(result.error || "CAPABILITY_FAILED", { requestId: options.requestContext?.requestId }).userMessage;
        } else {
          reply = result?.answer || result?.userMessage || result?.response;
        }
      } catch (err) {
        logError("[chatService] Request execution failed", err);
        reply = normalizeError(err, { requestId: options.requestContext?.requestId }).userMessage;
      }

      if (!reply || typeof reply !== "string" || reply.trim() === "") {
        reply = "Sorry for the inconvenience. I wasn't able to complete that request. Please try again.";
      }

      await storeMessage("assistant", reply);
      await refreshSummary();
      await countMessage("messages");

      return { reply };
    },
    async loadChatHistory() {
      return readHistory();
    },
  };
}

const defaultChatService = createChatService();
export const handleStandardChat = (...args) => defaultChatService.handleStandardChat(...args);
export const loadChatHistory = (...args) => defaultChatService.loadChatHistory(...args);
