import { googleProvider } from "./providers/googleProvider.js";
import { groqProvider } from "./providers/groqProvider.js";
import { deepseekProvider } from "./providers/deepseekProvider.js";
import { glmProvider } from "./providers/glmProvider.js";
import { openRouterProvider } from "./providers/openRouterProvider.js";
import { ollamaProvider } from "./providers/ollamaProvider.js";

import { resolveModel, getModel } from "./modelRegistry.js";
import { SYSTEM_PROMPT } from "./systemPrompt.js";
import { loadMemory } from "../storage/memoryStorage.js";
import { cleanResponse } from "./responseCleaner.js";
import { decideModel } from "./modelRouter.js";
import { loadSettings } from "../storage/settingsStorage.js";

// Import Context Intelligence Engine
import { runCiePipeline } from "./cie/index.js";

const providers = {
  google: googleProvider,
  groq: groqProvider,
  deepseek: deepseekProvider,
  glm: glmProvider,
  openrouter: openRouterProvider,
  ollama: ollamaProvider
};

// ─────────────────────────────────────────────────────────────────────────────
// CIE Terminal Log Helper
// ─────────────────────────────────────────────────────────────────────────────
function logCieUsage({
  intent,
  memoryKeys = [],
  historyCount = 0,
  summarySize = 0,
  estimatedTokens = 0,
  compressionApplied = false,
  finalPromptSize = 0,
  providerName,
  modelDisplayName,
  latencyMs,
  fallbackOccurred = false
}) {
  const latencyStr = (latencyMs / 1000).toFixed(2) + " s";
  const memoryStr = memoryKeys.length > 0 ? memoryKeys.join(", ") : "None";
  const summaryStr = summarySize > 0 ? `${summarySize} chars` : "None";
  const compressionStr = compressionApplied ? "Yes" : "No";

  console.log("\n--------------------------------------------------");
  console.log(`Intent           : ${intent}`);
  console.log(`Memory           : ${memoryStr}`);
  console.log(`History          : ${historyCount}`);
  console.log(`Summary          : ${summaryStr}`);
  console.log(`Estimated Tokens : ${estimatedTokens}`);
  console.log(`Compression      : ${compressionStr}`);
  console.log(`Final Prompt Size: ${finalPromptSize} chars`);
  console.log(`Provider         : ${providerName} (${modelDisplayName})`);
  console.log(`Latency          : ${latencyStr}`);
  console.log(`Fallback         : ${fallbackOccurred}`);
  console.log("--------------------------------------------------\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Named ask helpers (used by memoryService, agentRouter, etc.)
// These resolve from the registry so modelId is never hardcoded.
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// askGroqStream
// Streaming chat powered by the Context Intelligence Engine.
// ─────────────────────────────────────────────────────────────────────────────
export async function askGroqStream(prompt) {
  const settings = await loadSettings();
  const overrides = settings.capabilityRoutes || {};
  let modelConfig;

  if (settings.model && settings.model !== "auto") {
    modelConfig = resolveModel(settings.model.toLowerCase());
  } else {
    modelConfig = decideModel(prompt, "chat", overrides);
  }

  let finalModelConfig = modelConfig;
  let fallbackOccurred = false;
  let provider = providers[modelConfig.provider];
  
  // Run primary CIE pipeline
  let cieResult = await runCiePipeline(prompt, "chat", provider, SYSTEM_PROMPT, "", settings);
  let startTime = Date.now();

  return {
    [Symbol.asyncIterator]: async function* () {
      let yieldedAny = false;
      let textStream;
      
      try {
        textStream = provider.stream(finalModelConfig.modelId, cieResult.promptText, { systemPrompt: SYSTEM_PROMPT });
        for await (const text of textStream) {
          yieldedAny = true;
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
      } catch (err) {
        console.error(`\n❌ Stream connection failed: ${err.message}`);
        
        // If we haven't yielded anything yet, we can attempt fallback
        if (!yieldedAny) {
          try {
            console.log("🔄 Retrying primary stream with heavily compressed context...");
            const retryCieResult = await runCiePipeline(prompt, "chat", provider, SYSTEM_PROMPT, "", {
              ...settings,
              tokenSafetyMargin: 0.4,
              maxHistory: 1,
              maxMemoryKeys: 1
            });
            
            textStream = provider.stream(finalModelConfig.modelId, retryCieResult.promptText, { systemPrompt: SYSTEM_PROMPT });
            for await (const text of textStream) {
              yieldedAny = true;
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
            
            let endTime = Date.now();
            logCieUsage({
              intent: retryCieResult.intent,
              memoryKeys: retryCieResult.memoryKeys,
              historyCount: retryCieResult.historyCount,
              summarySize: retryCieResult.summarySize,
              estimatedTokens: retryCieResult.estimatedTokens,
              compressionApplied: true,
              finalPromptSize: retryCieResult.promptText.length,
              providerName: finalModelConfig.provider,
              modelDisplayName: finalModelConfig.displayName,
              latencyMs: endTime - startTime,
              fallbackOccurred: false
            });
            return;
          } catch (retryErr) {
            console.error(`\n❌ Primary stream retry failed: ${retryErr.message}`);
          }

          // Fallback to secondary provider
          if (modelConfig.fallback) {
            fallbackOccurred = true;
            finalModelConfig = resolveModel(modelConfig.fallback);
            console.log(`\n🔄 Falling back stream to ${finalModelConfig.provider} (${finalModelConfig.modelId})...`);
            
            const fallbackProvider = providers[finalModelConfig.provider];
            const fallbackCieResult = await runCiePipeline(prompt, "chat", fallbackProvider, SYSTEM_PROMPT, "", settings);
            
            try {
              textStream = fallbackProvider.stream(finalModelConfig.modelId, fallbackCieResult.promptText, { systemPrompt: SYSTEM_PROMPT });
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
              
              let endTime = Date.now();
              logCieUsage({
                intent: fallbackCieResult.intent,
                memoryKeys: fallbackCieResult.memoryKeys,
                historyCount: fallbackCieResult.historyCount,
                summarySize: fallbackCieResult.summarySize,
                estimatedTokens: fallbackCieResult.estimatedTokens,
                compressionApplied: fallbackCieResult.compressionApplied,
                finalPromptSize: fallbackCieResult.promptText.length,
                providerName: finalModelConfig.provider,
                modelDisplayName: finalModelConfig.displayName,
                latencyMs: endTime - startTime,
                fallbackOccurred: true
              });
            } catch (fallbackErr) {
              console.error(`\n❌ Stream fallback failed: ${fallbackErr.message}`);
              throw fallbackErr;
            }
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }

      // Log successful primary stream completion
      if (!fallbackOccurred && yieldedAny) {
        let endTime = Date.now();
        logCieUsage({
          intent: cieResult.intent,
          memoryKeys: cieResult.memoryKeys,
          historyCount: cieResult.historyCount,
          summarySize: cieResult.summarySize,
          estimatedTokens: cieResult.estimatedTokens,
          compressionApplied: cieResult.compressionApplied,
          finalPromptSize: cieResult.promptText.length,
          providerName: finalModelConfig.provider,
          modelDisplayName: finalModelConfig.displayName,
          latencyMs: endTime - startTime,
          fallbackOccurred: false
        });
      }
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// askAI
// Main non-streaming AI entry point. Powered by Context Intelligence Engine.
// ─────────────────────────────────────────────────────────────────────────────
export async function askAI(prompt, tool = "chat") {
  const settings = await loadSettings();
  const overrides = settings.capabilityRoutes || {};
  let modelConfig;

  if (settings.model && settings.model !== "auto") {
    modelConfig = resolveModel(settings.model.toLowerCase());
  } else {
    modelConfig = decideModel(prompt, tool, overrides);
  }

  const provider = providers[modelConfig.provider];
  
  // Run the Context Intelligence Engine (CIE) pipeline
  const cieResult = await runCiePipeline(prompt, tool, provider, SYSTEM_PROMPT, "", settings);

  let startTime = Date.now();
  let fallbackOccurred = false;
  let finalModelConfig = modelConfig;
  let response;
  let finalPromptText = cieResult.promptText;
  let compressionApplied = cieResult.compressionApplied;

  try {
    response = await provider.generate(modelConfig.modelId, finalPromptText, { systemPrompt: SYSTEM_PROMPT });
  } catch (err) {
    console.error(`\n❌ Model Error: ${err.message}. Retrying on primary provider with compressed context...`);

    try {
      // Retry A with highly compressed context
      const retryCieResult = await runCiePipeline(prompt, tool, provider, SYSTEM_PROMPT, "", {
        ...settings,
        tokenSafetyMargin: 0.4,
        maxHistory: 1,
        maxMemoryKeys: 1
      });
      
      finalPromptText = retryCieResult.promptText;
      compressionApplied = true;
      response = await provider.generate(modelConfig.modelId, finalPromptText, { systemPrompt: SYSTEM_PROMPT });
    } catch (retryErr) {
      console.error(`\n❌ Primary provider retry failed: ${retryErr.message}`);

      if (modelConfig.fallback) {
        fallbackOccurred = true;
        finalModelConfig = resolveModel(modelConfig.fallback);
        console.log(`\n🔄 Falling back to ${finalModelConfig.provider} (${finalModelConfig.modelId})...`);

        const fallbackProvider = providers[finalModelConfig.provider];
        
        // Re-optimize context specifically for the fallback provider!
        const fallbackCieResult = await runCiePipeline(prompt, tool, fallbackProvider, SYSTEM_PROMPT, "", settings);
        finalPromptText = fallbackCieResult.promptText;
        compressionApplied = fallbackCieResult.compressionApplied;

        response = await fallbackProvider.generate(finalModelConfig.modelId, finalPromptText, { systemPrompt: SYSTEM_PROMPT });
      } else {
        throw retryErr;
      }
    }
  }

  let endTime = Date.now();
  let latencyMs = endTime - startTime;

  logCieUsage({
    intent: cieResult.intent,
    memoryKeys: cieResult.memoryKeys,
    historyCount: cieResult.historyCount,
    summarySize: cieResult.summarySize,
    estimatedTokens: cieResult.estimatedTokens,
    compressionApplied,
    finalPromptSize: finalPromptText.length,
    providerName: finalModelConfig.provider,
    modelDisplayName: finalModelConfig.displayName,
    latencyMs,
    fallbackOccurred
  });

  return cleanResponse(response);
}

// ─────────────────────────────────────────────────────────────────────────────
// extractMemory
// Uses Gemini (primary) → Groq (fallback) per the spec.
// ─────────────────────────────────────────────────────────────────────────────
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