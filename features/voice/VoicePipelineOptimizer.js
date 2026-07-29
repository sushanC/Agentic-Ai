/**
 * VoicePipelineOptimizer.js
 *
 * Handles streaming AI response processing and sentence-level parallel TTS synthesis.
 * Enables low-latency audio playback (playback starts as soon as sentence 1 completes generation).
 */

import { generateTTS } from "./ttsService.js";

export class VoicePipelineOptimizer {
  constructor(voiceQueue, settings = {}) {
    this.queue = voiceQueue;
    this.settings = settings;
    this.synthesizedSet = new Set();
    this.isCancelled = false;
  }

  reset() {
    this.synthesizedSet.clear();
    this.isCancelled = false;
  }

  cancel() {
    this.isCancelled = true;
    this.synthesizedSet.clear();
  }

  /**
   * Process a text stream from LLM and synthesize/queue sentences as they arrive.
   *
   * @param {AsyncIterable<string>} textStream - Stream of text chunks
   * @param {object} options
   * @param {function} onFirstSentenceSynthesized - Callback when first sentence TTS is queued
   * @returns {Promise<string>} Full response text assembled
   */
  async processAndStreamResponse(textStream, options = {}, onFirstSentenceSynthesized = null) {
    this.reset();
    let buffer = "";
    let fullText = "";
    let firstSentenceDone = false;

    // Sentence boundary regex: match ending punctuation followed by space or end
    const sentenceRegex = /([^.!?]+[.!?]+)(\s|$)/g;

    const synthesizeSentence = async (sentenceText) => {
      const trimmed = sentenceText.replace(/\*\*|__/g, "").replace(/`/g, "").trim();
      if (!trimmed || this.synthesizedSet.has(trimmed) || this.isCancelled) {
        return;
      }

      this.synthesizedSet.add(trimmed);

      try {
        const audioFile = await generateTTS(trimmed, {
          voiceSelection: options.voiceSelection || this.settings?.voiceSelection || "en-IN-NeerjaNeural",
          speechSpeed: options.speechSpeed || this.settings?.speechSpeed || "+0%",
          speechPitch: options.speechPitch || this.settings?.speechPitch || "+0Hz",
          speechVolume: options.speechVolume || this.settings?.speechVolume || "+0%"
        });

        if (!this.isCancelled) {
          this.queue.enqueue(audioFile);
          if (!firstSentenceDone && onFirstSentenceSynthesized) {
            firstSentenceDone = true;
            onFirstSentenceSynthesized();
          }
        }
      } catch (err) {
        console.error("[VoicePipelineOptimizer] TTS synthesis error for sentence:", trimmed, err);
      }
    };

    for await (const chunk of textStream) {
      if (this.isCancelled) break;

      const content = typeof chunk === "string" ? chunk : (chunk?.choices?.[0]?.delta?.content || "");
      if (!content) continue;

      buffer += content;
      fullText += content;

      let match;
      let lastIndex = 0;

      while ((match = sentenceRegex.exec(buffer)) !== null) {
        const sentence = match[1];
        lastIndex = sentenceRegex.lastIndex;
        synthesizeSentence(sentence);
      }

      if (lastIndex > 0) {
        buffer = buffer.slice(lastIndex);
        sentenceRegex.lastIndex = 0;
      }
    }

    if (buffer.trim() && !this.isCancelled) {
      await synthesizeSentence(buffer);
    }

    return fullText;
  }
}
