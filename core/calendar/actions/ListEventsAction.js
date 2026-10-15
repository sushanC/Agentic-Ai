import { calendarRegistry } from "../CalendarRegistry.js";
import { CALENDAR_CONFIG } from "../CalendarConfig.js";

/**
 * ListEventsAction.js
 *
 * ToolRegistry-compatible action for listing calendar events.
 * Does NOT require confirmation — it is read-only.
 *
 * Returns a normalized list of events with human-readable formatting.
 */
export class ListEventsAction {
  requiresConfirmation = false;

  async execute(action) {
    const input = action.input || {};
    const {
      timeMin,
      timeMax,
      maxResults = CALENDAR_CONFIG.LIST_EVENTS_MAX_RESULTS,
      calendarId = CALENDAR_CONFIG.DEFAULT_CALENDAR_ID,
      timezone,
    } = input;

    const provider = calendarRegistry.getProvider();
    const result   = await provider.listEvents({ calendarId, timeMin, timeMax, maxResults, singleEvents: true });

    if (!result.success) {
      return {
        success:  false,
        events:   [],
        answer:   "I couldn't fetch your calendar events. " + (result.error || ""),
        error:    result.error,
        errorCode: result.errorCode,
        requiresAuthorization: result.requiresAuthorization,
        authUrl:  result.authUrl,
      };
    }

    const events = result.events || [];
    const tz = timezone || CALENDAR_CONFIG.FALLBACK_TIMEZONE;

    if (events.length === 0) {
      return { success: true, events: [], answer: "You have no events in that time range." };
    }

    const formatted = events.map(e => ListEventsAction._formatEvent(e, tz));
    const answer = formatted.join("\n");

    return { success: true, events, answer };
  }

  static _formatEvent(event, tz) {
    const title = event.title || "(Untitled Event)";
    if (!event.start) return `• ${title}`;

    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
    const startStr = fmt.format(new Date(event.start));
    let line = `• ${title} — ${startStr}`;

    if (event.end) {
      const endFmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true,
      });
      line += ` to ${endFmt.format(new Date(event.end))}`;
    }
    return line;
  }
}
