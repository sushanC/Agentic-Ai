/**
 * responseCleaner.js
 *
 * Cleans raw model output before returning it to the frontend.
 *
 * Rules:
 * - Preserve all Markdown (headings, bold, code fences, lists).
 * - Collapse 4+ consecutive blank lines into 2 to avoid excess whitespace.
 * - Trim leading and trailing whitespace.
 *
 * Do NOT strip **, #, or ``` — these are required for formatted responses.
 */
export function cleanResponse(text) {

  if (!text) return "";

  return text
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}