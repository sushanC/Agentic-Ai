import { googleProvider } from "./providers/googleProvider.js";
import { groqProvider } from "./providers/groqProvider.js";
import { deepseekProvider } from "./providers/deepseekProvider.js";
import { glmProvider } from "./providers/glmProvider.js";
import { openRouterProvider } from "./providers/openRouterProvider.js";
import { ollamaProvider } from "./providers/ollamaProvider.js";

import { resolveModel, getModel } from "./modelRegistry.js";
import { SYSTEM_PROMPT } from "./systemPrompt.js";
import { VOICE_SYSTEM_PROMPT } from "../features/voice/voiceSystemPrompt.js";
import { cleanResponse } from "./responseCleaner.js";
import { decideModel } from "./modelRouter.js";
import { loadSettings } from "../features/settings/index.js";

// Import Context Intelligence Engine
import { runCiePipeline, buildPrompt } from "./cie/index.js";

// Import new production-hardening modules
import { evaluate as evaluateRetryPolicy, RetryAction, logPolicyDecision } from "./cie/RetryPolicyEngine.js";
import { recordSuccess, recordFailure, getHealthScore, isAvailable as isProviderAvailable } from "./cie/ProviderHealthManager.js";
import { runtimeManager } from "../core/runtime/RuntimeManager.js";

// MSE Phase 6 — Per-model health tracking (parallel to provider health)
import { recordModelSuccess, recordModelFailure } from "./modelSelection/index.js";

const providers = {
  google: googleProvider,
  groq: groqProvider,
  deepseek: deepseekProvider,
  glm: glmProvider,
  openrouter: openRouterProvider,
  ollama: ollamaProvider
};

let lastModelUsed = {
  name: "gemini",
  modelId: "gemini-2.5-flash",
  displayName: "Gemini 2.5-Flash",
  provider: "google"
};

