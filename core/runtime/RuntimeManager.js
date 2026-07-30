import { requestPipeline } from "./RequestPipeline.js";
import { responsePipeline } from "./ResponsePipeline.js";
import { providerPool } from "./ProviderPool.js";
import { circuitBreaker } from "./CircuitBreaker.js";
import { retryManager } from "./RetryManager.js";
import { fallbackManager } from "./FallbackManager.js";
import { recoveryScheduler } from "./RecoveryScheduler.js";
import { diagnostics } from "./Diagnostics.js";
import { decideModel } from "../routing/ModelRouter.js";
import { SYSTEM_PROMPT } from "../../services/systemPrompt.js";
import { VOICE_SYSTEM_PROMPT } from "../../features/voice/voiceSystemPrompt.js";
import { loadSettings } from "../../features/settings/index.js";
import { resolveModel } from "../registry/ModelRegistry.js";

/**
 * RuntimeManager.js
 *
 * Single orchestrator for every AI request in the application.
 * Manages request lifecycle, provider selection, retries, fallback, recovery, and diagnostics.
 * Serves as the Production Runtime Reliability Layer for Chat, Voice, Desktop, and Agent workflows.
 */
export class RuntimeManager {
  constructor() {
    this.requestPipeline = requestPipeline;
    this.responsePipeline = responsePipeline;
    this.pool = providerPool;
    this.circuit = circuitBreaker;
    this.retry = retryManager;
    this.fallback = fallbackManager;
    this.recovery = recoveryScheduler;
    this.diagnostics = diagnostics;
  }

  /**
   * Execute an AI request through the Production Runtime Reliability Layer.
   *
   * @param {object} params
   * @param {string} params.prompt - User message prompt
   * @param {string} [params.tool="chat"] - Tool context identifier ("chat", "voice", etc.)
   * @param {string} [params.model] - Explicit model key or "auto"
   * @param {string} [params.systemPromptOverride] - System prompt override
   * @returns {Promise<{answer: string, modelUsed: object, latencyMs: number, cieResult: object}>}
   */
  async execute(params = {}) {
    const { prompt, tool = "chat", model, systemPromptOverride } = params;

    if (!prompt) throw new Error("RuntimeManager: Prompt cannot be empty.");

    const settings = await loadSettings();
    const isVoiceMode = tool === "voice";
    const effectiveSystemPrompt = systemPromptOverride || (isVoiceMode ? VOICE_SYSTEM_PROMPT : SYSTEM_PROMPT);

    let modelConfig;
    if (model && model !== "auto") {
      modelConfig = resolveModel(model.toLowerCase());
    } else {
      modelConfig = await decideModel(prompt, tool, settings.capabilityRoutes || {}, {}, settings);
    }

    this.diagnostics.info("RuntimeManager", `Starting request execution for tool "${tool}" with primary model ${modelConfig.displayName}`);

    const result = await this.requestPipeline.executeRequest({
      prompt,
      tool,
      modelConfig,
      systemPrompt: effectiveSystemPrompt,
      settings
    });

    const formattedAnswer = this.responsePipeline.process(result.response, { toolContext: tool });

    this.diagnostics.info("RuntimeManager", `Execution finished in ${result.latencyMs}ms using model ${result.modelConfig.displayName}`);

    return {
      answer: formattedAnswer,
      modelUsed: result.modelConfig,
      latencyMs: result.latencyMs,
      cieResult: result.cieResult
    };
  }

  /**
   * Execute an SSE streaming request through the Production Runtime Reliability Layer.
   *
   * @param {object} params
   * @returns {Promise<AsyncGenerator<string>>}
   */
  async executeStream(params = {}) {
    const { prompt, tool = "chat", model, systemPromptOverride } = params;

    const settings = await loadSettings();
    const isVoiceMode = tool === "voice";
    const effectiveSystemPrompt = systemPromptOverride || (isVoiceMode ? VOICE_SYSTEM_PROMPT : SYSTEM_PROMPT);

    let modelConfig;
    if (model && model !== "auto") {
      modelConfig = resolveModel(model.toLowerCase());
    } else {
      modelConfig = await decideModel(prompt, tool, settings.capabilityRoutes || {}, {}, settings);
    }

    this.diagnostics.info("RuntimeManager", `Starting streaming execution for tool "${tool}" with primary model ${modelConfig.displayName}`);

    return this.requestPipeline.executeStream({
      prompt,
      tool,
      modelConfig,
      systemPrompt: effectiveSystemPrompt,
      settings
    });
  }

  /**
   * Get full live state for a provider or model.
   * @param {string} key
   */
  getState(key) {
    return this.pool.getState(key);
  }
}

export const runtimeManager = new RuntimeManager();
