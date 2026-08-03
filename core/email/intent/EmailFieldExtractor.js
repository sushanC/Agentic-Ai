import { askAI } from "../../../services/ai.js";

/**
 * EmailFieldExtractor.js
 *
 * Extracts structured email fields from user prompt using deterministic regex parsing
 * and AI-powered extraction. Validates and cleans extracted output.
 */
export class EmailFieldExtractor {
  /**
   * Extract fields from prompt.
   *
   * @param {string} prompt
   * @returns {Promise<object>}
   */
  static async extract(prompt) {
    const raw = String(prompt || "").trim();

    // Deterministic direct email extraction check
    const emailMatch = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    const directEmails = emailMatch ? emailMatch : [];

    try {
      const aiPrompt = `You are a high-precision Email Field Extraction AI.
Extract email details from the user instruction:
"${raw}"

Return a valid JSON object matching:
{
  "recipientName": "Name of recipient or relation (e.g. Sujan, Professor, friend)",
  "recipientEmail": "explicit email address if provided, else empty string",
  "subject": "Email subject",
  "body": "Complete email body message text",
  "cc": [],
  "bcc": []
}

DO NOT invent email addresses. If no explicit @ email address is in the text, recipientEmail MUST be "".
If no body message text was specified by the user, body MUST be "".
Return valid JSON only.`;

      const aiRaw = await askAI(aiPrompt, "chat");
      const cleaned = aiRaw.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);

      return {
        recipientName: parsed.recipientName || "",
        recipientEmail: parsed.recipientEmail || (directEmails[0] || ""),
        subject: parsed.subject || "(no subject)",
        body: parsed.body || "",
        cc: Array.isArray(parsed.cc) ? parsed.cc : [],
        bcc: Array.isArray(parsed.bcc) ? parsed.bcc : [],
        confidence: 0.95
      };

    } catch (err) {
      // Deterministic fallback if AI extraction fails
      let recipientName = "";
      if (raw.toLowerCase().includes("to ")) {
        const afterTo = raw.split(/to /i)[1];
        recipientName = afterTo ? afterTo.split(/about|that|for|with|saying|stating/i)[0].trim() : "";
      }

      let extractedBody = "";
      if (raw.toLowerCase().includes("saying ") || raw.toLowerCase().includes("stating ") || raw.toLowerCase().includes("that ")) {
        const parts = raw.split(/saying|stating|that/i);
        extractedBody = parts.slice(1).join(" ").trim();
      }

      return {
        recipientName: recipientName || (directEmails.length ? directEmails[0].split("@")[0] : ""),
        recipientEmail: directEmails[0] || "",
        subject: "(no subject)",
        body: extractedBody,
        cc: [],
        bcc: [],
        confidence: 0.70
      };
    }
  }
}