export function getLastModelUsed() {
  return lastModelUsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context Quality Score
// ─────────────────────────────────────────────────────────────────────────────
function calculateContextQuality({
  intent,
  provider,
  memoryKeys,
  rawMemory,
  historyCount,
  rawHistory,
  summarySize,
  rawSummary,
  estimatedTokens,
  maxBudget,
  compressionApplied
}) {
  let memoryScore = 1.0;
  if (rawMemory) {
    const rawMemoryKeys = Object.keys(rawMemory || {});
    if (rawMemoryKeys.length > 0) {
      memoryScore = memoryKeys.length / rawMemoryKeys.length;
    }
  }

  let historyScore = 1.0;
  const preferredHistory = provider.preferredHistoryLength || 5;
  if (rawHistory && rawHistory.length > 0) {
    historyScore = historyCount / Math.min(rawHistory.length, preferredHistory);
  }

  let summaryScore = 1.0;
  if (rawSummary && rawSummary.length > 0) {
    summaryScore = summarySize / rawSummary.length;
  }

  let tokenUtilization = 1.0;
  if (maxBudget && maxBudget > 0) {
    tokenUtilization = Math.min(estimatedTokens / maxBudget, 1.0);
  }

  const completeness = compressionApplied ? 0.8 : 1.0;

  const score = (
    memoryScore * 0.2 +
    historyScore * 0.2 +
    summaryScore * 0.2 +
    tokenUtilization * 0.2 +
    completeness * 0.2
  );

  return Math.round(score * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Structured Diagnostic Logger (Phase 3 + Phase 8)
// ─────────────────────────────────────────────────────────────────────────────
function logCieUsage({
  intent,
  memoryKeys = [],
  rawMemory = {},
  historyCount = 0,
  rawHistory = [],
  summaryLevel = "None",
  summarySize = 0,
  rawSummary = "",
  estimatedTokens = 0,
  compressionApplied = false,
  finalPromptSize = 0,
  providerName,
  modelDisplayName,
  latencyMs,
  fallbackOccurred = false,
  retryCount = 0,
  provider,
  maxBudget,
  tokenBreakdown = {},
  healthScore = null,
  fallbackChain = []
}) {
  const latencyStr = (latencyMs / 1000).toFixed(2) + " s";
  const memoryKeysStr = memoryKeys.length > 0 ? memoryKeys.join(", ") : "None";

  // Extract memory relevance scores
  const scoresMap = rawMemory ? (rawMemory._scores || {}) : {};
  const scoresStr = Object.entries(scoresMap)
    .map(([k, v]) => `${k} (${v.toFixed(2)})`)
    .join(", ") || "None";

  // Context percentage
  const contextPct = provider?.maxContext
    ? ((estimatedTokens / provider.maxContext) * 100).toFixed(2) + "%"
    : "N/A";
  const remaining = provider?.maxContext
    ? (provider.maxContext - estimatedTokens).toLocaleString()
    : "N/A";

  // Calculate Context Quality Score
  const qualityScore = calculateContextQuality({
    intent, provider, memoryKeys, rawMemory, historyCount, rawHistory,
    summarySize, rawSummary, estimatedTokens, maxBudget, compressionApplied
  });

  const {
    systemTokens = 0,
    memoryTokens = 0,
    historyTokens = 0,
    summaryTokens = 0,
    pdfTokens = 0,
    userTokens = 0,
  } = tokenBreakdown;

  const healthStr = healthScore !== null ? `${(healthScore * 100).toFixed(0)}%` : "N/A";
  const fallbackStr = fallbackOccurred
    ? (fallbackChain.length > 0 ? fallbackChain.join(" → ") : "Yes")
    : "No";

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Intent           : ${intent}`);
  console.log(`  Provider         : ${providerName} (${modelDisplayName})`);
  console.log(`  Provider Health  : ${healthStr}`);
  console.log(`  Memory Keys      : ${memoryKeysStr}`);
  console.log(`  Memory Relevance : ${scoresStr}`);
  console.log(`  History Msgs     : ${historyCount}`);
  console.log(`  Summary Mode     : ${summaryLevel}`);
  console.log("  ─────────────────────────────────────────────────────────");
  console.log(`  Prompt           : ${finalPromptSize.toLocaleString()} chars`);
  console.log(`  Estimated Tokens : ${estimatedTokens.toLocaleString()}`);
  console.log(`    ├─ System      : ${systemTokens}`);
  console.log(`    ├─ Memory      : ${memoryTokens}`);
  console.log(`    ├─ History     : ${historyTokens}`);
  console.log(`    ├─ Summary     : ${summaryTokens}`);
  console.log(`    ├─ PDF         : ${pdfTokens}`);
  console.log(`    └─ User        : ${userTokens}`);
  console.log(`  Context %        : ${contextPct}`);
  console.log(`  Remaining        : ${remaining}`);
  console.log("  ─────────────────────────────────────────────────────────");
  console.log(`  Compression      : ${compressionApplied ? "Yes" : "No"}`);
  console.log(`  Retry Count      : ${retryCount}`);
  console.log(`  Fallback         : ${fallbackStr}`);
  console.log(`  Context Quality  : ${qualityScore}%`);
  console.log(`  Latency          : ${latencyStr}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Context Compression Helper
// ─────────────────────────────────────────────────────────────────────────────
function compressCieResult(cieResult, provider, userPrompt, systemPrompt, pdfContext) {
  let { rawHistory = [], rawSummary = "", rawMemory = {}, historyCount = 0, memoryKeys = [], intent } = cieResult;

  if (historyCount > 0) {
    // 1. Trim history
    rawHistory = rawHistory.slice(1);
    historyCount = rawHistory.length;
  } else if (rawSummary && rawSummary.length > 0) {
    // 2. Compress summary
    if (rawSummary.length > 100) {
      rawSummary = rawSummary.slice(0, Math.floor(rawSummary.length / 2)) + "...";
    } else {
      rawSummary = "";
    }
  } else if (memoryKeys && memoryKeys.length > 0) {
    // 3. Reduce memory
    const newKeys = memoryKeys.slice(0, -1);
    const newMemory = {};
    newKeys.forEach(k => {
      if (rawMemory[k] !== undefined) {
        newMemory[k] = rawMemory[k];
      }
    });
    rawMemory = newMemory;
    memoryKeys = newKeys;
  }

  // Preserve scores property
  if (cieResult.rawMemory && cieResult.rawMemory._scores) {
    Object.defineProperty(rawMemory, "_scores", {
      value: cieResult.rawMemory._scores,
      enumerable: false,
      configurable: true,
      writable: true
    });
  }

  const promptText = buildPrompt({
    userPrompt,
    memory: rawMemory,
    history: rawHistory,
    summary: rawSummary,
    pdfContext,
    intent
  });

  const totalText = (systemPrompt ? systemPrompt + "\n\n" : "") + promptText;
  const estimatedTokens = provider.estimateTokens(totalText);

  return {
    ...cieResult,
    rawHistory,
    rawSummary,
    rawMemory,
    historyCount,
    memoryKeys,
    promptText,
    estimatedTokens,
    summarySize: rawSummary ? rawSummary.length : 0,
    compressionApplied: true
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// executeWithCie — Core CIE + RetryPolicyEngine execution loop (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Centrally executes a CIE pipeline and provider call with RetryPolicyEngine-driven
 * compression/retry/fallback logic.
 *
 * @param {object} params
 * @param {string} params.prompt
 * @param {string} params.tool
 * @param {object} params.provider
 * @param {string} params.modelId
 * @param {string} params.systemPrompt
 * @param {string} [params.systemPromptOverride] - Optional override (e.g. VOICE_SYSTEM_PROMPT). When set, takes precedence over systemPrompt.
 * @param {string} params.pdfContext
 * @param {object} params.settings
 * @returns {Promise<{response, cieResult, retryCount, compressionApplied}>}
 */
export async function executeWithCie({
  prompt,
  tool,
  provider,
  modelId,
  systemPrompt,
  systemPromptOverride,
  pdfContext,
  settings
}) {
  // Voice Mode injects VOICE_SYSTEM_PROMPT via systemPromptOverride.
  // All other callers continue using the standard SYSTEM_PROMPT.
  const effectiveSystemPrompt = systemPromptOverride || systemPrompt;
  let cieResult = await runCiePipeline(prompt, tool, provider, effectiveSystemPrompt, pdfContext, settings);
  let retryCount = 0;
  const maxRetries = provider.maxRetries ?? 3;
  let compressionApplied = false;
  let response = null;

  // Extract provider key from any provider object
  const providerKey = Object.entries({
    google: googleProvider, groq: groqProvider, deepseek: deepseekProvider,
    glm: glmProvider, openrouter: openRouterProvider, ollama: ollamaProvider
  }).find(([, p]) => p === provider)?.[0] || "unknown";

  while (true) {
    const startTime = Date.now();
    try {
      response = await provider.generate(modelId, cieResult.promptText, {
        systemPrompt: effectiveSystemPrompt,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens
      });
      recordSuccess(providerKey, Date.now() - startTime);
      break; // Success!
    } catch (err) {
      const decision = evaluateRetryPolicy({
        rawError: err,
        providerKey,
        retryCount,
        maxRetries,
        canFallback: false, // Fallback is handled by the caller
        hasYieldedChunks: false,
      });

      logPolicyDecision(decision);

      if (decision.action === RetryAction.COMPRESS) {
        retryCount++;
        compressionApplied = true;
        cieResult = compressCieResult(cieResult, provider, prompt, systemPrompt, pdfContext);
        continue;
      }

      if (decision.action === RetryAction.RETRY) {
        retryCount++;
        continue;
      }

      // FALLBACK or ABORT — record failure and throw for caller to handle
      recordFailure(providerKey, decision.error);
      throw decision.error;
    }
  }

  return { response, cieResult, retryCount, compressionApplied };
}

// ─────────────────────────────────────────────────────────────────────────────
// Named ask helpers (routing through CIE)
// ─────────────────────────────────────────────────────────────────────────────
export async function askModelCie(modelName, prompt, intent = "GeneralChat") {
  const settings = await loadSettings();
  const modelConfig = resolveModel(modelName);
  const provider = providers[modelConfig.provider];

  let finalModelConfig = modelConfig;
  lastModelUsed = finalModelConfig;
  let fallbackOccurred = false;
  let startTime = Date.now();
  let response;
  let finalCieResult;
  let retryCount = 0;
  let compressionApplied = false;
  const fallbackChain = [modelConfig.provider];

  try {
    const result = await executeWithCie({
      prompt,
      tool: intent,
      provider,
      modelId: modelConfig.modelId,
      systemPrompt: SYSTEM_PROMPT,
      pdfContext: "",
      settings
    });
    response = result.response;
    finalCieResult = result.cieResult;
    retryCount = result.retryCount;
    compressionApplied = result.compressionApplied;
  } catch (err) {
    const fallbackList = modelConfig.fallbackChain || (modelConfig.fallback ? [modelConfig.fallback] : []);
    let success = false;

    for (const fallbackKey of fallbackList) {
      const fallbackModel = resolveModel(fallbackKey);
      if (!fallbackModel || !fallbackModel.enabled || fallbackModel.status === "disabled") {
        continue;
      }
      if (!isProviderAvailable(fallbackModel.provider)) {
        console.log(`⚠️ [Fallback] Model ${fallbackModel.displayName} skipped because provider ${fallbackModel.provider} is unhealthy.`);
        continue;
      }

      fallbackOccurred = true;
      finalModelConfig = fallbackModel;
      lastModelUsed = finalModelConfig;
      console.log(`\n🔄 Primary provider failed. Falling back to ${finalModelConfig.provider} (${finalModelConfig.modelId})...`);
      fallbackChain.push(finalModelConfig.provider);

      try {
        const fallbackProvider = providers[finalModelConfig.provider];
        const result = await executeWithCie({
          prompt,
          tool: intent,
          provider: fallbackProvider,
          modelId: finalModelConfig.modelId,
          systemPrompt: SYSTEM_PROMPT,
          pdfContext: "",
          settings
        });
        response = result.response;
        finalCieResult = result.cieResult;
        retryCount = result.retryCount;
        compressionApplied = result.compressionApplied;
        const elapsed = Date.now() - startTime;
        recordModelSuccess(finalModelConfig.name || finalModelConfig.key || finalModelConfig.provider, elapsed);
        success = true;
        break;
      } catch (fallbackErr) {
        recordModelFailure(finalModelConfig.name || finalModelConfig.key || finalModelConfig.provider, fallbackErr);
        console.error(`❌ Fallback to ${finalModelConfig.displayName} failed:`, fallbackErr.message);
      }
    }

    if (!success) {
      throw err;
    }
  }

  let endTime = Date.now();
  let latencyMs = endTime - startTime;

  const finalProvider = providers[finalModelConfig.provider];
  logCieUsage({
    intent: finalCieResult.intent,
    memoryKeys: finalCieResult.memoryKeys,
    rawMemory: finalCieResult.rawMemory,
    historyCount: finalCieResult.historyCount,
    rawHistory: finalCieResult.rawHistory,
    summaryLevel: finalCieResult.summaryLevel || "None",
    summarySize: finalCieResult.summarySize,
    rawSummary: finalCieResult.rawSummary,
    estimatedTokens: finalCieResult.estimatedTokens,
    compressionApplied,
    finalPromptSize: finalCieResult.promptText.length,
    providerName: finalModelConfig.provider,
    modelDisplayName: finalModelConfig.displayName,
    latencyMs,
    fallbackOccurred,
    retryCount,
    provider: finalProvider,
    maxBudget: finalCieResult.maxBudget,
    tokenBreakdown: finalCieResult.tokenBreakdown || {},
    healthScore: getHealthScore(finalModelConfig.provider),
    fallbackChain,
  });

  return cleanResponse(response);
}

export async function askGemini(prompt) {
  return await askModelCie("gemini", prompt);
}

export async function askGroq(prompt) {
  return await askModelCie("groq", prompt);
}

export async function askOpenRouter(prompt) {
  return await askModelCie("openrouter", prompt);
}

export async function askDeepSeek(prompt) {
  return await askModelCie("deepseek", prompt);
}

// ─────────────────────────────────────────────────────────────────────────────
// askGroqStream
// Streaming chat powered by the Context Intelligence Engine and RetryPolicyEngine.
// ─────────────────────────────────────────────────────────────────────────────
export async function askGroqStream(prompt) {
  const settings = await loadSettings();
  const overrides = settings.capabilityRoutes || {};
  let modelConfig;

  if (settings.model && settings.model !== "auto") {
    modelConfig = resolveModel(settings.model.toLowerCase());
  } else {
    // Phase 6: decideModel is now async — delegates to IntentDetector + MSE
    modelConfig = await decideModel(prompt, "chat", overrides, {}, settings);
  }

  let finalModelConfig = modelConfig;
  lastModelUsed = finalModelConfig;
  let fallbackOccurred = false;
  let provider = providers[modelConfig.provider];
  const fallbackChain = [modelConfig.provider];

  let cieResult = await runCiePipeline(prompt, "chat", provider, SYSTEM_PROMPT, "", settings);
  let startTime = Date.now();
  let retryCount = 0;
  let compressionApplied = false;
  const maxRetries = provider.maxRetries ?? 3;

  const providerKey = modelConfig.provider;

  return {
    [Symbol.asyncIterator]: async function* () {
      let yieldedAny = false;
      let textStream;

      while (true) {
        const attemptStart = Date.now();
        try {
          textStream = provider.stream(finalModelConfig.modelId, cieResult.promptText, { systemPrompt: SYSTEM_PROMPT });

          const iterator = textStream[Symbol.asyncIterator]();
          const firstChunk = await iterator.next();

          if (!firstChunk.done) {
            yieldedAny = true;
            yield {
              choices: [{ delta: { content: firstChunk.value } }]
            };
            for await (const chunk of textStream) {
              yield {
                choices: [{ delta: { content: chunk } }]
              };
            }
          }

          const attemptLatency = Date.now() - attemptStart;
          recordSuccess(finalModelConfig.provider, attemptLatency);
          recordModelSuccess(finalModelConfig.name || finalModelConfig.key || finalModelConfig.provider, attemptLatency);
          break; // Success!

        } catch (err) {
          const decision = evaluateRetryPolicy({
            rawError: err,
            providerKey: finalModelConfig.provider,
            retryCount,
            maxRetries,
            canFallback: !!modelConfig.fallback,
            hasYieldedChunks: yieldedAny,
          });

          logPolicyDecision(decision);

          if (decision.action === RetryAction.COMPRESS && !yieldedAny) {
            retryCount++;
            compressionApplied = true;
            cieResult = compressCieResult(cieResult, provider, prompt, SYSTEM_PROMPT, "");
            continue;
          }

          if (decision.action === RetryAction.RETRY && !yieldedAny) {
            retryCount++;
            continue;
          }

          const fallbackList = modelConfig.fallbackChain || (modelConfig.fallback ? [modelConfig.fallback] : []);
          if ((decision.action === RetryAction.FALLBACK || decision.action === RetryAction.ABORT) && !yieldedAny && fallbackList.length > 0) {
            recordFailure(finalModelConfig.provider, decision.error);
            recordModelFailure(finalModelConfig.name || finalModelConfig.key || finalModelConfig.provider, decision.error);

            let success = false;
            for (const fallbackKey of fallbackList) {
              const fallbackModel = resolveModel(fallbackKey);
              if (!fallbackModel || !fallbackModel.enabled || fallbackModel.status === "disabled") {
                continue;
              }
              if (!isProviderAvailable(fallbackModel.provider)) {
                console.log(`⚠️ [Stream Fallback] Model ${fallbackModel.displayName} skipped because provider ${fallbackModel.provider} is unhealthy.`);
                continue;
              }

              fallbackOccurred = true;
              finalModelConfig = fallbackModel;
              lastModelUsed = finalModelConfig;
              console.log(`\n🔄 Falling back stream to ${finalModelConfig.provider} (${finalModelConfig.modelId})...`);
              fallbackChain.push(finalModelConfig.provider);

              const fallbackProvider = providers[finalModelConfig.provider];
              try {
                const fallbackCieResult = await runCiePipeline(prompt, "chat", fallbackProvider, SYSTEM_PROMPT, "", settings);
                const fallbackStart = Date.now();
                textStream = fallbackProvider.stream(finalModelConfig.modelId, fallbackCieResult.promptText, { systemPrompt: SYSTEM_PROMPT });
                for await (const text of textStream) {
                  yield {
                    choices: [{ delta: { content: text } }]
                  };
                }
                const fallbackLatency = Date.now() - fallbackStart;
                recordSuccess(finalModelConfig.provider, fallbackLatency);
                recordModelSuccess(finalModelConfig.name || finalModelConfig.key || finalModelConfig.provider, fallbackLatency);
                cieResult = fallbackCieResult; // for logging
                success = true;
                break;
              } catch (fallbackErr) {
                recordFailure(finalModelConfig.provider, fallbackErr);
                recordModelFailure(finalModelConfig.name || finalModelConfig.key || finalModelConfig.provider, fallbackErr);
                console.error(`\n❌ Stream fallback to ${finalModelConfig.displayName} failed: ${fallbackErr.message}`);
              }
            }

            if (success) {
              break;
            } else {
              throw decision.error;
            }
          } else {
            recordFailure(finalModelConfig.provider, decision.error);
            recordModelFailure(finalModelConfig.name || finalModelConfig.key || finalModelConfig.provider, decision.error);
            throw decision.error;
          }
        }
      }

      let endTime = Date.now();
      const finalProvider = providers[finalModelConfig.provider];
      logCieUsage({
        intent: cieResult.intent,
        memoryKeys: cieResult.memoryKeys,
        rawMemory: cieResult.rawMemory,
        historyCount: cieResult.historyCount,
        rawHistory: cieResult.rawHistory,
        summaryLevel: cieResult.summaryLevel || "None",
        summarySize: cieResult.summarySize,
        rawSummary: cieResult.rawSummary,
        estimatedTokens: cieResult.estimatedTokens,
        compressionApplied,
        finalPromptSize: cieResult.promptText.length,
        providerName: finalModelConfig.provider,
        modelDisplayName: finalModelConfig.displayName,
        latencyMs: endTime - startTime,
        fallbackOccurred,
        retryCount,
        provider: finalProvider,
        maxBudget: cieResult.maxBudget,
        tokenBreakdown: cieResult.tokenBreakdown || {},
        healthScore: getHealthScore(finalModelConfig.provider),
        fallbackChain,
      });
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// askAI
// Main non-streaming AI entry point. Powered by Context Intelligence Engine.
// Voice Mode passes tool="voice" to inject the Voice system prompt.
// ─────────────────────────────────────────────────────────────────────────────
export async function askAI(prompt, tool = "chat") {
  const result = await runtimeManager.execute({ prompt, tool });
  if (result.modelUsed) {
    lastModelUsed = result.modelUsed;
  }
  return result.answer;
}

// ─────────────────────────────────────────────────────────────────────────────
// extractMemory
// Uses Gemini (primary) → Groq (fallback) per the spec, routed through CIE.
// ─────────────────────────────────────────────────────────────────────────────
export async function extractMemory(userMessage) {
  let response;

  try {
    response = await askModelCie("gemini", userMessage, "MemoryExtraction");
  } catch {
    console.log("⚠️ Gemini failed. Using Groq.");
    response = await askModelCie("groq", userMessage, "MemoryExtraction");
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