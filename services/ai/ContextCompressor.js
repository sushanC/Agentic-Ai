import { buildPrompt }
from "../cie/index.js";

export function compressContext(cieResult, provider, userPrompt, systemPrompt, pdfContext) {
  if (!provider) {
    throw new Error("compressContext(): provider is required");
}

  let { rawHistory = [], rawSummary = "", rawMemory = {}, historyCount = 0, memoryKeys = [], intent } = cieResult;

  let compressionStage = "none";
if(historyCount>0){

    compressionStage="history";

    rawHistory=rawHistory.slice(1);

    historyCount=rawHistory.length;

} else if (rawSummary && rawSummary.length > 0) {
  compressionStage="summary";
    // 2. Compress summary
    const summaryLimit = provider.preferredSummaryLength ?? 100;
if (rawSummary.length > summaryLimit) {
      rawSummary = rawSummary.slice(0, Math.floor(rawSummary.length / 2)) + "...";
    } else {
      rawSummary = "";
    }
  } else if (memoryKeys && memoryKeys.length > 0) {
    compressionStage="memory";
    // 3. Reduce memory
    const newKeys = memoryKeys.slice(0, -1);
const newMemory = Object.fromEntries(
    newKeys
        .filter(k => rawMemory[k] !== undefined)
        .map(k => [k, rawMemory[k]])
);
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

const totalText =
    systemPrompt
        ? systemPrompt + "\n\n" + promptText
        : promptText;

const estimate =
    provider.estimateTokens ??
    ((text) => Math.ceil(text.length / 4));

const estimatedTokens =
    estimate(totalText);

const tokenReduction =
    (cieResult.estimatedTokens || 0) -
    estimatedTokens;
    
    return {

    ...cieResult,

    rawHistory,

    rawSummary,

    rawMemory,

    historyCount,

    memoryKeys,

    promptText,

    estimatedTokens,

    summarySize:
    rawSummary ? rawSummary.length : 0,

    compressionApplied:
        compressionStage !== "none",

    compressionStage,

    tokenReduction

};
}