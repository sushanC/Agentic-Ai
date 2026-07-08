import { googleProvider } from "./providers/googleProvider.js";
import { groqProvider } from "./providers/groqProvider.js";
import { deepseekProvider } from "./providers/deepseekProvider.js";
import { glmProvider } from "./providers/glmProvider.js";
import { openRouterProvider } from "./providers/openRouterProvider.js";
import { ollamaProvider } from "./providers/ollamaProvider.js";
import { resolveModel } from "./modelRegistry.js";
import { SYSTEM_PROMPT } from "./systemPrompt.js";
import { cleanResponse } from "./responseCleaner.js";
import { decideModel } from "./modelRouter.js";
import { loadSettings } from "../storage/settingsStorage.js";
import { runCiePipeline } from "./cie/index.js";
import { evaluate as evaluateRetryPolicy, RetryAction, logPolicyDecision } from "./cie/RetryPolicyEngine.js";
import { recordSuccess, recordFailure, getHealthScore } from "./cie/ProviderHealthManager.js";
import { recordModelSuccess, recordModelFailure } from "./modelSelection/index.js";
import { emitDevEvent, beginRequest } from "./developerBridge.js";
import { compressContext } from "./ai/ContextCompressor.js";
import { getProvider } from "./ai/ProviderManager.js";
import { logRequest } from "./ai/AIRequestLogger.js";



let lastModelUsed = {
  name: "gemini",
  modelId: "gemini-2.5-flash",
  displayName: "Gemini 2.5-Flash",
  provider: "google"
};

export function getLastModelUsed() {
  return lastModelUsed;
}


