import { askAI } from "../../../services/ai.js";

/**
 * CalendarFieldExtractor.js
 *
 * Extracts structured calendar event fields from user natural language input.
 *
 * Strategy:
 *   1. LLM extraction via askAI() — high accuracy for complex expressions
 *   2. Deterministic regex fallback — zero latency, used when LLM fails
 *
 * Fields extracted:
 *   title, attendeeNames, date, startTime, endTime, duration,
 *   location, recurrenceText, description
 *
 * This extractor does NOT resolve dates to timestamps — that is DateTimeResolver's job.
 * This extractor does NOT resolve attendee emails — that is ContactResolver's job.
 */
export class CalendarFieldExtractor {
  /**
   * Extract calendar fields from a natural language prompt.
   *
   * @param {string} prompt
   * @returns {Promise<object>} Extracted fields (raw strings, not yet resolved)
   */
  static async extract(prompt) {
    const raw = String(prompt || "").trim();

    try {
      const aiPrompt = `You are a high-precision Calendar Field Extraction AI.
Extract scheduling details from the user instruction:
"${raw}"

Return a valid JSON object matching EXACTLY this schema:
{
  "title": "Event title or meeting name. E.g. 'Meeting with Sujan', 'DSA Practice', 'Project Review'",
  "attendeeNames": ["list of person names mentioned as participants — NOT the organizer"],
  "date": "Raw date expression as spoken. E.g. 'tomorrow', 'Friday', 'next Monday', 'July 15', or empty string if not mentioned",
  "startTime": "Raw start time as spoken. E.g. '4 PM', '16:00', '4', 'morning', or empty string if not mentioned",
  "endTime": "Raw end time as spoken. E.g. '5 PM', '17:00', or empty string if not mentioned",
  "duration": "Raw duration as spoken. E.g. '1 hour', '90 minutes', '2 hours', or empty string if not mentioned",
  "location": "Location if mentioned, or empty string",
  "recurrenceText": "Recurrence expression if mentioned. E.g. 'every Monday', 'daily', 'every weekday', 'weekly', or empty string",
  "description": "Any additional context or agenda, or empty string"
}

Rules:
- Extract ONLY what is explicitly stated. Do NOT invent information.
- attendeeNames should be EMPTY if only the speaker is involved (no "with" clause).
- Do NOT include email addresses in attendeeNames.
- title should be the event name, not a sentence. E.g. "Meeting with Sujan" not "Schedule a meeting with Sujan".
- Return valid JSON only. No explanation.`;

      const aiRaw  = await askAI(aiPrompt, "chat");
      const cleaned = aiRaw.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed  = JSON.parse(cleaned);

      return {
        title:          CalendarFieldExtractor._cleanString(parsed.title),
        attendeeNames:  Array.isArray(parsed.attendeeNames) ? parsed.attendeeNames.filter(Boolean) : [],
        date:           CalendarFieldExtractor._cleanString(parsed.date),
        startTime:      CalendarFieldExtractor._cleanString(parsed.startTime),
        endTime:        CalendarFieldExtractor._cleanString(parsed.endTime),
        duration:       CalendarFieldExtractor._cleanString(parsed.duration),
        location:       CalendarFieldExtractor._cleanString(parsed.location),
        recurrenceText: CalendarFieldExtractor._cleanString(parsed.recurrenceText),
        description:    CalendarFieldExtractor._cleanString(parsed.description),
        confidence:     0.95,
      };

    } catch (err) {
      // ── Deterministic fallback ─────────────────────────────────────────────
      return CalendarFieldExtractor._deterministicExtract(raw);
    }
  }

  /**
   * Deterministic regex fallback extraction — no AI, no latency.
   * @param {string} raw
   * @returns {object}
   */
  static _deterministicExtract(raw) {
    const p = raw.toLowerCase();

    // Title: text between "schedule"/"create"/"book" and "tomorrow"/"at"/"on"/"every"
    let title = "";
    const titleMatch = raw.match(
      /(?:schedule|book|create|add|set up|plan|arrange)\s+(?:a\s+)?(.+?)(?:\s+(?:tomorrow|today|on\s+|at\s+|every\s+|from\s+|for\s+\d|next\s+))/i
    );
    if (titleMatch) title = titleMatch[1].trim();

    // Attendee names from "with X"
    const attendeeMatch = raw.match(/\bwith\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    const attendeeNames = attendeeMatch ? [attendeeMatch[1]] : [];

    // Date expressions
    const datePatterns = [
      /\b(tomorrow|today|day after tomorrow)\b/i,
      /\b(next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week))\b/i,
      /\b(this\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|evening|afternoon|morning))\b/i,
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    ];
    let date = "";
    for (const re of datePatterns) {
      const m = raw.match(re);
      if (m) { date = m[1]; break; }
    }

    // Time expressions
    const timeMatch = raw.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    const startTime = timeMatch ? timeMatch[1] : "";

    // Duration
    const durationMatch = raw.match(/\bfor\s+(\d+(?:\.\d+)?\s*(?:hour|hr|minute|min)s?)/i);
    const duration = durationMatch ? durationMatch[1] : "";

    // From X to Y
    const rangeMatch = raw.match(/\bfrom\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+to\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    const startFromRange = rangeMatch ? rangeMatch[1] : "";
    const endTime        = rangeMatch ? rangeMatch[2] : "";

    // Recurrence
    const recurrenceMatch = raw.match(/\b(every\s+(?:day|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekday|weekend))\b/i);
    const recurrenceText = recurrenceMatch ? recurrenceMatch[1] : "";

    return {
      title:          title || raw.replace(/^(schedule|book|create|add)\s+(?:a\s+)?/i, "").slice(0, 60),
      attendeeNames,
      date,
      startTime:      startTime || startFromRange,
      endTime,
      duration,
      location:       "",
      recurrenceText,
      description:    "",
      confidence:     0.65,
    };
  }

  /**
   * Trim and null-check extracted string values.
   * @param {*} val
   * @returns {string}
   */
  static _cleanString(val) {
    if (typeof val !== "string") return "";
    return val.trim();
  }
}
