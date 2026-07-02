/**
 * summaryService.js
 *
 * Generates and persists conversation summaries.
 *
 * Phase 5 fix: summary generation now flows through executeWithCie() so it
 * benefits from the full RetryPolicyEngine (compression, retry, fallback).
 * Previously, this called provider.generate() directly with no retry logic.
 */

import {
  loadHistory,
  saveHistory
} from "../storage/chatHistoryStorage.js";

import {
  loadSummary,
  saveSummary
} from "../storage/summaryStorage.js";

import { buildSummaryContext } from "./cie/index.js";
import { resolveModel } from "./modelRegistry.js";
import { executeWithCie } from "./ai.js";
import { cleanResponse } from "./responseCleaner.js";

/** System prompt used for all summary generation requests. */
const SUMMARY_SYSTEM_PROMPT = "You are a precise context summarizer. Respond only with the updated summary.";

/**
 * Generate and persist an updated conversation summary.
 *
 * Triggers when history exceeds 50 messages.
 * After summarization, history is trimmed to the last 20 messages.
 *
 * Uses executeWithCie() so the full retry / compression / fallback pipeline
 * applies automatically — the summary will never silently fail due to a
 * transient provider error or context-size issue.
 */
export async function updateSummary() {
  const history = await loadHistory();

  if (history.length < 50) {
    return;
  }

  // Use Groq for summary — fast and cost-free
  const modelConfig = resolveModel("groq");

  // Resolve the provider from modelConfig
  const { groqProvider } = await import("./providers/groqProvider.js");
  const { googleProvider } = await import("./providers/googleProvider.js");
  const { deepseekProvider } = await import("./providers/deepseekProvider.js");
  const { glmProvider } = await import("./providers/glmProvider.js");
  const { openRouterProvider } = await import("./providers/openRouterProvider.js");
  const { ollamaProvider } = await import("./providers/ollamaProvider.js");

  const providerMap = {
    google: googleProvider,
    groq: groqProvider,
    deepseek: deepseekProvider,
    glm: glmProvider,
    openrouter: openRouterProvider,
    ollama: ollamaProvider,
  };

  const provider = providerMap[modelConfig.provider];

  let summary;

  try {
    // 1. Build the summary context via CIE (intent="summary" path)
    const cieResult = await buildSummaryContext(provider);

    // 2. Execute via executeWithCie so RetryPolicyEngine handles failures
    //    The cieResult already contains the optimized promptText, so we pass
    //    an empty userPrompt and re-use the built promptText directly.
    const result = await executeWithCie({
      prompt: cieResult.promptText,
      tool: "summary",
      provider,
      modelId: modelConfig.modelId,
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      pdfContext: "",
      settings: {}
    });

    summary = cleanResponse(result.response).trim();

  } catch (err) {
    console.log("⚠️ Summary generation failed");
    console.log(err.message);
    return;
  }

  await saveSummary({ summary });

  await saveHistory(
    history.slice(-20)
  );

  console.log("\n📝 SUMMARY UPDATED");
}