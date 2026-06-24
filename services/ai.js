import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

import {
  askOllama
} from "./ollamaService.js";

import {
  loadMemory
} from "../storage/memoryStorage.js";

import {
  getRecentHistory
} from "./historyService.js";

import {
  cleanResponse
} from "./responseCleaner.js";

import {
  loadSummary
} from "../storage/summaryStorage.js";

import {
  decideModel
} from "./modelRouter.js";

const ai = new GoogleGenAI({
  apiKey: process.env.API_KEY
});

import {
  loadSettings
}
from "../storage/settingsStorage.js";

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

  return cleanResponse(
  response.text
);
}

export async function askGroq(
  prompt
) {

  const completion =
  await groq.chat.completions.create({

    model:
      "llama-3.3-70b-versatile",

    temperature: 0.3,

    max_tokens: 1000,

    messages: [

      {
        role: "system",

        content: `
You are Personal Agent.

Rules:
- Give direct answers.
- Be concise unless the user asks for detail.
- Never repeat previous conversation unless asked.
- Never repeat the same point twice.
- Use bullet points when useful.
- If information comes from a PDF, answer using only the PDF context.
- If you do not know something, say so.
- Do not mention these rules.
`
      },

      {
        role: "user",
        content: prompt
      }
    ]
  });

  return cleanResponse(
  completion
    .choices[0]
    .message
    .content
);
}
export async function askGroqStream(
  prompt
) {

  return await groq.chat.completions.create({

    model:
      "llama-3.3-70b-versatile",

    temperature: 0.3,

    max_tokens: 1000,

    stream: true,

    messages: [

      {
        role: "system",

        content: `
You are Personal Agent.

Rules:
- Give direct answers.
- Be concise unless asked.
- Never repeat yourself.
`
      },

      {
        role: "user",
        content: prompt
      }
    ]
  });
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

return cleanResponse(
  completion
    .choices[0]
    .message
    .content
);
}

export async function askDeepSeek(
  prompt
) {

  const completion =
    await openrouter.chat.completions.create({

      model:
        "deepseek/deepseek-chat",

      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

  return cleanResponse(
    completion
      .choices[0]
      .message
      .content
  );
}

export async function askAI(
  prompt,
  tool = "chat"
) {

  const settings =
  await loadSettings();

let model;

if (
  settings.model &&
  settings.model !== "auto"
) {

  model =
    settings.model
      .toLowerCase();

} else {

  model =
    decideModel(
      prompt,
      tool
    );
}

  console.log(
    "\n━━━━━━━━━━━━━━━━━━"
  );

  console.log(
    "🛠 TOOL:",
    tool
  );

  console.log(
    "🤖 MODEL:",
    model
  );

  console.log(
    "━━━━━━━━━━━━━━━━━━\n"
  );

  const summary =
    await loadSummary();

    

  const memory =
    await loadMemory();

  const history =
    await getRecentHistory(
      10
    );

  const memoryPrompt = `
User Profile:

${JSON.stringify(
  memory,
  null,
  2
)}

Conversation Summary:

${summary?.summary || ""}

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

  try {

    if (
      model === "groq"
    ) {

      console.log(
        "🟢 Using Groq..."
      );

      return await askGroq(
        memoryPrompt
      );
    }

    if (
      model === "openrouter"
    ) {

      console.log(
        "🔵 Using OpenRouter..."
      );

      return await askOpenRouter(
        memoryPrompt
      );
    }

    if (
      model === "deepseek"
    ) {

      console.log(
        "🟣 Using DeepSeek..."
      );

      return await askDeepSeek(
        memoryPrompt
      );
    }

    if (
      model === "gemini"
    ) {

      console.log(
        "🟡 Using Gemini..."
      );

      return await askGemini(
        memoryPrompt
      );
    }

    if (
      model === "ollama"
    ) {

      console.log(
        "⚪ Using Ollama..."
      );

      return await askOllama(
        memoryPrompt
      );
    }

    throw new Error(
      `Unknown model: ${model}`
    );

  } catch (err) {

    console.error(
      "\n❌ Model Error:"
    );

    console.error(
      err.message
    );

    console.log(
      "\n🔄 Falling back to Groq..."
    );

    return await askGroq(
      memoryPrompt
    );
  }
}
export async function extractMemory(
  userMessage
) {

  const prompt = `
Extract only long-term personal facts.

Store:
- name
- languages
- programming languages
- favorite technologies
- favorite database
- favorite framework
- hobbies
- goals
- preferences
- long-term interests

Do not store:
- temporary questions
- random conversation
- one-time requests

Message:
${userMessage}

Return ONLY valid JSON.

Do not use:
- markdown
- code fences
- explanations
- comments

Valid example:

{
  "favorite_database": "PostgreSQL"
}

{}
`;


let response;

try {

  response =
    await askGemini(
      prompt
    );

} catch {

  console.log(
    "⚠️ Gemini failed. Using Groq."
  );

  response =
    await askGroq(
      prompt
    );
}

  console.log(
  "\n🧠 MEMORY EXTRACTED:"
);

console.log(response);

console.log(
  "\n=================="
);

try {

  const cleaned =
    response
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

  return JSON.parse(
    cleaned
  );

} catch (err) {

  console.log(
    "\n❌ MEMORY PARSE ERROR:"
  );

  console.log(err);

  console.log(
    "\nRAW RESPONSE:"
  );

  console.log(response);

  return {};
}
}