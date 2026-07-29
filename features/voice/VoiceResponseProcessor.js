import { sanitizeForVoice } from "./voiceResponseSanitizer.js";
import { preprocessForTTS, splitIntoSentences } from "./ttsSpeechPreprocessor.js";

/**
 * VoiceResponseProcessor.js
 *
 * Facade coordinating AI response sanitization and TTS speech preprocessing.
 * Serves as the single entry point for preparing AI text output for speech synthesis.
 */
export class VoiceResponseProcessor {
  /**
   * Sanitize and preprocess raw AI response text into clean, speech-friendly text.
   *
   * @param {string} reply - Raw AI response text (may contain Markdown, code fences, emoji)
   * @returns {string} Clean, normalized text ready for TTS synthesis
   */
  process(reply) {
    if (!reply || typeof reply !== "string") return "";

    // 1. Strip Markdown syntax, code blocks, headings, lists, tables, and emoji
    const sanitized = sanitizeForVoice(reply);

    // 2. Expand technical acronyms, symbols, numbers, and normalize punctuation
    const preprocessed = preprocessForTTS(sanitized);

    return preprocessed;
  }

  /**
   * Split processed response text into sentence-level chunks for low-latency TTS streaming.
   *
   * @param {string} text - Clean preprocessed text
   * @returns {string[]} Array of sentence chunks
   */
  split(text) {
    const sentences = splitIntoSentences(text);
    return sentences.length > 0 ? sentences : (text ? [text] : []);
  }
}

// Global singleton instance
export const voiceResponseProcessor = new VoiceResponseProcessor();
