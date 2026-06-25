import ollama from "ollama";

import {
  SYSTEM_PROMPT
} from "./systemPrompt.js";

export async function askOllama(
  prompt
) {

  const response =
    await ollama.chat({

      model:
        "qwen3:8b",

      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

  return response
    .message
    .content;
}