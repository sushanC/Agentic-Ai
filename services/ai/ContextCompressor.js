import { buildPrompt }
from "../cie/index.js";

export function compressContext(cieResult, provider, userPrompt, systemPrompt, pdfContext) {
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