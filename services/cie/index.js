import { detectIntent, detectIntentFull } from "./IntentDetector.js";
import { retrieveRelevantMemory } from "./MemoryRetriever.js";
import { getDynamicHistory } from "./HistoryManager.js";
import { getCompressedSummary } from "./SummaryManager.js";
import { optimizeContext } from "./TokenBudgetManager.js";
import { buildPrompt } from "./PromptBuilder.js";
import { buildSummaryContext } from "./SummaryContextBuilder.js";
import { emitDevEvent } from "../developerBridge.js";

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
  settings = {}
) {
  // 1. Intent Detection
  const intent = await detectIntent(prompt, tool, settings);

  // 2. Memory Retrieval
  const memory = await retrieveRelevantMemory(prompt, intent, settings);

  // 3. History Selection
  const history = await getDynamicHistory(intent, settings);

  // 4. Summary Compression
  const summary = await getCompressedSummary(intent, settings);

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
      scores:     memory?._scores || {},
      injected:   optimizationResult.memoryKeys || [],
      rawMemory:  memory || {}
    });

    emitDevEvent('PromptBuilt', {
      systemPrompt,
      memoryBlock:  memory && Object.keys(memory).length > 0
        ? `User Profile:\n\n${JSON.stringify(memory, null, 2)}`
        : "",
      summaryBlock: summary || "",
      historyBlock: history && history.length > 0
        ? history.map(m => `${m.role}: ${m.content}`).join("\n")
        : "",
      pdfContext:   pdfContext || "",
      finalPrompt:  optimizationResult.promptText,
      estimatedTokens: optimizationResult.estimatedTokens,
      tokenBreakdown: optimizationResult.tokenBreakdown,
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