/**
 * @param {object} params
 * @param {string} params.prompt
 * @param {string} params.tool
 * @param {object} params.provider
 * @param {string} params.modelId
 * @param {string} params.systemPrompt
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
  pdfContext,
  settings
}) {
  let cieResult = await runCiePipeline(prompt, tool, provider, systemPrompt, pdfContext, settings);
  let retryCount = 0;
  const maxRetries = provider.maxRetries ?? 3;
  let compressionApplied = false;
  let response = null;

  const providerKey = provider.providerKey;

  while (true) {
    const startTime = Date.now();
    try {
      response = await provider.generate(modelId, cieResult.promptText, {
        systemPrompt,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens
      });
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
        cieResult = compressContext(cieResult, provider, prompt, systemPrompt, pdfContext);
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

function getCurrentProvider(modelConfig) {
    return getProvider(modelConfig.provider);
}

function recordFailureForModel(modelConfig, error) {

    recordFailure(
        modelConfig.provider,
        error
    );

    recordModelFailure(
        modelConfig.name ||
        modelConfig.provider,
        error
    );

}
function recordSuccessForModel(modelConfig, latency) {

    recordSuccess(
        modelConfig.provider,
        latency
    );

    recordModelSuccess(
        modelConfig.name || modelConfig.provider,
        latency
    );

}
function logExecution({
    modelConfig,
    cieResult,
    latencyMs,
    retryCount,
    compressionApplied,
    fallbackOccurred,
    fallbackChain
}) {

    const provider = getCurrentProvider(modelConfig);

    logRequest({

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

        providerName: modelConfig.provider,

        modelDisplayName: modelConfig.displayName,

        latencyMs,

        fallbackOccurred,

        retryCount,

        provider,

        maxBudget: cieResult.maxBudget,

        tokenBreakdown: cieResult.tokenBreakdown || {},

        healthScore: getHealthScore(modelConfig.provider),

        fallbackChain

    });

}

export async function askModelCie(modelName, prompt, intent = "GeneralChat") {
  const settings = await loadSettings();
  const modelConfig = resolveModel(modelName);
 const provider = getProvider(modelConfig.provider);

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
    if (modelConfig.fallback) {
      fallbackOccurred = true;
      finalModelConfig = resolveModel(modelConfig.fallback);
      lastModelUsed = finalModelConfig;
      console.log(`\n🔄 Primary provider failed. Falling back to ${finalModelConfig.provider} (${finalModelConfig.modelId})...`);
      fallbackChain.push(finalModelConfig.provider);

      const fallbackProvider = getProvider(finalModelConfig.provider);

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
    } else {
      throw err;
    }
  }

  let endTime = Date.now();
  let latencyMs = endTime - startTime;

logExecution({
    modelConfig: finalModelConfig,
    cieResult: cieResult,
    latencyMs,
    retryCount,
    compressionApplied,
    fallbackOccurred,
    fallbackChain
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

export async function askGroqStream(prompt) {
  // Developer Console: start a new request context
  beginRequest();
  emitDevEvent('IntentDetected', { intent: 'chat', tool: 'chat', userPrompt: prompt });

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
 let provider = getProvider(modelConfig.provider);
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
recordSuccessForModel(
    finalModelConfig,
    attemptLatency
);          break; // Success!

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
            cieResult = compressContext(cieResult, provider, prompt, SYSTEM_PROMPT, "");
            continue;
          }

          if (decision.action === RetryAction.RETRY && !yieldedAny) {
            retryCount++;
            continue;
          }

          if ((decision.action === RetryAction.FALLBACK || decision.action === RetryAction.ABORT) && !yieldedAny && modelConfig.fallback) {
            recordFailureForModel(
    finalModelConfig,
    fallbackErr
);
            fallbackOccurred = true;
            finalModelConfig = resolveModel(modelConfig.fallback);
            lastModelUsed = finalModelConfig;
            console.log(`\n🔄 Falling back stream to ${finalModelConfig.provider} (${finalModelConfig.modelId})...`);
            fallbackChain.push(finalModelConfig.provider);

            const fallbackProvider = getCurrentProvider(finalModelConfig);
            const fallbackCieResult = await runCiePipeline(prompt, "chat", fallbackProvider, SYSTEM_PROMPT, "", settings);

            try {
              const fallbackStart = Date.now();
              textStream = fallbackProvider.stream(finalModelConfig.modelId, fallbackCieResult.promptText, { systemPrompt: SYSTEM_PROMPT });
              for await (const text of textStream) {
                yield {
                  choices: [{ delta: { content: text } }]
                };
              }
              const fallbackLatency = Date.now() - fallbackStart;
              recordSuccess(finalModelConfig.provider, fallbackLatency);
recordSuccessForModel(
    finalModelConfig,
    fallbackLatency
);              cieResult = fallbackCieResult; // for logging
            } catch (fallbackErr) {
              recordFailureForModel(
    finalModelConfig,
    fallbackErr
);
              console.error(`\n❌ Stream fallback failed: ${fallbackErr.message}`);
              throw fallbackErr;
            }
            break;
          } else {
recordFailureForModel(
    finalModelConfig,
    decision.error
);
            throw decision.error;
          }
        }
      }

      let endTime = Date.now();
logExecution({
    modelConfig: finalModelConfig,
   cieResult: cieResult,
    latencyMs,
    retryCount,
    compressionApplied,
    fallbackOccurred,
    fallbackChain
});
    }
  };
}

export async function askAI(prompt, tool = "chat") {
  // Developer Console: start a new request context
  const reqId = beginRequest();
  emitDevEvent('IntentDetected', { intent: tool, tool, userPrompt: prompt });

  const settings = await loadSettings();
  const overrides = settings.capabilityRoutes || {};
  let modelConfig;

  if (settings.model && settings.model !== "auto") {
    modelConfig = resolveModel(settings.model.toLowerCase());
  } else {
    // Phase 6: decideModel is now async — delegates to IntentDetector + MSE
    modelConfig = await decideModel(prompt, tool, overrides, {}, settings);
  }

  const provider = getProvider(modelConfig.provider);
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
      tool,
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
    // Phase 6: record per-model success
    const elapsed = Date.now() - startTime;
recordSuccessForModel(
    finalModelConfig,
    elapsed
);  } catch (err) {
    // Phase 6: record primary model failure
    recordModelFailure(modelConfig.name || modelConfig.key || modelConfig.provider, err);
    if (modelConfig.fallback) {
      fallbackOccurred = true;
      finalModelConfig = resolveModel(modelConfig.fallback);
      lastModelUsed = finalModelConfig;
      console.log(`\n🔄 Primary provider failed. Falling back to ${finalModelConfig.provider} (${finalModelConfig.modelId})...`);
      fallbackChain.push(finalModelConfig.provider);

      const fallbackProvider = getCurrentProvider(finalModelConfig);

      const result = await executeWithCie({
        prompt,
        tool,
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
      // Phase 6: record fallback model success
      const fallbackElapsed = Date.now() - startTime;
recordSuccessForModel(
    finalModelConfig,
    latency
);    } else {
      throw err;
    }
  }

  let endTime = Date.now();
  let latencyMs = endTime - startTime;

logExecution({
    modelConfig: finalModelConfig,
   cieResult: cieResult,
    latencyMs,
    retryCount,
    compressionApplied,
    fallbackOccurred,
    fallbackChain
});
  return cleanResponse(response);
}

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