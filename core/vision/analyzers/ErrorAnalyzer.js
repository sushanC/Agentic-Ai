/**
 * ErrorAnalyzer.js
 *
 * Specialized Vision Analyzer for Terminal & IDE Error Screenshots.
 * Extracts error text, stack trace, root cause, and concrete fixes.
 */
export class ErrorAnalyzer {
  constructor() {
    this.name = "error";
  }

  getSystemPrompt() {
    return `You are a Senior Software Systems Debugging AI agent.
Analyze the error screenshot (terminal, IDE, browser console, stack trace) and return JSON matching:
{
  "error": "Short error title",
  "stackTrace": "Full extracted stack trace",
  "technology": "Node.js / Python / React / Docker / Linux",
  "rootCause": "Explanation of why the error occurred",
  "likelyFix": "Step-by-step resolution steps",
  "confidence": 0.95
}
Return valid JSON only.`;
  }

  parse(rawText) {
    try {
      const clean = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(clean);
      return {
        error: parsed.error || "Error detected",
        stackTrace: parsed.stackTrace || rawText,
        technology: parsed.technology || "General Code",
        rootCause: parsed.rootCause || "Unknown cause",
        likelyFix: parsed.likelyFix || "Review error logs and stack trace.",
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.9,
      };
    } catch {
      return {
        error: "Error detected",
        stackTrace: rawText,
        technology: "General Code",
        rootCause: "Unknown cause",
        likelyFix: "Review error logs and stack trace.",
        confidence: 0.8,
      };
    }
  }
}
