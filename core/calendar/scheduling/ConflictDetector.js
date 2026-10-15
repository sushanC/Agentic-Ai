/**
 * ConflictDetector.js
 *
 * Checks a proposed time window against existing calendar events to detect
 * scheduling conflicts before creating or rescheduling an event.
 *
 * Design principles:
 *   - Does NOT create events.
 *   - Returns structured conflict information for CalendarManager to act on.
 *   - Uses the CalendarProvider to fetch events — does NOT call Google API directly.
 *   - Caller decides whether to surface a conflict or override it.
 */
export class ConflictDetector {
  /**
   * Check whether a proposed time window conflicts with existing events.
   *
   * @param {object} params
   * @param {string} params.startISO       - Proposed start (ISO 8601)
   * @param {string} params.endISO         - Proposed end (ISO 8601)
   * @param {object} params.provider       - CalendarProvider instance
   * @param {string} [params.excludeEventId] - Event ID to exclude (for reschedule checks)
   * @param {string} [params.calendarId="primary"]
   *
   * @returns {Promise<{
   *   hasConflict: boolean,
   *   conflicts: Array<{id, title, start, end}>,
   *   error: string|null
   * }>}
   */
  static async check({ startISO, endISO, provider, excludeEventId = null, calendarId = "primary" }) {
    if (!startISO || !endISO) {
      return { hasConflict: false, conflicts: [], error: "Start or end time is missing." };
    }
    if (!provider) {
      return { hasConflict: false, conflicts: [], error: "No calendar provider supplied." };
    }

    try {
      // Fetch events in the proposed window from the provider
      const listResult = await provider.listEvents({
        calendarId,
        timeMin: startISO,
        timeMax: endISO,
        maxResults: 50,
        singleEvents: true,
      });

      if (!listResult.success) {
        return { hasConflict: false, conflicts: [], error: listResult.error || "Could not fetch events for conflict check." };
      }

      const events = listResult.events || [];

      // Exclude the event being rescheduled (it should not conflict with itself)
      const relevantEvents = excludeEventId
        ? events.filter(e => e.id !== excludeEventId)
        : events;

      const proposedStart = new Date(startISO).getTime();
      const proposedEnd   = new Date(endISO).getTime();

      const conflicts = relevantEvents.filter(e => {
        const eStart = new Date(e.start || e.startISO).getTime();
        const eEnd   = new Date(e.end   || e.endISO).getTime();
        // Overlap check: intervals overlap if start < other.end AND end > other.start
        return proposedStart < eEnd && proposedEnd > eStart;
      });

      return {
        hasConflict: conflicts.length > 0,
        conflicts:   conflicts.map(e => ({
          id:    e.id,
          title: e.title || e.summary || "(Untitled Event)",
          start: e.start || e.startISO,
          end:   e.end   || e.endISO,
        })),
        error: null,
      };

    } catch (err) {
      // Conflict check failure is non-fatal — proceed without blocking
      console.warn("[ConflictDetector] Could not complete conflict check:", err.message);
      return { hasConflict: false, conflicts: [], error: err.message };
    }
  }

  /**
   * Build a human-readable conflict message for the user.
   *
   * @param {Array<{title, start, end}>} conflicts
   * @param {string} timezone
   * @returns {string}
   */
  static buildConflictMessage(conflicts, timezone) {
    if (!conflicts || conflicts.length === 0) return "";

    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      hour: "numeric", minute: "2-digit", hour12: true,
    });

    if (conflicts.length === 1) {
      const c = conflicts[0];
      const startStr = c.start ? fmt.format(new Date(c.start)) : "?";
      const endStr   = c.end   ? fmt.format(new Date(c.end))   : "?";
      return `You already have "${c.title}" from ${startStr} to ${endStr}. Would you like to schedule this anyway or choose a different time?`;
    }

    const list = conflicts.map(c => `"${c.title}"`).join(", ");
    return `You have ${conflicts.length} conflicting events (${list}) in that time slot. Would you like to schedule this anyway or choose a different time?`;
  }
}
