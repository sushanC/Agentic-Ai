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
  askGroqStream,
  getLastModelUsed
} from "../../services/ai.js";

import {
  updateSummary
} from "../../services/summaryService.js";

import {
  incrementStat
} from "../../storage/statsStorage.js";

export async function handleStreamChatService(message, res) {
  // Run memory extraction ONCE
  await updateMemory(message);

  const result = await routeRequest(message);

  // Tool-based results (agent, web, pdf, task, note, memory)
  // — return immediately without streaming
  if (result.tool !== "chat") {
    const modelInfo = getLastModelUsed();
    const timelinePayload = {
      model: modelInfo.name,
      modelName: modelInfo.displayName,
      provider: modelInfo.provider,
      steps: [
        ...(result.executedSteps || []),
        { name: modelInfo.displayName, status: "completed", isModel: true }
      ]
    };

    if (result.tool === "confirmation") {
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Transfer-Encoding", "chunked");

      timelinePayload.steps = [
        ...(result.executedSteps || []),
        { name: "confirmation", status: "completed" }
      ];
      res.write(`__TIMELINE__:${JSON.stringify(timelinePayload)}\n`);
      res.write("__CONFIRMATION__:" + JSON.stringify(result.answer));
      return res.end();
    }

    if (result.tool === "waiting_input") {
      const waitingPayload =
        result.answer && typeof result.answer === "object"
          ? result.answer
          : { status: "waiting_input", error: "invalid payload" };

      console.log("\n📧 Streaming __WAITING_INPUT__:");
      console.log(JSON.stringify(waitingPayload, null, 2));

      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Transfer-Encoding", "chunked");

      timelinePayload.steps = [
        ...(result.executedSteps || []),
        { name: "waiting_input", status: "completed" }
      ];
      res.write(`__TIMELINE__:${JSON.stringify(timelinePayload)}\n`);
      res.write("__WAITING_INPUT__:" + JSON.stringify(waitingPayload));
      return res.end();
    }

    await addMessage("user", message);
    await addMessage("assistant", result.answer);
    await incrementStat("messages");

    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Transfer-Encoding", "chunked");
    res.write(`__TIMELINE__:${JSON.stringify(timelinePayload)}\n`);
    return res.end();
  }

  // Normal chat — stream via Groq
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Transfer-Encoding", "chunked");

  await addMessage("user", message);

  console.log("\n💬 USER:");
  console.log(message);

  const stream = await askGroqStream(message);

  const modelInfo = getLastModelUsed();
  const timelinePayload = {
    model: modelInfo.name,
    modelName: modelInfo.displayName,
    provider: modelInfo.provider,
    steps: [
      { name: modelInfo.displayName, status: "running", isModel: true }
    ]
  };
  res.write(`__TIMELINE__:${JSON.stringify(timelinePayload)}\n`);

  let fullResponse = "";

  for await (const chunk of stream) {
    const content = chunk.choices?.[0]?.delta?.content;

    if (content) {
      fullResponse += content;
      res.write(content);
    }
  }

  await addMessage("assistant", fullResponse);
  await updateSummary();
  await incrementStat("messages");

  res.end();
}
