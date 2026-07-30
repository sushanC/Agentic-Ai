import { providerPool } from "./ProviderPool.js";
import { retryManager } from "./RetryManager.js";
import { fallbackManager } from "./FallbackManager.js";
import { diagnostics } from "./Diagnostics.js";
import { runCiePipeline, buildPrompt, optimizeContext } from "../../services/cie/index.js";
import { googleProvider } from "../../services/providers/googleProvider.js";
import { groqProvider } from "../../services/providers/groqProvider.js";
import { deepseekProvider } from "../../services/providers/deepseekProvider.js";
import { glmProvider } from "../../services/providers/glmProvider.js";
import { openRouterProvider } from "../../services/providers/openRouterProvider.js";
import { ollamaProvider } from "../../services/providers/ollamaProvider.js";

const PROVIDERS = {
  google: googleProvider,
  groq: groqProvider,
  deepseek: deepseekProvider,
  glm: glmProvider,
  openrouter: openRouterProvider,
  ollama: ollamaProvider
};

/**
 * RequestPipeline.js
 *
 * Standardized request execution pipeline.
 * Manages request validation, context assembly via CIE, provider execution,
 * intelligent transient retries with exponential backoff & jitter, and automated fallback.
 */
export class RequestPipeline {
  /**
   * Execute a non-streaming AI generation request through retries and fallbacks.
   *
   * @param {object} params
   * @param {string} params.prompt - User message prompt
   * @param {string} [params.tool="chat"] - Tool context ("chat", "voice", etc.)
   * @param {object} params.modelConfig - Primary resolved model config
   * @param {string} params.systemPrompt - System prompt
   * @param {object} [params.settings={}] - User settings
   * @returns {Promise<{response: string, modelConfig: object, cieResult: object, latencyMs: number}>}
   */
  async executeRequest({ prompt, tool = "chat", modelConfig, systemPrompt, settings = {} }) {
    if (!prompt) throw new Error("Request prompt cannot be empty.");
    if (!modelConfig) throw new Error("Model configuration must be provided.");

    const candidates = fallbackManager.getFallbackCandidates(modelConfig);
    const failedKeys = new Set();
    const startTime = Date.now();

    let lastError = null;

    while (true) {
      const activeCandidate = fallbackManager.selectNextCandidate(candidates, failedKeys);
      if (!activeCandidate) {
        diagnostics.error("RequestPipeline", "All provider candidates exhausted or unhealthy.", { failedCount: failedKeys.size });
        throw lastError || new Error("[Runtime Error] All available AI providers are currently down or degraded.");
      }

      const providerKey = activeCandidate.provider;
      const modelKey = activeCandidate.name || activeCandidate.key || providerKey;
      const provider = PROVIDERS[providerKey];

      if (!provider) {
        diagnostics.warn("RequestPipeline", `Provider "${providerKey}" not found in provider registry. Skipping.`);
        failedKeys.add(modelKey);
        continue;
      }

      // Execute retry loop for active provider candidate
      let cieResult = await runCiePipeline(prompt, tool, provider, systemPrompt, "", settings);
      let retryCount = 0;
      const maxRetries = provider.maxRetries ?? 3;

      let candidateSuccess = false;
      let responseText = null;

      while (retryCount <= maxRetries) {
        const attemptStartTime = Date.now();
        try {
          diagnostics.debug("RequestPipeline", `Attempting execution with ${activeCandidate.displayName} (${providerKey}/${activeCandidate.modelId}) [Attempt ${retryCount + 1}]`);

          responseText = await provider.generate(activeCandidate.modelId, cieResult.promptText, {
            systemPrompt,
            temperature: settings.temperature,
            maxTokens: settings.maxTokens
          });

          const latencyMs = Date.now() - attemptStartTime;
          providerPool.recordSuccess(providerKey, latencyMs);
          providerPool.recordSuccess(modelKey, latencyMs);

          candidateSuccess = true;
          return {
            response: responseText,
            modelConfig: activeCandidate,
            cieResult,
            latencyMs: Date.now() - startTime
          };

        } catch (err) {
          lastError = err;
          const attemptLatency = Date.now() - attemptStartTime;
          diagnostics.warn("RequestPipeline", `Execution attempt failed for ${activeCandidate.displayName}: ${err.message}`, { attempt: retryCount + 1 });

          providerPool.recordFailure(providerKey, err);
          providerPool.recordFailure(modelKey, err);

          // Check context compression requirement
          if (err.type === "CONTEXT_LIMIT" || err.type === "PAYLOAD_TOO_LARGE") {
            diagnostics.info("RequestPipeline", `Context limit hit for ${activeCandidate.displayName}. Applying context compression.`);
            cieResult = await runCiePipeline(prompt, tool, provider, systemPrompt, "", settings);
            retryCount++;
            continue;
          }

          // Check if error is transient and retryable
          if (retryManager.isRetryable(err) && retryCount < maxRetries) {
            const delay = retryManager.calculateBackoff(retryCount);
            diagnostics.info("RequestPipeline", `Retrying transient failure in ${delay}ms...`);
            await retryManager.sleep(delay);
            retryCount++;
            continue;
          }

          // Permanent error or retries exhausted -> exit candidate retry loop to trigger fallback
          break;
        }
      }

      if (!candidateSuccess) {
        failedKeys.add(modelKey);
        failedKeys.add(providerKey);
        diagnostics.warn("RequestPipeline", `Candidate ${activeCandidate.displayName} failed completely. Falling back to next available provider.`);
      }
    }
  }

  /**
   * Execute an SSE streaming generation request.
   *
   * @param {object} params
   * @returns {AsyncGenerator<string>} Streamed response text chunks
   */
  async *executeStream({ prompt, tool = "chat", modelConfig, systemPrompt, settings = {} }) {
    const candidates = fallbackManager.getFallbackCandidates(modelConfig);
    const failedKeys = new Set();

    let lastError = null;

    for (const candidate of candidates) {
      const providerKey = candidate.provider;
      const modelKey = candidate.name || candidate.key || providerKey;

      if (failedKeys.has(modelKey) || failedKeys.has(providerKey)) continue;

      const provider = PROVIDERS[providerKey];
      if (!provider || !provider.stream) continue;

      let yieldedAny = false;
      let cieResult = await runCiePipeline(prompt, tool, provider, systemPrompt, "", settings);

      try {
        const stream = provider.stream(candidate.modelId, cieResult.promptText, {
          systemPrompt,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens
        });

        const startTime = Date.now();
        for await (const chunk of stream) {
          if (chunk) {
            yieldedAny = true;
            yield chunk;
          }
        }

        if (yieldedAny) {
          providerPool.recordSuccess(providerKey, Date.now() - startTime);
          providerPool.recordSuccess(modelKey, Date.now() - startTime);
          return;
        }
      } catch (err) {
        lastError = err;
        providerPool.recordFailure(providerKey, err);
        providerPool.recordFailure(modelKey, err);
        failedKeys.add(modelKey);
        diagnostics.warn("RequestPipeline", `Stream attempt failed for ${candidate.displayName}: ${err.message}. Falling back.`);

        if (yieldedAny) {
          // If chunks were already sent to client, cannot fall back cleanly
          throw err;
        }
      }
    }

    if (lastError) throw lastError;
  }
}

export const requestPipeline = new RequestPipeline();
