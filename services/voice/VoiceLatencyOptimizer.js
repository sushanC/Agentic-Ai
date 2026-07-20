/**
 * VoiceLatencyOptimizer.js
 *
 * Provides smart intent shortcuts and memory extraction optimization for Voice Mode.
 *
 * Requirements:
 * 1. Smart Intent Shortcuts:
 *    Common voice requests ("Hello", "Hi", "Good Morning", "How are you", "Thank You",
 *    "Bye", "Yes", "No", "Stop", "Cancel", "Continue") bypass heavy context retrieval
 *    (e.g., semantic memory search & full history loading) while still going through
 *    CIE -> Tool Router -> MSE -> Model.
 *
 * 2. Memory Extraction Bypass:
 *    Do NOT perform memory extraction for greetings, small talk, simple acknowledgements,
 *    and conversation control commands. Only extract memory when meaningful information
 *    can actually be stored.
 */

const SHORTCUT_PHRASES = new Set([
  "hello", "hi", "hey", "good morning", "good afternoon", "good evening",
  "how are you", "thank you", "thanks", "bye", "goodbye",
  "yes", "no", "stop", "cancel", "continue", "ok", "okay", "sure"
]);

/**
 * Check if the text matches a smart intent shortcut.
 * @param {string} text
 * @returns {boolean}
 */
export function isShortcutQuery(text) {
  if (!text) return false;
  const cleaned = text.toLowerCase().replace(/[^\w\s]/g, "").trim();
  return SHORTCUT_PHRASES.has(cleaned);
}

/**
 * Determine if memory extraction should run for a given user message.
 * Memory extraction should ONLY run when user is stating a personal fact,
 * preference, or explicit instruction ("my name is...", "i like...", "remember...").
 *
 * @param {string} text
 * @returns {boolean}
 */
export function shouldExtractMemory(text) {
  if (!text) return false;
  
  // 1. Skip greetings, small talk, acknowledgements, control commands
  if (isShortcutQuery(text)) return false;

  const lower = text.toLowerCase().trim();

  // 2. Explicit triggers
  if (lower.startsWith("remember") || lower.startsWith("my name is") || lower.includes("i prefer") || lower.includes("i like")) {
    return true;
  }

  // 3. Skip short generic sentences under 4 words without memory keywords
  const words = lower.split(/\s+/);
  if (words.length < 4) {
    const memoryKeywords = ["name", "email", "address", "phone", "favorite", "hate", "love", "work", "job", "live"];
    const hasMemoryWord = memoryKeywords.some(w => lower.includes(w));
    if (!hasMemoryWord) {
      return false;
    }
  }

  return true;
}

/**
 * Get CIE context optimization settings for a voice query.
 * If shortcut query, disables semantic memory search and heavy context loading.
 *
 * @param {string} text
 * @returns {object} CIE optimization flags
 */
export function getVoiceCieOptions(text) {
  const isShortcut = isShortcutQuery(text);
  if (isShortcut) {
    return {
      includeMemory: false,
      includeSummary: false,
      historyLimit: 2,
      fastPath: true
    };
  }

  return {
    includeMemory: true,
    includeSummary: true,
    historyLimit: 5,
    fastPath: false
  };
}
