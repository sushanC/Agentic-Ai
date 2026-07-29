/**
 * voiceResponseSanitizer.js
 *
 * Strips ALL Markdown, formatting symbols, and non-speech content from AI responses
 * before they are sent to the TTS engine.
 *
 * This module is EXCLUSIVELY used in Voice Mode.
 * Chat Mode responses are NEVER processed through this module.
 *
 * Pipeline (applied in order):
 *  1.  Remove fenced code blocks
 *  2.  Remove inline code
 *  3.  Remove ATX headings (#, ##, ###, ####, #####, ######)
 *  4.  Remove bold, italic, strikethrough markers
 *  5.  Remove Markdown links — keep visible text
 *  6.  Remove Markdown image syntax
 *  7.  Remove blockquotes (> text)
 *  8.  Remove horizontal rules
 *  9.  Remove bullet list markers
 *  10. Remove numbered list markers
 *  11. Remove HTML tags
 *  12. Remove emoji and Unicode pictographs
 *  13. Remove table pipe syntax
 *  14. Convert tool result emoji prefixes to natural speech
 *  15. Normalize whitespace and line breaks
 */

// ─────────────────────────────────────────────────────────────────────────────
// Tool result prefix map — convert emoji tool confirmations to natural speech
// ─────────────────────────────────────────────────────────────────────────────
const TOOL_RESULT_MAP = [
  // Task tool
  { pattern: /✅\s*Task added:\s*/gi,              replacement: "I've added the task: " },
  { pattern: /✅\s*/gi,                             replacement: "" },
  // Note tool
  { pattern: /📝\s*Note saved\.?/gi,               replacement: "Done, the note has been saved." },
  { pattern: /📝\s*/gi,                             replacement: "" },
  // Memory tool
  { pattern: /🧠\s*Memory updated:\s*/gi,          replacement: "Noted. " },
  { pattern: /🧠\s*Forgot:\s*/gi,                  replacement: "Done, I've forgotten that. " },
  { pattern: /🧠\s*/gi,                             replacement: "" },
  // Web tool
  { pattern: /🌐\s*/gi,                             replacement: "" },
  // PDF tool
  { pattern: /📄\s*/gi,                             replacement: "" },
  // Agent tool
  { pattern: /🚀\s*/gi,                             replacement: "" },
  // Generic check marks
  { pattern: /✓\s*/gi,                              replacement: "" },
  { pattern: /❌\s*/gi,                             replacement: "There was an issue: " },
  { pattern: /⚠️\s*/gi,                             replacement: "Note: " },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main sanitizer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sanitize an AI response for voice/TTS output.
 *
 * Removes all Markdown, emoji, code blocks, and formatting symbols.
 * Converts tool result prefixes to natural spoken language.
 *
 * @param {string} text - Raw AI response text (may contain Markdown)
 * @returns {string} Clean, speech-friendly text
 */
export function sanitizeForVoice(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;

  // 1. Tool result emoji → natural speech (do first, before emoji removal)
  for (const { pattern, replacement } of TOOL_RESULT_MAP) {
    result = result.replace(pattern, replacement);
  }

  // 2. Remove fenced code blocks (``` ... ```) — replace with spoken placeholder
  result = result.replace(/```[\w]*\n[\s\S]*?```/gm, "Here is a code example.");
  // Catch unterminated or single-line code fences
  result = result.replace(/```[^\n]*```/g, "");
  result = result.replace(/```[\w]*/g, "");
  result = result.replace(/```/g, "");

  // 3. Remove inline code (`code`)
  result = result.replace(/`[^`\n]+`/g, (match) => match.slice(1, -1));

  // 4. Remove ATX headings (# Heading → Heading text only)
  result = result.replace(/^#{1,6}\s+(.*)$/gm, "$1");

  // 5. Remove setext headings (underline-style)
  result = result.replace(/^[=\-]{3,}\s*$/gm, "");

  // 6. Remove bold/italic/strikethrough
  result = result.replace(/\*\*\*([^*]+)\*\*\*/g, "$1"); // bold + italic
  result = result.replace(/\*\*([^*]+)\*\*/g, "$1");     // bold
  result = result.replace(/__([^_]+)__/g, "$1");          // bold underscore
  result = result.replace(/\*([^*]+)\*/g, "$1");          // italic
  result = result.replace(/_([^_]+)_/g, "$1");            // italic underscore
  result = result.replace(/~~([^~]+)~~/g, "$1");          // strikethrough

  // 7. Remove Markdown links — keep the visible text
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // 8. Remove Markdown image syntax
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");

  // 9. Remove blockquotes
  result = result.replace(/^>\s*/gm, "");

  // 10. Remove horizontal rules
  result = result.replace(/^[-*_]{3,}\s*$/gm, "");

  // 11. Remove bullet list markers (-, *, +)
  result = result.replace(/^[\s]*[-*+]\s+/gm, "");

  // 12. Remove numbered list markers (1. 2. etc.)
  result = result.replace(/^[\s]*\d+\.\s+/gm, "");

  // 13. Remove HTML tags
  result = result.replace(/<[^>]+>/g, "");

  // 14. Remove table separators (| --- | --- |)
  result = result.replace(/^\|[-:\s|]+\|?\s*$/gm, "");
  // Remove table pipe chars, keep content
  result = result.replace(/\|/g, " ");

  // 15. Remove remaining Markdown formatting chars
  result = result.replace(/[#*_~`]/g, "");

  // 16. Remove emoji and Unicode pictographs (comprehensive range)
  result = result.replace(
    /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1FFFF}\u{1FA00}-\u{1FA9F}]/gu,
    ""
  );

  // 17. Remove common symbol characters that shouldn't be spoken
  result = result.replace(/[→←↑↓⇒⇐•◦▪▸◆◇□■○●]/g, "");

  // 18. Normalize multiple blank lines to single blank line
  result = result.replace(/\n{3,}/g, "\n\n");

  // 19. Collapse lines that are now empty after stripping
  result = result
    .split("\n")
    .map(line => line.trim())
    .filter((line, i, arr) => line !== "" || (arr[i - 1] !== ""))
    .join("\n");

  // 20. Final trim
  return result.trim();
}

/**
 * Quick check — returns true if the string appears to contain Markdown.
 * Useful for logging/debugging.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function containsMarkdown(text) {
  if (!text) return false;
  return /[#*_`~\[\]|]/.test(text) || /```/.test(text);
}
