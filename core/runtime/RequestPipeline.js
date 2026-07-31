import { providerPool } from "./ProviderPool.js";
import { retryManager } from "./RetryManager.js";
import { fallbackManager } from "./FallbackManager.js";
import { diagnostics } from "./Diagnostics.js";
import { runCiePipeline } from "../../services/cie/index.js";

/**
 * RequestPipeline.js
 *
 * Provider-agnostic execution pipeline.
 *
 * This file knows NOTHING about which providers exist.
 * Provider resolution is fully delegated to ProviderPool via:
 *   providerPool.getProvider(candidate.provider)
 *
 * Architecture:
 *   - executeRequest()  → non-streaming path
 *   - executeStream()   → streaming path
 *   - _executeCandidate() → unified execution engine used by both paths
 *
 * To add a new provider: register it in ProviderPool. Zero changes here.
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

    const candidates = fallbackManager.getCandidates(modelConfig);
    const failedKeys = new Set();
    const startTime = Date.now();
    let lastError = null;

    diagnostics.info("RequestPipeline", `Starting non-streaming request. Primary: ${modelConfig.displayName}. Total candidates: ${candidates.length}.`);

    while (true) {
      const activeCandidate = fallbackManager.selectNextCandidate(candidates, failedKeys);

      if (!activeCandidate) {
        diagnostics.error("RequestPipeline", "All provider candidates exhausted.", {
          totalAttempted: failedKeys.size,
          failedKeys: [...failedKeys],
        });
        throw lastError || new Error("[Runtime Error] All available AI providers are currently down or degraded.");
      }

      const providerKey = activeCandidate.provider;
      const modelKey    = activeCandidate.name || activeCandidate.key || providerKey;

      // Resolve provider from registry — zero hardcoding
      const provider = providerPool.getProvider(providerKey);

      if (!provider) {
        diagnostics.warn("RequestPipeline", `Provider "${providerKey}" is not registered in ProviderPool. Skipping.`);
        failedKeys.add(modelKey);
        failedKeys.add(providerKey);
        continue;
      }

      try {
        const cieResult = await runCiePipeline(prompt, tool, provider, systemPrompt, "", settings);

        const { responseText, latencyMs } = await this._executeCandidate({
          candidate: activeCandidate,
          provider,
          cieResult,
          systemPrompt,
          settings,
          isStream: false,
        });

        diagnostics.info("RequestPipeline", `Request completed via ${activeCandidate.displayName} in ${latencyMs}ms.`, {
          provider: providerKey,
          model: activeCandidate.modelId,
          latencyMs,
        });

        return {
          response: responseText,
          modelConfig: activeCandidate,
          cieResult,
          latencyMs: Date.now() - startTime,
        };

      } catch (err) {
        lastError = err;
        failedKeys.add(modelKey);
        failedKeys.add(providerKey);
        diagnostics.warn("RequestPipeline", `Candidate ${activeCandidate.displayName} failed completely. Falling back.`, {
          error: err.message,
          provider: providerKey,
        });
      }
    }
  }

  /**
   * Execute an SSE streaming generation request.
   *
   * Streaming fallback rules (explicit by design):
   *   - No chunks yielded yet → fallback to next candidate is ALLOWED
   *   - Chunks already sent to client → fallback is BLOCKED → terminate gracefully
   *
   * @param {object} params
   * @returns {AsyncGenerator<string>} Streamed response text chunks
   */
  async *executeStream({ prompt, tool = "chat", modelConfig, systemPrompt, settings = {} }) {
    const candidates = fallbackManager.getCandidates(modelConfig);
    const failedKeys = new Set();
    let lastError = null;

    diagnostics.info("RequestPipeline", `Starting streaming request. Primary: ${modelConfig.displayName}. Total candidates: ${candidates.length}.`);

    // Stream path uses the same candidate iterator as executeRequest
    while (true) {
      const activeCandidate = fallbackManager.selectNextCandidate(candidates, failedKeys);

      if (!activeCandidate) {
        if (lastError) throw lastError;
        return;
      }

      const providerKey = activeCandidate.provider;
      const modelKey    = activeCandidate.name || activeCandidate.key || providerKey;

      // Resolve provider from registry — zero hardcoding
      const provider = providerPool.getProvider(providerKey);

      if (!provider || typeof provider.stream !== "function") {
        diagnostics.debug("RequestPipeline", `Provider "${providerKey}" does not support streaming. Skipping.`);
        failedKeys.add(modelKey);
        failedKeys.add(providerKey);
        continue;
      }

      let yieldedAny = false;

      try {
        const cieResult = await runCiePipeline(prompt, tool, provider, systemPrompt, "", settings);

        for await (const chunk of this._executeCandidate({
          candidate: activeCandidate,
          provider,
          cieResult,
          systemPrompt,
          settings,
          isStream: true,
        })) {
          if (chunk) {
            yieldedAny = true;
            yield chunk;
          }
        }

        if (yieldedAny) {
          // Stream completed successfully
          diagnostics.info("RequestPipeline", `Stream completed via ${activeCandidate.displayName}.`);
          return;
        }

        // Provider returned no chunks — try next candidate
        diagnostics.warn("RequestPipeline", `${activeCandidate.displayName} yielded no stream chunks. Trying next candidate.`);
        failedKeys.add(modelKey);
        failedKeys.add(providerKey);

      } catch (err) {
        lastError = err;

        if (yieldedAny) {
          // Chunks already sent to client — cannot switch providers mid-stream
          // Terminate gracefully rather than throwing a mid-stream error when possible
          diagnostics.warn("RequestPipeline", `Stream error after partial yield from ${activeCandidate.displayName}. Cannot fall back mid-stream. Terminating.`, {
            error: err.message,
          });
          throw err;
        }

        // No chunks yet — fallback is allowed
        diagnostics.warn("RequestPipeline", `Stream attempt failed for ${activeCandidate.displayName} before any chunks. Falling back.`, {
          error: err.message,
          provider: providerKey,
        });
        failedKeys.add(modelKey);
        failedKeys.add(providerKey);
      }
    }
  }

  /**
   * Unified execution engine for both streaming and non-streaming paths.
   *
   * For non-streaming (isStream=false):
   *   - Runs retry loop with exponential backoff
   *   - Returns { responseText, latencyMs }
   *
   * For streaming (isStream=true):
   *   - Returns an AsyncGenerator yielding text chunks
   *   - No retry loop (streaming is single-attempt; fallback is handled by executeStream)
   *
   * Health metrics (recordSuccess/recordFailure) are updated here for both paths.
   * No duplicated retry logic. No duplicated health update logic.
   *
   * @param {object} options
   * @param {object} options.candidate - Resolved model config
   * @param {object} options.provider  - Provider implementation from ProviderPool
   * @param {object} options.cieResult - Result from CIE pipeline (contains promptText)
   * @param {string} options.systemPrompt
   * @param {object} options.settings
   * @param {boolean} options.isStream
   * @returns {Promise<{responseText, latencyMs}>|AsyncGenerator<string>}
   */
  _executeCandidate({ candidate, provider, cieResult, systemPrompt, settings, isStream }) {
    return isStream
      ? this._executeStream(candidate, provider, cieResult, systemPrompt, settings)
      : this._executeGenerate(candidate, provider, cieResult, systemPrompt, settings);
  }

  /**
   * Non-streaming generate with retry loop.
   * @private
   */
  async _executeGenerate(candidate, provider, cieResult, systemPrompt, settings) {
    const providerKey = candidate.provider;
    const modelKey    = candidate.name || candidate.key || providerKey;
    const maxRetries  = provider.maxRetries ?? 3;

    let retryCount = 0;
    let lastError  = null;

    while (retryCount <= maxRetries) {
      const attemptStart = Date.now();
      try {
        diagnostics.debug("RequestPipeline", `Attempting generate: ${candidate.displayName} (${providerKey}/${candidate.modelId}) [Attempt ${retryCount + 1}/${maxRetries + 1}]`);

        const responseText = await provider.generate(candidate.modelId, cieResult.promptText, {
          systemPrompt,
          temperature: settings.temperature,
          maxTokens:   settings.maxTokens,
        });

        const latencyMs = Date.now() - attemptStart;
        providerPool.recordSuccess(providerKey, latencyMs);
        providerPool.recordSuccess(modelKey, latencyMs);

        return { responseText, latencyMs };

      } catch (err) {
        lastError = err;
        const attemptLatency = Date.now() - attemptStart;

        diagnostics.warn("RequestPipeline", `Generate attempt failed for ${candidate.displayName}: ${err.message}`, {
          attempt: retryCount + 1,
          latencyMs: attemptLatency,
        });

        providerPool.recordFailure(providerKey, err);
        providerPool.recordFailure(modelKey, err);

        // Context limit: re-run CIE compression then retry
        if (err.type === "CONTEXT_LIMIT" || err.type === "PAYLOAD_TOO_LARGE") {
          diagnostics.info("RequestPipeline", `Context limit hit for ${candidate.displayName}. Compression will be applied on next attempt.`);
          retryCount++;
          continue;
        }

        // Transient error within retry budget
        if (retryManager.isRetryable(err) && retryCount < maxRetries) {
          const delay = retryManager.calculateBackoff(retryCount);
          diagnostics.info("RequestPipeline", `Retrying transient failure in ${delay}ms...`, { attempt: retryCount + 1, delay });
          await retryManager.sleep(delay);
          retryCount++;
          continue;
        }

        // Permanent error or retries exhausted — surface to caller for fallback
        break;
      }
    }

    throw lastError || new Error(`[RequestPipeline] ${candidate.displayName} failed after ${retryCount} retries.`);
  }

  /**
   * Streaming generate — single attempt, yields chunks.
   * Retry is not applied to streams; fallback is handled at executeStream() level.
   * @private
   */
  async *_executeStream(candidate, provider, cieResult, systemPrompt, settings) {
    const providerKey = candidate.provider;
    const modelKey    = candidate.name || candidate.key || providerKey;
    const startTime   = Date.now();

    try {
      diagnostics.debug("RequestPipeline", `Attempting stream: ${candidate.displayName} (${providerKey}/${candidate.modelId})`);

      const stream = provider.stream(candidate.modelId, cieResult.promptText, {
        systemPrompt,
        temperature: settings.temperature,
        maxTokens:   settings.maxTokens,
      });

      let chunkCount = 0;
      for await (const chunk of stream) {
        if (chunk) {
          chunkCount++;
          yield chunk;
        }
      }

      const latencyMs = Date.now() - startTime;
      providerPool.recordSuccess(providerKey, latencyMs);
      providerPool.recordSuccess(modelKey, latencyMs);

      diagnostics.debug("RequestPipeline", `Stream finished for ${candidate.displayName}. Chunks: ${chunkCount}, Latency: ${latencyMs}ms.`);

    } catch (err) {
      providerPool.recordFailure(providerKey, err);
      providerPool.recordFailure(modelKey, err);
      throw err;
    }
  }
}

export const requestPipeline = new RequestPipeline();
