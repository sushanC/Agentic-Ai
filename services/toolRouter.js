import { askAI } from "./ai.js";

export async function routeRequest(
  message
) {

  const text =
    message.toLowerCase();

  // Notes

  if (
    text.includes("remember")
  ) {

    return {
      tool: "notes",
      response:
        "Memory tool will be called."
    };
  }

  // Tasks

  if (
    text.includes("add task")
  ) {

    return {
      tool: "tasks",
      response:
        "Task tool will be called."
    };
  }

  // PDFs

  if (
    text.includes("deadlock") ||
    text.includes("banker")
  ) {

    return {
      tool: "pdf",
      response:
        "PDF tool will be called."
    };
  }

  // Normal Chat

  const answer =
    await askAI(
      message
    );

  return {
    tool: "chat",
    response:
      answer
  };
}