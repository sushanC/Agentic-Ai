import { googleProvider } from "./providers/googleProvider.js";
import { groqProvider } from "./providers/groqProvider.js";
import { deepseekProvider } from "./providers/deepseekProvider.js";
import { glmProvider } from "./providers/glmProvider.js";
import { openRouterProvider } from "./providers/openRouterProvider.js";
import { ollamaProvider } from "./providers/ollamaProvider.js";

import { resolveModel } from "./modelRegistry.js";
import { SYSTEM_PROMPT } from "./systemPrompt.js";
import { loadMemory } from "../storage/memoryStorage.js";
import { getRecentHistory } from "./historyService.js";
import { cleanResponse } from "./responseCleaner.js";
import { loadSummary } from "../storage/summaryStorage.js";
import { decideModel } from "./modelRouter.js";
import { loadSettings } from "../storage/settingsStorage.js";

const providers = {
  google: googleProvider,
  groq: groqProvider,
  deepseek: deepseekProvider,
  glm: glmProvider,
  openrouter: openRouterProvider,
  ollama: ollamaProvider
};

export async function askGemini(prompt) {
  const modelConfig = resolveModel("gemini");
  const provider = providers[modelConfig.provider];
  const response = await provider.generate(modelConfig.modelId, prompt, { systemPrompt: SYSTEM_PROMPT });
  return cleanResponse(response);
}

export async function askGroq(prompt) {
  const modelConfig = resolveModel("groq");
  const provider = providers[modelConfig.provider];
  const response = await provider.generate(modelConfig.modelId, prompt, { systemPrompt: SYSTEM_PROMPT });
  return cleanResponse(response);
}

export async function askOpenRouter(prompt) {
  const modelConfig = resolveModel("openrouter");
  const provider = providers[modelConfig.provider];
  const response = await provider.generate(modelConfig.modelId, prompt, { systemPrompt: SYSTEM_PROMPT });
  return cleanResponse(response);
}

export async function askDeepSeek(prompt) {
  const modelConfig = resolveModel("deepseek");
  const provider = providers[modelConfig.provider];
  const response = await provider.generate(modelConfig.modelId, prompt, { systemPrompt: SYSTEM_PROMPT });
  return cleanResponse(response);
}

/**
 * Streams chat completions from the currently active model.
 * Wraps the text stream in an OpenAI-compatible async iterable to prevent breaking existing server.js usage.
 * @param {string} prompt
 * @returns {object} - OpenAI-compatible stream
 */
export async function askGroqStream(prompt) {
  const settings = await loadSettings();
  let modelConfig;

  if (settings.model && settings.model !== "auto") {
    modelConfig = resolveModel(settings.model.toLowerCase());
  } else {
    modelConfig = decideModel(prompt, "chat");
  }

  const provider = providers[modelConfig.provider];
  const textStream = provider.stream(modelConfig.modelId, prompt, { systemPrompt: SYSTEM_PROMPT });

  return {
    [Symbol.asyncIterator]: async function* () {
      for await (const text of textStream) {
        yield {
          choices: [
            {
              delta: {
                content: text
              }
            }
          ]
        };
      }
    }
  };
}

export async function askAI(prompt, tool = "chat") {
  const settings = await loadSettings();
  let modelConfig;

  if (settings.model && settings.model !== "auto") {
    modelConfig = resolveModel(settings.model.toLowerCase());
  } else {
    modelConfig = decideModel(prompt, tool);
  }

  const summary = await loadSummary();
  const memory = await loadMemory();
  const history = await getRecentHistory(10);

  const memoryPrompt = `
User Profile:

${JSON.stringify(memory, null, 2)}

Conversation Summary:

${summary?.summary || ""}

Recent Conversation:

${history
  .map(msg => `${msg.role}: ${msg.content}`)
  .join("\n")
}

Current User Message:

${prompt}
`;

  let startTime = Date.now();
  let fallbackOccurred = false;
  let finalModelConfig = modelConfig;
  let response;

  try {
    const provider = providers[modelConfig.provider];
    response = await provider.generate(modelConfig.modelId, memoryPrompt, { systemPrompt: SYSTEM_PROMPT });
  } catch (err) {
    console.error(`\n❌ Model Error: ${err.message}`);
    
    if (modelConfig.fallback) {
      fallbackOccurred = true;
      finalModelConfig = resolveModel(modelConfig.fallback);
      console.log(`\n🔄 Falling back to ${finalModelConfig.provider} (${finalModelConfig.modelId})...`);
      
      const fallbackProvider = providers[finalModelConfig.provider];
      response = await fallbackProvider.generate(finalModelConfig.modelId, memoryPrompt, { systemPrompt: SYSTEM_PROMPT });
    } else {
      throw err;
    }
  }

  let endTime = Date.now();
  let latency = ((endTime - startTime) / 1000).toFixed(2) + "s";

  // Pretty print the structured log as required
  console.log("\n--------------------------------------------------");
  console.log(`Provider   : ${finalModelConfig.provider}`);
  console.log(`Model      : ${finalModelConfig.name}`);
  console.log(`Capability : ${modelConfig.matchedCapability || tool || "general_chat"}`);
  console.log(`Latency    : ${latency}`);
  console.log(`Fallback   : ${fallbackOccurred}`);
  console.log("--------------------------------------------------\n");

  return cleanResponse(response);
}

export async function extractMemory(userMessage) {
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
    response = await askGemini(prompt);
  } catch {
    console.log("⚠️ Gemini failed. Using Groq.");
    response = await askGroq(prompt);
  }

  console.log("\n🧠 MEMORY EXTRACTED:");
  console.log(response);
  console.log("\n==================");

  try {
    const cleaned = response
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(cleaned);
  } catch (err) {
    console.log("\n❌ MEMORY PARSE ERROR:");
    console.log(err);
    console.log("\nRAW RESPONSE:");
    console.log(response);
    return {};
  }
}