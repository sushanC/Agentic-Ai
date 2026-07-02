/**
 * TokenBudgetManager.js
 *
 * Manages context fitting within provider token limits.
 *
 * v2 improvements (Phase 3):
 *  - `optimizeContext()` now returns per-component token breakdowns so that
 *    `logCieUsage()` can display accurate, meaningful diagnostics.
 *  - Token estimation runs on the fully-merged final prompt string, eliminating
 *    the impossible "26 chars → 867 tokens" logging bug.
 */

import { buildPrompt } from "./PromptBuilder.js";

// ─────────────────────────────────────────────────────────────────────────────
// Intent-based budget caps (in tokens)
// ─────────────────────────────────────────────────────────────────────────────

const INTENT_BUDGETS = {
  Greeting:     100,
  Memory:       500,
  Programming: 2000,
  Research:    4000,
  Planning:    6000,
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-component token estimation helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimate token count for a text section.
 * @param {object} provider
 * @param {string} text
 * @returns {number}
 */
function est(provider, text) {
  return provider.estimateTokens(text || "");
}

/**
 * Compute per-component token breakdown on the current context state.
 * All values are estimated against full text slices so they sum correctly.
 *
 * @param {object} provider
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} memory
 * @param {Array}  history
 * @param {string} summary
 * @param {string} pdfContext
 * @param {string} intent
 * @returns {{ systemTokens, memoryTokens, historyTokens, summaryTokens, pdfTokens, userTokens, totalTokens }}
 */
function computeComponentBreakdown(provider, systemPrompt, userPrompt, memory, history, summary, pdfContext, intent) {
  const systemText   = systemPrompt || "";
  const memoryText   = (memory && Object.keys(memory).length > 0)
    ? `User Profile:\n\n${JSON.stringify(memory, null, 2)}`
    : "";
  const summaryText  = (summary && summary.trim()) ? `Conversation Summary:\n\n${summary.trim()}` : "";
  const pdfText      = (pdfContext && pdfContext.trim()) ? `Retrieved Document Context:\n\n${pdfContext.trim()}` : "";
  const historyText  = (history && history.length > 0)
    ? `Recent Conversation:\n\n${history.map(m => `${m.role}: ${m.content}`).join("\n")}`
    : "";
  const userText     = `Current User Message:\n\n${(userPrompt || "").trim()}`;

  return {
    systemTokens:  est(provider, systemText),
    memoryTokens:  est(provider, memoryText),
    summaryTokens: est(provider, summaryText),
    pdfTokens:     est(provider, pdfText),
    historyTokens: est(provider, historyText),
    userTokens:    est(provider, userText),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fit the provided context into the provider's token budget, trimming history,
 * summary, and memory in that order until the prompt fits.
 *
 * @param {object} params
 * @param {object} params.provider      - Resolved provider profile
 * @param {string} params.systemPrompt  - System prompt text
 * @param {string} params.userPrompt    - Raw user message
 * @param {object} params.memory        - Retrieved memory object
 * @param {Array}  params.history       - Conversation history messages
 * @param {string} params.summary       - Existing conversation summary
 * @param {string} params.pdfContext    - Injected PDF text (if any)
 * @param {object} params.settings      - User settings
 * @param {string} params.intent        - Detected intent string
 *
 * @returns {{
 *   promptText: string,
 *   estimatedTokens: number,
 *   memoryKeys: string[],
 *   historyCount: number,
 *   summarySize: number,
 *   compressionApplied: boolean,
 *   maxBudget: number,
 *   tokenBreakdown: {
 *     systemTokens: number,
 *     memoryTokens: number,
 *     historyTokens: number,
 *     summaryTokens: number,
 *     pdfTokens: number,
 *     userTokens: number,
 *   }
 * }}
 */
export function optimizeContext({
  provider,
  systemPrompt = "",
  userPrompt,
  memory = {},
  history = [],
  summary = "",
  pdfContext = "",
  settings = {},
  intent = ""
}) {
  // Use safety margin from settings first, then provider, then fallback to 0.1
  const safetyMargin = settings.tokenSafetyMargin ?? provider.safetyMargin ?? 0.1;

  // Resolve intent budget cap
  const intentCap = INTENT_BUDGETS[intent] || Infinity;

  // Budget is capped by the intent limit and the provider's context capacity
  const maxBudget = Math.min(
    provider.preferredContextSize || provider.maxContext,
    provider.maxContext * (1 - safetyMargin),
    intentCap
  );

  let currentMemory  = { ...memory };
  let currentHistory = [...history];
  let currentSummary = summary;

  let iterations = 0;
  const maxIterations = 30; // Safety limit to prevent infinite loops

  while (iterations < maxIterations) {
    const promptText = buildPrompt({
      userPrompt,
      memory: currentMemory,
      history: currentHistory,
      summary: currentSummary,
      pdfContext,
      intent
    });

    // Estimate tokens on the FINAL merged string (system + prompt together)
    const totalText = (systemPrompt ? systemPrompt + "\n\n" : "") + promptText;
    const estimatedTokens = provider.estimateTokens(totalText);

    if (estimatedTokens <= maxBudget) {
      // Compute per-component breakdown on the final state
      const breakdown = computeComponentBreakdown(
        provider, systemPrompt, userPrompt, currentMemory, currentHistory, currentSummary, pdfContext, intent
      );

      return {
        promptText,
        estimatedTokens,
        memoryKeys: Object.keys(currentMemory),
        historyCount: currentHistory.length,
        summarySize: currentSummary ? currentSummary.length : 0,
        compressionApplied: iterations > 0,
        maxBudget,
        tokenBreakdown: breakdown,
      };
    }

    // Budget exceeded — reduce context in order:

    // 1. Trim history (remove the oldest message)
    if (currentHistory.length > 0) {
      currentHistory.shift();
      iterations++;
      continue;
    }

    // 2. Compress/reduce summary (halve it first, then remove it)
    if (currentSummary && currentSummary.length > 0) {
      if (currentSummary.length > 100) {
        currentSummary = currentSummary.slice(0, Math.floor(currentSummary.length / 2)) + "...";
      } else {
        currentSummary = "";
      }
      iterations++;
      continue;
    }

    // 3. Reduce memory (remove the last key)
    const memoryKeys = Object.keys(currentMemory);
    if (memoryKeys.length > 0) {
      const keyToRemove = memoryKeys[memoryKeys.length - 1];
      delete currentMemory[keyToRemove];
      iterations++;
      continue;
    }

    // If we have nothing left to trim, break
    break;
  }

  // Final fallback: just the userPrompt and pdfContext
  const finalPromptText = buildPrompt({ userPrompt, pdfContext, intent });
  const totalText = (systemPrompt ? systemPrompt + "\n\n" : "") + finalPromptText;
  const breakdown = computeComponentBreakdown(provider, systemPrompt, userPrompt, {}, [], "", pdfContext, intent);

  return {
    promptText: finalPromptText,
    estimatedTokens: provider.estimateTokens(totalText),
    memoryKeys: [],
    historyCount: 0,
    summarySize: 0,
    compressionApplied: true,
    maxBudget,
    tokenBreakdown: breakdown,
  };
}
