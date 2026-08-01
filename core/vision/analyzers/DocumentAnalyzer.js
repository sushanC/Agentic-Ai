/**
 * DocumentAnalyzer.js
 *
 * Specialized Vision Analyzer for Document Parsing (reports, invoices, receipts, forms).
 * Extracts summaries, key entities, sections, and structured metadata.
 */
export class DocumentAnalyzer {
  constructor() {
    this.name = "document";
  }

  getSystemPrompt() {
    return `You are a Document Analysis AI agent.
Analyze the document image (letter, invoice, paper, form, receipt) and return JSON matching:
{
  "documentType": "invoice | report | letter | receipt | form",
  "summary": "Executive summary",
  "entities": {
    "organization": "Company Name",
    "date": "2026-07-31",
    "amount": "$100.00"
  },
  "sections": [{"title": "Header", "content": "..."}],
  "formFields": [{"field": "Name", "value": "John Doe"}]
}
Return valid JSON only.`;
  }

  parse(rawText) {
    try {
      const clean = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(clean);
      return {
        documentType: parsed.documentType || "general document",
        summary: parsed.summary || rawText,
        entities: parsed.entities || {},
        sections: Array.isArray(parsed.sections) ? parsed.sections : [],
        formFields: Array.isArray(parsed.formFields) ? parsed.formFields : [],
      };
    } catch {
      return {
        documentType: "general document",
        summary: rawText,
        entities: {},
        sections: [],
        formFields: [],
      };
    }
  }
}
