import { buildPrompt } from "./PromptBuilder.js";

export function optimizeContext({
  provider,
  systemPrompt = "",
  userPrompt,
  memory = {},
  history = [],
  summary = "",
  pdfContext = "",
  settings = {}
}) {
  const safetyMargin = settings.tokenSafetyMargin ?? 0.1; // Default 10% safety margin
  
  // Budget is the minimum of the preferred context size and the safety-capped maximum context window
  const maxBudget = Math.min(
    provider.preferredContextSize || provider.maxContext,
    provider.maxContext * (1 - safetyMargin)
  );

  let currentMemory = { ...memory };
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
      pdfContext
    });

    const totalText = (systemPrompt ? systemPrompt + "\n\n" : "") + promptText;
    const estimatedTokens = provider.estimateTokens(totalText);

    if (estimatedTokens <= maxBudget) {
      return {
        promptText,
        estimatedTokens,
        memoryKeys: Object.keys(currentMemory),
        historyCount: currentHistory.length,
        summarySize: currentSummary ? currentSummary.length : 0,
        compressionApplied: iterations > 0
      };
    }

    // Budget exceeded! Reduce context in order:
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

    // 3. Reduce memory (remove the last key, which is the least relevant)
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
  const finalPromptText = buildPrompt({ userPrompt, pdfContext });
  const totalText = (systemPrompt ? systemPrompt + "\n\n" : "") + finalPromptText;
  
  return {
    promptText: finalPromptText,
    estimatedTokens: provider.estimateTokens(totalText),
    memoryKeys: [],
    historyCount: 0,
    summarySize: 0,
    compressionApplied: true
  };
}
