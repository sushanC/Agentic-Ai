/**
 * VoiceLatencyOptimizer.js
 *
 * Provides smart intent shortcuts and memory extraction optimization for Voice Mode.
 */

const SHORTCUT_PHRASES = new Set([
  "hello", "hi", "hey", "good morning", "good afternoon", "good evening",
  "how are you", "thank you", "thanks", "bye", "goodbye",
  "yes", "no", "stop", "cancel", "continue", "ok", "okay", "sure"
]);

export function isShortcutQuery(text) {
  if (!text) return false;
  const cleaned = text.toLowerCase().replace(/[^\w\s]/g, "").trim();
  return SHORTCUT_PHRASES.has(cleaned);
}

export function shouldExtractMemory(text) {
  if (!text) return false;
  
  if (isShortcutQuery(text)) return false;

  const lower = text.toLowerCase().trim();

  if (lower.startsWith("remember") || lower.startsWith("my name is") || lower.includes("i prefer") || lower.includes("i like")) {
    return true;
  }

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
