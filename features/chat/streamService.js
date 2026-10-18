import { addMessage } from "./conversationService.js";
import { updateMemory } from "../memory/index.js";
import { agentRuntime } from "../../core/agent/AgentRuntime.js";
import { updateSummary } from "../../services/summaryService.js";
import { incrementStat } from "../../storage/statsStorage.js";
import { ErrorNormalizer } from "../../core/errors/ErrorNormalizer.js";
import { getLastModelUsed } from "../../services/ai.js";

const SAFE_STREAM_ERROR = "Sorry for the inconvenience. I wasn't able to complete that request. Please try again.";

function modelTimeline(model, status = "running") {
  const modelInfo = model || {};
  return {
    model: modelInfo.name || modelInfo.modelId || "unknown",
    modelName: modelInfo.displayName || modelInfo.name || "Assistant",
    provider: modelInfo.provider || "unknown",
    steps: [{ name: modelInfo.displayName || modelInfo.name || "Assistant", status, isModel: true }],
  };
}

function writeTimeline(res, payload) {
  res.write(`__TIMELINE__:${JSON.stringify(payload)}\n`);
}

export function createStreamChatService(dependencies = {}) {
  const storeMessage = dependencies.addMessage || ((...args) => addMessage(...args));
  const updateUserMemory = dependencies.updateMemory || ((...args) => updateMemory(...args));
  const runtime = dependencies.agentRuntime;
  const refreshSummary = dependencies.updateSummary || ((...args) => updateSummary(...args));
  const countMessage = dependencies.incrementStat || ((...args) => incrementStat(...args));
  const normalizeError = dependencies.normalizeError || ((...args) => ErrorNormalizer.normalize(...args));
  const lastModelUsed = dependencies.getLastModelUsed;

  return async function handleStreamChatService(message, res, options = {}) {
  await updateUserMemory(message);
  const controller = new AbortController();
  let disconnected = false;
  let userMessageStored = false;
  const onClose = () => {
    if (!res.writableEnded) {
      disconnected = true;
      controller.abort();
    }
  };
  res.once?.("close", onClose);

  try {
    let execution;
    try {
      execution = await (runtime || agentRuntime).runStream(message, "chat", {
        ...options,
        signal: controller.signal,
        beforeContext: async () => {
          await storeMessage("user", message);
          userMessageStored = true;
        },
      });
    } catch (err) {
      if (disconnected || controller.signal.aborted || res.destroyed) return res.end();
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Transfer-Encoding", "chunked");
      const normalized = normalizeError(err, { requestId: options.requestContext?.requestId });
      res.write(normalized.userMessage || SAFE_STREAM_ERROR);
      if (!userMessageStored) await storeMessage("user", message);
      await storeMessage("assistant", normalized.userMessage || SAFE_STREAM_ERROR);
      await refreshSummary();
      await countMessage("messages");
      return res.end();
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    if (execution.type === "result") {
      const result = execution.result || {};
      const model = result.modelUsed || result.metadata?.model || (lastModelUsed || getLastModelUsed)();
      const timeline = modelTimeline(model, "completed");

      if (result.tool === "confirmation" || result.answer?.status === "confirmation_required") {
        timeline.steps = [...(result.executedSteps || []), { name: "confirmation", status: "completed" }];
        writeTimeline(res, timeline);
        res.write(`__CONFIRMATION__:${JSON.stringify(result.answer)}`);
        return res.end();
      }
      if (result.tool === "waiting_input" || result.answer?.status === "waiting_input") {
        timeline.steps = [...(result.executedSteps || []), { name: "waiting_input", status: "completed" }];
        writeTimeline(res, timeline);
        res.write(`__WAITING_INPUT__:${JSON.stringify(result.answer)}`);
        return res.end();
      }

      if (result.success === false) {
        const normalized = normalizeError(result.error || result.metadata || "CAPABILITY_FAILED", {
          capability: result.capability,
          tool: result.tool,
          requestId: options.requestContext?.requestId,
        });
        timeline.steps = [...(result.executedSteps || []), { name: result.tool || "request", status: "failed" }];
        writeTimeline(res, timeline);
        res.write(normalized.userMessage || SAFE_STREAM_ERROR);
        return res.end();
      }

      const answer = typeof result.answer === "string" ? result.answer : JSON.stringify(result.answer ?? "");
      await storeMessage("user", message);
      await storeMessage("assistant", answer);
      await refreshSummary();
      await countMessage("messages");
      writeTimeline(res, timeline);
      return res.end();
    }

    const { stream, modelUsed } = execution;
    let fullResponse = "";
    writeTimeline(res, modelTimeline(modelUsed));
    try {
      for await (const chunk of stream) {
        if (disconnected || controller.signal.aborted || res.destroyed) break;
        if (!chunk) continue;
        fullResponse += chunk;
        res.write(chunk);
      }
    } catch (err) {
      if (!disconnected && !controller.signal.aborted && !res.destroyed) {
        const normalized = normalizeError(err, { requestId: options.requestContext?.requestId });
        const safe = fullResponse ? "\n\nSorry for the interruption. I wasn't able to finish generating that response. Please try again." : normalized.userMessage || SAFE_STREAM_ERROR;
        fullResponse += safe;
        res.write(safe);
      }
    }

    if (!disconnected && !controller.signal.aborted) {
      await storeMessage("assistant", fullResponse);
      await refreshSummary();
      await countMessage("messages");
    }
    return res.end();
  } finally {
    res.removeListener?.("close", onClose);
  }
  };
}

const defaultStreamChatService = createStreamChatService();
export const handleStreamChatService = (...args) => defaultStreamChatService(...args);
