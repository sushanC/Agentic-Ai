import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

import {
  askOllama
} from "./ollamaService.js";

import {
  loadAIMode
} from "../storage/aiModeStorage.js";

import {
  loadMemory
} from "../storage/memoryStorage.js";

import {
  getRecentHistory
} from "./historyService.js";

const ai = new GoogleGenAI({
  apiKey: process.env.API_KEY
});

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1"
});

const openrouter = new OpenAI({
  apiKey:
    process.env.OPENROUTER_API_KEY,

  baseURL:
    "https://openrouter.ai/api/v1"
});

export async function askGemini(
  prompt
) {

  const response =
    await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

  return response.text;
}

export async function askGroq(
  prompt
) {

  const completion =
    await groq.chat.completions.create({
      model:
        "llama-3.3-70b-versatile",

      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

  return completion
    .choices[0]
    .message
    .content;
}

export async function askOpenRouter(
  prompt
) {

  const completion =
    await openrouter.chat.completions.create({
      model:
        "meta-llama/llama-3.3-70b-instruct",

      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

  return completion
    .choices[0]
    .message
    .content;
}

export async function askAI(
  prompt
) {

  const memory =
  await loadMemory();

  const history =
  await getRecentHistory(
    10
  );

const memoryPrompt =
`
User Profile:

${JSON.stringify(
  memory,
  null,
  2
)}

Recent Conversation:

${history
  .map(
    msg =>
      `${msg.role}: ${msg.content}`
  )
  .join("\n")
}

Current User Message:

${prompt}
`;
  const mode =
    await loadAIMode();

  if (
    mode.provider ===
    "ollama"
  ) {

    console.log(
      "🟢 Using Ollama..."
    );

    return await askOllama(
      prompt
    );
  }

  try {

    console.log(
      "🟢 Using Groq..."
    );

    return await askGroq(
      memoryPrompt
    );

  } catch (err) {

    console.log(
      "🔴 Groq failed."
    );

    console.error(
      err.message
    );
  }

  try {

    console.log(
      "🟡 Using Gemini..."
    );

    return await askGemini(
      memoryPrompt
    );

  } catch (err) {

    console.log(
      "🔴 Gemini failed."
    );

    console.error(
      err.message
    );
  }

  try {

    console.log(
      "🔵 Using OpenRouter..."
    );

    return await askOpenRouter(
      memoryPrompt
    );

  } catch (err) {

    console.log(
      "🔴 OpenRouter failed."
    );

    console.error(
      err.message
    );
  }

  throw new Error(
    "All AI providers failed."
  );
}
export async function extractMemory(
  userMessage
) {

  const prompt = `
Extract personal facts.

Use clear keys.

Examples:

"My favorite programming language is Java"

{
  "programming_language": "Java"
}

"My preferred spoken language is Kannada"

{
  "spoken_language": "Kannada"
}

"My favorite color is Green"

{
  "favorite_color": "Green"
}

Return JSON only.

Message:
${userMessage}
`;

  const response =
    await askAI(prompt);

  try {

    return JSON.parse(
      response
    );

  } catch {

    return {};
  }
}