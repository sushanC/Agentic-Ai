import { calculateContextQuality } from "./ContextQuality.js";

import { emitDevEvent }
from "../developerBridge.js";

import { endRequest }
from "../developerBridge.js";

export function logRequest({
  intent,
  memoryKeys = [],
  rawMemory = {},
  historyCount = 0,
  rawHistory = [],
  summaryLevel = "None",
  summarySize = 0,
  rawSummary = "",
  estimatedTokens = 0,
  compressionApplied = false,
  finalPromptSize = 0,
  providerName,
  modelDisplayName,
  latencyMs,
  fallbackOccurred = false,
  retryCount = 0,
  provider,
  maxBudget,
  tokenBreakdown = {},
  healthScore = null,
  fallbackChain = []
}) {
  const latencyStr = (latencyMs / 1000).toFixed(2) + " s";
  const memoryKeysStr = memoryKeys.length > 0 ? memoryKeys.join(", ") : "None";

  // Extract memory relevance scores
  const scoresMap = rawMemory ? (rawMemory._scores || {}) : {};
  const scoresStr = Object.entries(scoresMap)
    .map(([k, v]) => `${k} (${v.toFixed(2)})`)
    .join(", ") || "None";

  // Context percentage
  const contextPct = provider?.maxContext
    ? ((estimatedTokens / provider.maxContext) * 100).toFixed(2) + "%"
    : "N/A";
  const remaining = provider?.maxContext
    ? (provider.maxContext - estimatedTokens).toLocaleString()
    : "N/A";

  // Calculate Context Quality Score
  const qualityScore = calculateContextQuality({
    intent, provider, memoryKeys, rawMemory, historyCount, rawHistory,
    summarySize, rawSummary, estimatedTokens, maxBudget, compressionApplied
  });

  const {
    systemTokens = 0,
    memoryTokens = 0,
    historyTokens = 0,
    summaryTokens = 0,
    pdfTokens = 0,
    userTokens = 0,
  } = tokenBreakdown;

  const healthStr = healthScore !== null ? `${(healthScore * 100).toFixed(0)}%` : "N/A";
  const fallbackStr = fallbackOccurred
    ? (fallbackChain.length > 0 ? fallbackChain.join(" → ") : "Yes")
    : "No";

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Intent           : ${intent}`);
  console.log(`  Provider         : ${providerName} (${modelDisplayName})`);
  console.log(`  Provider Health  : ${healthStr}`);
  console.log(`  Memory Keys      : ${memoryKeysStr}`);
  console.log(`  Memory Relevance : ${scoresStr}`);
  console.log(`  History Msgs     : ${historyCount}`);
  console.log(`  Summary Mode     : ${summaryLevel}`);
  console.log("  ─────────────────────────────────────────────────────────");
  console.log(`  Prompt           : ${finalPromptSize.toLocaleString()} chars`);
  console.log(`  Estimated Tokens : ${estimatedTokens.toLocaleString()}`);
  console.log(`    ├─ System      : ${systemTokens}`);
  console.log(`    ├─ Memory      : ${memoryTokens}`);
  console.log(`    ├─ History     : ${historyTokens}`);
  console.log(`    ├─ Summary     : ${summaryTokens}`);
  console.log(`    ├─ PDF         : ${pdfTokens}`);
  console.log(`    └─ User        : ${userTokens}`);
  console.log(`  Context %        : ${contextPct}`);
  console.log(`  Remaining        : ${remaining}`);
  console.log("  ─────────────────────────────────────────────────────────");
  console.log(`  Compression      : ${compressionApplied ? "Yes" : "No"}`);
  console.log(`  Retry Count      : ${retryCount}`);
  console.log(`  Fallback         : ${fallbackStr}`);
  console.log(`  Context Quality  : ${qualityScore}%`);
  console.log(`  Latency          : ${latencyStr}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // ── Developer Console event (additive — console.log above is unchanged) ─
  emitDevEvent('FullRequestSummary', {
    intent,
    provider:           providerName,
    model:              modelDisplayName,
    latencyMs,
    retryCount,
    fallbackOccurred,
    fallbackChain,
    compressionApplied,
    contextQuality:     qualityScore,
    estimatedTokens,
    tokenBreakdown:     { systemTokens, memoryTokens, historyTokens, summaryTokens, pdfTokens, userTokens },
    contextPct,
    budgetRemaining:    provider?.maxContext ? provider.maxContext - estimatedTokens : null,
    success:            true,  // logCieUsage is only called on success paths
    memoryDetails: {
      keys:       memoryKeys,
      scores:     scoresMap,
      injected:   memoryKeys,
      rawMemory:  rawMemory,
    },
    healthScore,
  });
  endRequest();
}