import { runCiePipeline } from "./index.js";
import { loadHistory } from "../../features/chat/index.js";
import { loadSummary } from "../../storage/summaryStorage.js";

/**
 * Builds the context prompt for summary generation using the centralized CIE.
 *
 * @param {object} provider - The resolved provider config
 * @param {object} settings - Settings configuration
 * @returns {Promise<object>} - The CIE optimization result
 */
export async function buildSummaryContext(provider, settings = {}) {
  const history = await loadHistory();
  const summaryObj = await loadSummary();
  const summaryText = summaryObj?.summary || "";

  // CIE uses intent 'Summary'. The userPrompt is the current instruction,
  // the history is the conversation messages to summarize,
  // and the summary is the older summary to merge.
  const cieResult = await runCiePipeline(
    "Generate the updated summary.",
    "summary", // maps to Summary intent
    provider,
    "You are a precise context summarizer.",
    "", // pdfContext
    {
      ...settings,
      maxSummaryLength: settings.maxSummaryLength || provider.preferredSummaryLength || 600
    }
  );

  return cieResult;
}
