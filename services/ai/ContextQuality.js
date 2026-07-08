
export function calculateContextQuality({
  intent,
  provider,
  memoryKeys,
  rawMemory,
  historyCount,
  rawHistory,
  summarySize,
  rawSummary,
  estimatedTokens,
  maxBudget,
  compressionApplied
}) {
  let memoryScore = 1.0;
  if (rawMemory) {
    const rawMemoryKeys = Object.keys(rawMemory || {});
    if (rawMemoryKeys.length > 0) {
      memoryScore = memoryKeys.length / rawMemoryKeys.length;
    }
  }

  let historyScore = 1.0;
  const preferredHistory = provider.preferredHistoryLength || 5;
  if (rawHistory && rawHistory.length > 0) {
    historyScore = historyCount / Math.min(rawHistory.length, preferredHistory);
  }

  let summaryScore = 1.0;
  if (rawSummary && rawSummary.length > 0) {
    summaryScore = summarySize / rawSummary.length;
  }

  let tokenUtilization = 1.0;
  if (maxBudget && maxBudget > 0) {
    tokenUtilization = Math.min(estimatedTokens / maxBudget, 1.0);
  }

  const completeness = compressionApplied ? 0.8 : 1.0;

  const score = (
    memoryScore * 0.2 +
    historyScore * 0.2 +
    summaryScore * 0.2 +
    tokenUtilization * 0.2 +
    completeness * 0.2
  );

  return Math.round(score * 100);
}
