/**
 * OCRAnalyzer.js
 *
 * Specialized Vision Analyzer for OCR & text extraction.
 * Extracts plain text, headings, lists, and formatted structural sections.
 */
export class OCRAnalyzer {
  constructor() {
    this.name = "ocr";
  }

  getSystemPrompt() {
    return `You are a high-precision Optical Character Recognition (OCR) AI agent.
Your task is to extract all visible text from the provided image(s) accurately.

Return a JSON object matching this structure:
{
  "ocrText": "full plain text",
  "headings": ["heading 1", "heading 2"],
  "sections": [{"title": "...", "content": "..."}],
  "lists": [["item 1", "item 2"]],
  "confidence": 0.95
}
Ensure JSON is strictly valid. Do not wrap in markdown syntax blocks if possible.`;
  }

  parse(rawText) {
    try {
      const clean = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(clean);
      return {
        ocrText: parsed.ocrText || rawText,
        headings: Array.isArray(parsed.headings) ? parsed.headings : [],
        sections: Array.isArray(parsed.sections) ? parsed.sections : [],
        lists: Array.isArray(parsed.lists) ? parsed.lists : [],
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.9,
      };
    } catch {
      return {
        ocrText: rawText,
        headings: [],
        sections: [],
        lists: [],
        confidence: 0.85,
      };
    }
  }
}
