import { detectIntent, detectIntentFull } from "./IntentDetector.js";
import { retrieveRelevantMemory } from "./MemoryRetriever.js";
import { getDynamicHistory } from "./HistoryManager.js";
import { getCompressedSummary } from "./SummaryManager.js";
import { optimizeContext } from "./TokenBudgetManager.js";
import { buildPrompt } from "./PromptBuilder.js";
import { buildSummaryContext } from "./SummaryContextBuilder.js";
import { emitDevEvent } from "../developerBridge.js";
import { getCurrentRequestContext } from "../../core/request/RequestContext.js";

export {
  detectIntent,
  detectIntentFull,
  retrieveRelevantMemory,
  getDynamicHistory,
  getCompressedSummary,
  optimizeContext,
  buildPrompt,
  buildSummaryContext
};

// New production hardening modules
export * from "./ProviderErrorClassifier.js";
export * from "./RetryPolicyEngine.js";
export * from "./ProviderHealthManager.js";

/**
 * Orchestrates the entire Context Intelligence Engine (CIE) pipeline.
 *
 * @param {string} prompt - Raw user message/prompt
 * @param {string} tool - The active tool/capability (e.g. "chat", "pdf", "web")
 * @param {object} provider - The resolved provider object
 * @param {string} systemPrompt - The system prompt
 * @param {string} pdfContext - Retrieved PDF context (if applicable)
 * @param {object} settings - User settings
 * @returns {Promise<object>} The optimized context and metadata
 */
export async function runCiePipeline(
  prompt,
  tool,
  provider,
  systemPrompt,
  pdfContext = "",
  settings = {},
  contextSnapshot = null
) {
  // Provider candidates share one request-level retrieval snapshot; only token
  // fitting below varies by provider. Legacy callers may still assemble here.
  const hasSnapshot = contextSnapshot && Object.hasOwn(contextSnapshot, "intent");
  const intent = hasSnapshot ? contextSnapshot.intent : await detectIntent(prompt, tool, settings);
  const [memory, history, summary] = hasSnapshot
    ? [contextSnapshot.memory || {}, contextSnapshot.history || [], contextSnapshot.summary || ""]
    : await Promise.all([
      retrieveRelevantMemory(prompt, intent, settings),
      getDynamicHistory(intent, settings),
      getCompressedSummary(intent, settings),
    ]);

  // 5. Token Budget Management
  const optimizationResult = optimizeContext({
    provider,
    systemPrompt,
    userPrompt: prompt,
    memory,
    history,
    summary,
    pdfContext,
    settings,
    intent
  });

  // ── Developer Console Events ──
  try {
    emitDevEvent('MemoryRetrieved', {
      keys:       Object.keys(memory || {}).filter(k => k !== '_scores'),
      scores:     Object.keys(memory?._scores || {}).length,
      injected:   optimizationResult.memoryKeys || [],
      memoryCount: Object.keys(memory || {}).filter(k => k !== '_scores').length,
      requestId: getCurrentRequestContext()?.requestId || null,
    });

    emitDevEvent('PromptBuilt', {
      systemPromptLength: String(systemPrompt || "").length,
      summaryLength: String(summary || "").length,
      historyCount: Array.isArray(history) ? history.length : 0,
      pdfContextLength: String(pdfContext || "").length,
      finalPromptLength: String(optimizationResult.promptText || "").length,
      estimatedTokens: optimizationResult.estimatedTokens,
      tokenBreakdown: optimizationResult.tokenBreakdown,
      requestId: getCurrentRequestContext()?.requestId || null,
    });
  } catch (err) {
    // Silent fail for developer events
  }

  return {
    intent,
    rawMemory: memory,
    rawHistory: history,
    rawSummary: summary,
    systemPrompt,
    ...optimizationResult
  };
}
