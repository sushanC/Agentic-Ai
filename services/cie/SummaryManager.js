import { loadSummary } from "../../storage/summaryStorage.js";
import { getContextConfig } from "./ContextManager.js";
import { resolveModel } from "../modelRegistry.js";
import { groqProvider } from "../providers/groqProvider.js";
import { cleanResponse } from "../responseCleaner.js";

async function compressSummary(summaryText, maxLength) {
  const modelConfig = resolveModel("groq");
  const prompt = `Compress the following conversation summary to be under ${maxLength} characters. Keep only the most critical information (user name, active goals, core tech stack, and recent topics). Do not add any conversational filler or introductions.

Summary:
${summaryText}`;

  try {
    const response = await groqProvider.generate(modelConfig.modelId, prompt, {
      systemPrompt: "You are a precise context summarizer. Respond only with the compressed summary."
    });
    return cleanResponse(response).trim();
  } catch (err) {
    console.error("⚠️ Summary compression via Groq failed, falling back to truncation:", err.message);
    return summaryText.slice(0, maxLength) + "...";
  }
}

export async function getCompressedSummary(intent, settings = {}) {
  const config = getContextConfig(intent);
  const level = config.summaryLevel;

  if (level === "None") {
    return "";
  }

  const rawSummaryObj = await loadSummary();
  let summaryText = rawSummaryObj?.summary || "";
  if (!summaryText || !summaryText.trim()) {
    return "";
  }

  // Target lengths in characters
  const targetLengths = {
    Short: 250,
    Medium: 600,
    Long: 1500
  };

  let maxLength = targetLengths[level] || 600;
  if (settings.maxSummaryLength !== undefined) {
    maxLength = Math.min(maxLength, settings.maxSummaryLength);
  }

  if (summaryText.length <= maxLength) {
    return summaryText;
  }

  console.log(`[Summary Manager] Summary size (${summaryText.length} chars) exceeds tier limit (${maxLength} chars). Compressing...`);
  return await compressSummary(summaryText, maxLength);
}
