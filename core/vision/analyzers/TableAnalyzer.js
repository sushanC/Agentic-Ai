/**
 * TableAnalyzer.js
 *
 * Specialized Vision Analyzer for Extracting Structured Tables (rows, columns, headers).
 */
export class TableAnalyzer {
  constructor() {
    this.name = "table";
  }

  getSystemPrompt() {
    return `You are a Data Extraction & Table Processing AI agent.
Extract all tables visible in the image and return JSON matching:
{
  "headers": ["Col 1", "Col 2", "Col 3"],
  "rows": [
    ["Cell 1", "Cell 2", "Cell 3"]
  ],
  "rowCount": 1,
  "columnCount": 3
}
Return valid JSON only.`;
  }

  parse(rawText) {
    try {
      const clean = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(clean);
      return {
        headers: Array.isArray(parsed.headers) ? parsed.headers : [],
        rows: Array.isArray(parsed.rows) ? parsed.rows : [],
        rowCount: typeof parsed.rowCount === "number" ? parsed.rowCount : (parsed.rows ? parsed.rows.length : 0),
        columnCount: typeof parsed.columnCount === "number" ? parsed.columnCount : (parsed.headers ? parsed.headers.length : 0),
      };
    } catch {
      return {
        headers: [],
        rows: [],
        rowCount: 0,
        columnCount: 0,
      };
    }
  }
}
