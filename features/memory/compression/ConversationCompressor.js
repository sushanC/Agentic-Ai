import { askAI } from "../../../services/ai.js";
import { buildPrompt } from "../../../services/cie/PromptBuilder.js";
import { loadHistory, saveHistory } from "../../../storage/historyStorage.js";
import { loadSummary, saveSummary } from "../../../storage/summaryStorage.js";

/**
 * ConversationCompressor.js
 *
 * Implements rolling conversation summarization and context compression
 * to prevent unlimited conversation growth.
 */
export class ConversationCompressor {
  /**
   * Compress conversation history if message count exceeds threshold.
   *
   * @param {number} [maxMessages=15]
   * @returns {Promise<{compressed: boolean, summary: string}>}
   */
  async compressIfNeeded(maxMessages = 15) {
    const history = await loadHistory();
    const summaryData = await loadSummary();
    const existingSummary = summaryData?.summary || (typeof summaryData === "string" ? summaryData : "");

    if (!history || history.length < maxMessages) {
      return { compressed: false, summary: existingSummary };
    }
    const prompt = buildPrompt({
      userPrompt: "Create a summary of recent conversation messages.",
      summary: existingSummary,
      history,
      intent: "summary",
    });

    try {
      const newSummary = await askAI(prompt, "chat");
      await saveSummary(newSummary);

      // Keep recent 5 messages as context window after compression
      const retainedHistory = history.slice(-5);
      await saveHistory(retainedHistory);

      return { compressed: true, summary: newSummary };
    } catch (err) {
      console.warn("[ConversationCompressor] Compression failed:", err.message);
      return { compressed: false, summary: existingSummary };
    }
  }
}

export const conversationCompressor = new ConversationCompressor();
