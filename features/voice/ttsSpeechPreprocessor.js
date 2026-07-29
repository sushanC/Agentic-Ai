/**
 * ttsSpeechPreprocessor.js
 *
 * Pre-processes speech text immediately before it is passed to the TTS engine (Edge-TTS).
 *
 * Applied AFTER voiceResponseSanitizer — text is already clean of Markdown.
 * This layer focuses on audio quality: pronunciation, pacing, and natural speech.
 *
 * Operations:
 *  1.  Expand common abbreviations to spoken form
 *  2.  Normalize technical acronyms for natural pronunciation
 *  3.  Expand numbers to words where beneficial for clarity
 *  4.  Clean up sentence-ending punctuation
 *  5.  Prevent awkward TTS pauses from stray punctuation
 *  6.  Handle special characters that confuse TTS
 *  7.  Split long text into natural spoken chunks (sentence-level)
 *  8.  Optimize sentence boundaries for Edge-TTS
 */

// ─────────────────────────────────────────────────────────────────────────────
// Abbreviation Expansion Table
// ─────────────────────────────────────────────────────────────────────────────

const ABBREVIATIONS = [
  // Technical acronyms — space-separated so TTS reads each letter
  { pattern: /\bAPI\b/g,         replacement: "A P I" },
  { pattern: /\bAPIs\b/g,        replacement: "A P I s" },
  { pattern: /\bURL\b/g,         replacement: "U R L" },
  { pattern: /\bURLs\b/g,        replacement: "U R L s" },
  { pattern: /\bUI\b/g,          replacement: "U I" },
  { pattern: /\bUX\b/g,          replacement: "U X" },
  { pattern: /\bHTML\b/g,        replacement: "H T M L" },
  { pattern: /\bCSS\b/g,         replacement: "C S S" },
  { pattern: /\bSQL\b/g,         replacement: "S Q L" },
  { pattern: /\bPDF\b/g,         replacement: "P D F" },
  { pattern: /\bPDFs\b/g,        replacement: "P D F s" },
  { pattern: /\bSSH\b/g,         replacement: "S S H" },
  { pattern: /\bSSL\b/g,         replacement: "S S L" },
  { pattern: /\bTLS\b/g,         replacement: "T L S" },
  { pattern: /\bCLI\b/g,         replacement: "C L I" },
  { pattern: /\bSDK\b/g,         replacement: "S D K" },
  { pattern: /\bIDE\b/g,         replacement: "I D E" },
  { pattern: /\bOS\b/g,          replacement: "O S" },
  { pattern: /\bCPU\b/g,         replacement: "C P U" },
  { pattern: /\bRAM\b/g,         replacement: "RAM" },       // pronounceable
  { pattern: /\bGPU\b/g,         replacement: "G P U" },
  { pattern: /\bLLM\b/g,         replacement: "L L M" },
  { pattern: /\bLLMs\b/g,        replacement: "L L M s" },
  { pattern: /\bAI\b/g,          replacement: "A I" },
  { pattern: /\bML\b/g,          replacement: "M L" },
  { pattern: /\bCI\/CD\b/g,      replacement: "C I C D" },
  { pattern: /\bnpm\b/gi,        replacement: "N P M" },
  { pattern: /\bJSON\b/g,        replacement: "Jason" },
  { pattern: /\bYAML\b/g,        replacement: "Yamel" },
  { pattern: /\bXML\b/g,         replacement: "X M L" },
  { pattern: /\bHTTPS\b/g,       replacement: "H T T P S" },
  { pattern: /\bHTTP\b/g,        replacement: "H T T P" },
  { pattern: /\bREST\b/g,        replacement: "REST" },      // pronounceable
  { pattern: /\bGit\b/g,         replacement: "Git" },
  { pattern: /\bgRPC\b/gi,       replacement: "G R P C" },
  { pattern: /\bDSA\b/g,         replacement: "D S A" },
  { pattern: /\bDAA\b/g,         replacement: "D A A" },
  // Common English abbreviations
  { pattern: /\bvs\.\s*/g,       replacement: "versus " },
  { pattern: /\betc\./g,         replacement: "etcetera" },
  { pattern: /\be\.g\./g,        replacement: "for example" },
  { pattern: /\bi\.e\./g,        replacement: "that is" },
  { pattern: /\bapprox\.\s*/g,   replacement: "approximately " },
  { pattern: /\bmin\.\s*/g,      replacement: "minutes " },
  { pattern: /\bsec\.\s*/g,      replacement: "seconds " },
  { pattern: /\bms\b/g,          replacement: "milliseconds" },
  // Math and units
  { pattern: /\bkB\b/g,          replacement: "kilobytes" },
  { pattern: /\bMB\b/g,          replacement: "megabytes" },
  { pattern: /\bGB\b/g,          replacement: "gigabytes" },
  { pattern: /\bTB\b/g,          replacement: "terabytes" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Symbol Normalization
// ─────────────────────────────────────────────────────────────────────────────

const SYMBOL_MAP = [
  { pattern: /&amp;/g,                    replacement: "and" },
  { pattern: /\s&\s/g,                    replacement: " and " },
  { pattern: /\s@\s/g,                    replacement: " at " },
  { pattern: /~(\d+)/g,                   replacement: "approximately $1" },
  { pattern: /\+(\d+)/g,                  replacement: "plus $1" },
  { pattern: /<(\d+)/g,                   replacement: "less than $1" },
  { pattern: />(\d+)/g,                   replacement: "greater than $1" },
  { pattern: /\bO\(n\)\b/g,              replacement: "O of n" },
  { pattern: /\bO\(n²\)\b/g,             replacement: "O of n squared" },
  { pattern: /\bO\(log n\)\b/g,          replacement: "O of log n" },
  { pattern: /\bO\(1\)\b/g,              replacement: "O of 1" },
  // Remove leftover URLs that weren't caught by sanitizer
  { pattern: /https?:\/\/[^\s]+/g,        replacement: "a web link" },
  // Remove stray punctuation artifacts
  { pattern: /\s{2,}/g,                   replacement: " " },
  { pattern: /\.{2,}/g,                   replacement: "." },
  { pattern: /,{2,}/g,                    replacement: "," },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main preprocessor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pre-process text for TTS synthesis.
 * Apply after sanitizeForVoice() — text is already Markdown-free.
 *
 * @param {string} text - Clean, Markdown-free speech text
 * @returns {string} TTS-optimized text
 */
export function preprocessForTTS(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;

  // 1. Expand abbreviations
  for (const { pattern, replacement } of ABBREVIATIONS) {
    result = result.replace(pattern, replacement);
  }

  // 2. Normalize symbols
  for (const { pattern, replacement } of SYMBOL_MAP) {
    result = result.replace(pattern, replacement);
  }

  // 3. Ensure sentences end with proper punctuation for natural TTS pausing
  result = result.replace(/([a-zA-Z0-9])\n/g, "$1. ");

  // 4. Normalize ellipsis to natural pause (Edge-TTS handles comma pauses well)
  result = result.replace(/\.\.\./g, ",");

  // 5. Remove double spaces
  result = result.replace(/  +/g, " ");

  // 6. Final trim
  return result.trim();
}

/**
 * Split a long response into sentence-level chunks for low-latency TTS streaming.
 * The first sentence is synthesized and queued immediately while the rest are processed.
 *
 * Avoids splitting on:
 *  - File extensions (e.g. report.pdf, index.js)
 *  - Decimal numbers (e.g. 3.14)
 *  - Common abbreviations (e.g. e.g., i.e., vs.)
 *
 * @param {string} text - Full preprocessed text
 * @returns {string[]} Array of sentence chunks, each suitable for one TTS call
 */
export function splitIntoSentences(text) {
  if (!text) return [];

  // Split only when:
  //  [.!?] is followed by a space + uppercase letter, OR end of string
  //  This prevents splitting on "report.pdf", "3.14", "e.g.", etc.
  const raw = text.split(/(?<=[.!?])\s+(?=[A-Z])/);

  return raw
    .map(s => s.trim())
    .filter(s => s.length > 1);
}
