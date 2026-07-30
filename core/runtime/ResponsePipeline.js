import { cleanResponse } from "../../services/responseCleaner.js";
import { sanitizeForVoice } from "../../features/voice/voiceResponseSanitizer.js";
import { preprocessForTTS } from "../../features/voice/ttsSpeechPreprocessor.js";
import { diagnostics } from "./Diagnostics.js";

/**
 * ResponsePipeline.js
 *
 * Standardized output normalization and formatting layer.
 * Processes raw provider outputs into clean Markdown for Chat Mode
 * or speech-preprocessed text for Voice Mode.
 */
export class ResponsePipeline {
  /**
   * Process and normalize provider output.
   *
   * @param {string} rawText - Raw provider output text
   * @param {object} [options]
   * @param {string} [options.toolContext="chat"] - Tool context identifier ("chat", "voice", etc.)
   * @returns {string} Processed response text
   */
  process(rawText, options = {}) {
    if (!rawText || typeof rawText !== "string") return "";

    const toolContext = options.toolContext || "chat";

    if (toolContext === "voice") {
      diagnostics.debug("ResponsePipeline", "Formatting response for Voice Mode (spoken-first)");
      const sanitized = sanitizeForVoice(rawText);
      const preprocessed = preprocessForTTS(sanitized);
      return preprocessed;
    }

    // Standard Chat Mode output cleaning (collapses excessive blank lines, preserves Markdown)
    diagnostics.debug("ResponsePipeline", "Formatting response for Chat Mode (Markdown preserved)");
    return cleanResponse(rawText);
  }
}

export const responsePipeline = new ResponsePipeline();
