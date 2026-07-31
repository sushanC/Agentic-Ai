import { memoryManager } from "../../features/memory/index.js";
import { getRecentHistory } from "../../features/chat/index.js";
import { loadSummary } from "../../storage/summaryStorage.js";
import { loadPDFMemory } from "../../features/pdf/index.js";

/**
 * ContextAssembly.js
 *
 * Assembles conversation context, user memory profile, PDF context, and execution metadata
 * for prompt generation, token estimation, and tool routing.
 */
export class ContextAssembly {
  /**
   * Assemble all context sources in parallel via MemoryManager.
   *
   * @param {string} prompt - User request
   * @param {object} [options]
   * @param {number} [options.historyLimit=10]
   * @returns {Promise<object>} Combined context object
   */
  static async assembleContext(prompt, options = {}) {
    const historyLimit = options.historyLimit ?? 10;

    try {
      const [memory, history, summaryObj, pdfMemory] = await Promise.all([
        memoryManager.retrieve(prompt).catch(() => ({})),
        getRecentHistory(historyLimit).catch(() => []),
        loadSummary().catch(() => ({})),
        loadPDFMemory().catch(() => ({}))
      ]);

      const summary = summaryObj?.summary || "";

      return {
        prompt,
        memory,
        history,
        summary,
        pdfMemory,
        assembledAt: new Date().toISOString()
      };
    } catch (err) {
      console.error("[ContextAssembly] Error assembling context:", err.message);
      return {
        prompt,
        memory: {},
        history: [],
        summary: "",
        pdfMemory: {},
        assembledAt: new Date().toISOString()
      };
    }
  }

  /**
   * Find best matching PDF by keyword overlap.
   *
   * @param {string} question
   * @returns {Promise<string|null>} Best matching PDF name or null
   */
  static async findBestPDF(question) {
    try {
      const memory = await loadPDFMemory();
      const pdfNames = Object.keys(memory || {});

      if (pdfNames.length === 0) return null;
      if (pdfNames.length === 1) return pdfNames[0];

      const qWords = new Set(
        (question || "").toLowerCase().split(/\W+/).filter(w => w.length > 3)
      );

      let bestName = pdfNames[0];
      let bestScore = 0;

      for (const name of pdfNames) {
        const nameWords = name
          .toLowerCase()
          .replace(/[_\-\.]/g, " ")
          .split(/\W+/)
          .filter(w => w.length > 3);

        let score = 0;
        for (const w of nameWords) {
          if (qWords.has(w)) score++;
        }

        if (score > bestScore) {
          bestScore = score;
          bestName = name;
        }
      }

      return bestName;
    } catch (err) {
      console.error("[ContextAssembly] Error finding best PDF:", err.message);
      return null;
    }
  }
}
