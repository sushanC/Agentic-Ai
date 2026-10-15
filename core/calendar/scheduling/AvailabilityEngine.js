import { DateTimeResolver } from "./DateTimeResolver.js";
import { CALENDAR_CONFIG } from "../CalendarConfig.js";

/**
 * AvailabilityEngine.js
 *
 * Answers questions about free/busy time and finds available time slots.
 *
 * Supports:
 *   "Am I free tomorrow at 4?"                   → specific window check
 *   "Am I free Friday from 2 to 4?"              → ranged window check
 *   "Find me a free one-hour slot tomorrow afternoon." → slot-finding mode
 *
 * Design principles:
 *   - Does NOT create events.
 *   - Reads event data from CalendarProvider.
 *   - Returns a normalized availability result, not raw API responses.
 *   - Rankings and slot suggestions are based on gap analysis only.
 */
export class AvailabilityEngine {
  /**
   * Check whether a specific time window is free.
   *
   * @param {object} params
   * @param {string} params.startISO       - Window start (ISO 8601)
   * @param {string} params.endISO         - Window end (ISO 8601)
   * @param {object} params.provider       - CalendarProvider instance
   * @param {string} [params.timezone]
   * @param {string} [params.calendarId="primary"]
   *
   * @returns {Promise<{
   *   isFree: boolean,
   *   busyEvents: Array<{title, start, end}>,
   *   answer: string,
   *   error: string|null
   * }>}
   */
  static async checkWindow({ startISO, endISO, provider, timezone, calendarId = "primary" }) {
    if (!startISO || !endISO || !provider) {
      return { isFree: false, busyEvents: [], answer: "Cannot check availability without a complete time window.", error: "Missing parameters." };
    }

    const tz = timezone || CALENDAR_CONFIG.FALLBACK_TIMEZONE;

    try {
      const listResult = await provider.listEvents({
        calendarId,
        timeMin: startISO,
        timeMax: endISO,
        maxResults: 50,
        singleEvents: true,
      });

      if (!listResult.success) {
        return { isFree: false, busyEvents: [], answer: "Could not check your calendar.", error: listResult.error };
      }

      const events = listResult.events || [];
      const proposedStart = new Date(startISO).getTime();
      const proposedEnd   = new Date(endISO).getTime();

      const busyEvents = events.filter(e => {
        const eStart = new Date(e.start || e.startISO).getTime();
        const eEnd   = new Date(e.end   || e.endISO).getTime();
        return proposedStart < eEnd && proposedEnd > eStart;
      });

      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric", minute: "2-digit", hour12: true,
        weekday: "long",
      });
      const startStr = fmt.format(new Date(startISO));
      const endFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true });
      const endStr = endFmt.format(new Date(endISO));

      if (busyEvents.length === 0) {
        return {
          isFree: true,
          busyEvents: [],
          answer: `Yes, you're free ${startStr} to ${endStr}.`,
          error: null,
        };
      }

      const conflictList = busyEvents
        .map(e => `"${e.title || e.summary || "Untitled"}"`)
        .join(", ");
      return {
        isFree: false,
        busyEvents: busyEvents.map(e => ({
          title: e.title || e.summary || "Untitled",
          start: e.start || e.startISO,
          end:   e.end   || e.endISO,
        })),
        answer: `No, you have ${conflictList} during that time.`,
        error: null,
      };

    } catch (err) {
      return { isFree: false, busyEvents: [], answer: "Could not check your calendar.", error: err.message };
    }
  }

  /**
   * Find available slots of a given duration within a search window.
   *
   * @param {object} params
   * @param {string} params.searchStartISO   - Search window start
   * @param {string} params.searchEndISO     - Search window end
   * @param {number} params.durationMinutes  - Desired slot length
   * @param {object} params.provider
   * @param {string} [params.timezone]
   * @param {string} [params.calendarId="primary"]
   *
   * @returns {Promise<{
   *   slots: Array<{start: string, end: string, label: string}>,
   *   answer: string,
   *   error: string|null
   * }>}
   */
  static async findFreeSlots({
    searchStartISO, searchEndISO, durationMinutes,
    provider, timezone, calendarId = "primary"
  }) {
    const tz = timezone || CALENDAR_CONFIG.FALLBACK_TIMEZONE;

    try {
      const listResult = await provider.listEvents({
        calendarId,
        timeMin: searchStartISO,
        timeMax: searchEndISO,
        maxResults: 50,
        singleEvents: true,
      });

      const events = listResult.success ? (listResult.events || []) : [];

      // Build sorted list of busy intervals
      const busyIntervals = events
        .map(e => ({
          start: new Date(e.start || e.startISO).getTime(),
          end:   new Date(e.end   || e.endISO).getTime(),
        }))
        .sort((a, b) => a.start - b.start);

      const windowStart = new Date(searchStartISO).getTime();
      const windowEnd   = new Date(searchEndISO).getTime();
      const slotMs      = (durationMinutes || CALENDAR_CONFIG.DEFAULT_EVENT_DURATION_MINUTES) * 60 * 1000;

      const slots = [];
      let cursor  = windowStart;

      for (const busy of busyIntervals) {
        // Gap between cursor and this busy event
        if (busy.start - cursor >= slotMs) {
          slots.push({ start: cursor, end: cursor + slotMs });
        }
        cursor = Math.max(cursor, busy.end);
        if (slots.length >= 3) break; // return top 3 suggestions
      }

      // Check remaining gap after last busy event
      if (slots.length < 3 && windowEnd - cursor >= slotMs) {
        slots.push({ start: cursor, end: cursor + slotMs });
      }

      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric", minute: "2-digit", hour12: true,
      });

      const formattedSlots = slots.map(s => ({
        start: new Date(s.start).toISOString(),
        end:   new Date(s.end).toISOString(),
        label: `${fmt.format(new Date(s.start))} – ${fmt.format(new Date(s.end))}`,
      }));

      const answer = formattedSlots.length > 0
        ? `Here are some free ${durationMinutes}-minute slots: ${formattedSlots.map(s => s.label).join(", ")}.`
        : "No free slots found in that window.";

      return { slots: formattedSlots, answer, error: null };

    } catch (err) {
      return { slots: [], answer: "Could not search for free slots.", error: err.message };
    }
  }
}
