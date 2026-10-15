import { CALENDAR_CONFIG } from "../CalendarConfig.js";

/**
 * DateTimeResolver.js
 *
 * Dedicated scheduling component for resolving natural language date/time
 * expressions into explicit ISO 8601 timestamps in the user's timezone.
 *
 * Resolves expressions such as:
 *   today, tomorrow, day after tomorrow
 *   Friday, next Friday, next Monday, this evening
 *   tomorrow morning, tomorrow afternoon
 *   at 4, at 4 PM, 16:00
 *   from 2 to 3, for one hour, for 90 minutes
 *   next week, Friday afternoon
 *
 * Design principles:
 *   - NEVER silently guess an ambiguous date/time — return ambiguity metadata instead.
 *   - NEVER use UTC for user-facing scheduling — always apply the user's timezone.
 *   - Always normalize to an explicit timestamp before sending to providers.
 *   - The caller (CalendarManager) decides what to do with ambiguity (ask clarification).
 */
export class DateTimeResolver {
  /**
   * Resolve a date expression + time expression into start/end timestamps.
   *
   * @param {object} params
   * @param {string} params.dateExpr      - Raw date expression ("tomorrow", "Friday", etc.)
   * @param {string} params.startTimeExpr - Raw start time ("4 PM", "16:00", "4", etc.)
   * @param {string} [params.endTimeExpr] - Raw end time expression
   * @param {string} [params.durationExpr]- Raw duration ("for 1 hour", "90 minutes")
   * @param {string} params.timezone      - IANA timezone string
   * @param {Date}   [params.now]         - Reference "now" (for testing; defaults to new Date())
   *
   * @returns {{
   *   resolved: boolean,
   *   start: string|null,            // ISO 8601 datetime
   *   end: string|null,              // ISO 8601 datetime
   *   timezone: string,
   *   ambiguous: boolean,
   *   ambiguityReason: string|null,  // What to ask the user
   *   error: string|null
   * }}
   */
  static resolve({ dateExpr, startTimeExpr, endTimeExpr, durationExpr, timezone, now } = {}) {
    const tz       = timezone || CALENDAR_CONFIG.CONFIGURED_TIMEZONE || CALENDAR_CONFIG.FALLBACK_TIMEZONE;
    const refNow   = now instanceof Date ? now : new Date();

    try {
      // ── Step 1: Resolve base date ────────────────────────────────────────
      const baseDate = DateTimeResolver._resolveDate(dateExpr, refNow, tz);
      if (!baseDate) {
        return {
          resolved: false,
          start: null, end: null, timezone: tz,
          ambiguous: false,
          ambiguityReason: null,
          error: `Could not understand date expression: "${dateExpr}"`,
        };
      }

      // ── Step 2: Resolve start time ───────────────────────────────────────
      if (!startTimeExpr) {
        return {
          resolved: false,
          start: null, end: null, timezone: tz,
          ambiguous: false,
          ambiguityReason: null,
          error: "Start time is required.",
        };
      }

      const timeResult = DateTimeResolver._resolveTime(startTimeExpr);
      if (!timeResult.resolved) {
        return {
          resolved: false,
          start: null, end: null, timezone: tz,
          ambiguous: timeResult.ambiguous,
          ambiguityReason: timeResult.ambiguityReason,
          error: timeResult.error,
        };
      }

      // ── Step 3: Build start datetime ─────────────────────────────────────
      const startDt = DateTimeResolver._buildDateTime(baseDate, timeResult.hours, timeResult.minutes, tz);

      // ── Step 4: Resolve end time ─────────────────────────────────────────
      let endDt;

      if (endTimeExpr) {
        const endTimeResult = DateTimeResolver._resolveTime(endTimeExpr);
        if (!endTimeResult.resolved) {
          return {
            resolved: false,
            start: startDt, end: null, timezone: tz,
            ambiguous: endTimeResult.ambiguous,
            ambiguityReason: endTimeResult.ambiguityReason,
            error: endTimeResult.error,
          };
        }
        endDt = DateTimeResolver._buildDateTime(baseDate, endTimeResult.hours, endTimeResult.minutes, tz);

        // If end <= start (e.g. "from 11 PM to 1 AM"), advance endDt by 1 day
        if (new Date(endDt) <= new Date(startDt)) {
          const endDate = new Date(endDt);
          endDate.setDate(endDate.getDate() + 1);
          endDt = endDate.toISOString();
        }

      } else if (durationExpr) {
        const durationMinutes = DateTimeResolver._parseDuration(durationExpr);
        if (durationMinutes === null) {
          return {
            resolved: false,
            start: startDt, end: null, timezone: tz,
            ambiguous: false,
            ambiguityReason: null,
            error: `Could not parse duration: "${durationExpr}"`,
          };
        }
        const endDate = new Date(startDt);
        endDate.setMinutes(endDate.getMinutes() + durationMinutes);
        endDt = endDate.toISOString();

      } else {
        // Use default duration from config
        const endDate = new Date(startDt);
        endDate.setMinutes(endDate.getMinutes() + CALENDAR_CONFIG.DEFAULT_EVENT_DURATION_MINUTES);
        endDt = endDate.toISOString();
      }

      return {
        resolved: true,
        start:    startDt,
        end:      endDt,
        timezone: tz,
        ambiguous: false,
        ambiguityReason: null,
        error: null,
      };

    } catch (err) {
      return {
        resolved: false,
        start: null, end: null, timezone: tz,
        ambiguous: false,
        ambiguityReason: null,
        error: err.message,
      };
    }
  }

  /**
   * Resolve only a date expression to a Date object (midnight in the user's timezone).
   * Returns null on failure.
   *
   * @param {string} expr
   * @param {Date} now
   * @param {string} tz
   * @returns {Date|null}
   */
  static _resolveDate(expr, now, tz) {
    if (!expr) return null;
    const p = expr.toLowerCase().trim();

    // Get current date parts in user's timezone
    const localNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));
    const y = localNow.getFullYear();
    const m = localNow.getMonth();
    const d = localNow.getDate();

    // Simple relative expressions
    if (/^today$/i.test(p))                    return new Date(y, m, d);
    if (/^tomorrow$/i.test(p))                 return new Date(y, m, d + 1);
    if (/^day after tomorrow$/i.test(p))       return new Date(y, m, d + 2);
    if (/^the day after tomorrow$/i.test(p))   return new Date(y, m, d + 2);

    // Weekday names
    const DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    const currentDayOfWeek = localNow.getDay(); // 0=Sun

    // "this/next Monday" / "next week Monday"
    const nextDayMatch = p.match(/^(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i);
    if (nextDayMatch) {
      const targetDay = DAYS.indexOf(nextDayMatch[1].toLowerCase());
      let diff = targetDay - currentDayOfWeek;
      if (diff <= 0) diff += 7; // always forward
      return new Date(y, m, d + diff);
    }

    // "this evening", "this afternoon", "this morning" → treated as today
    if (/^this\s+(morning|afternoon|evening|night)$/i.test(p)) {
      return new Date(y, m, d);
    }

    // "tomorrow morning/afternoon/evening"
    if (/^tomorrow\s+(morning|afternoon|evening|night)$/i.test(p)) {
      return new Date(y, m, d + 1);
    }

    // "next week" → 7 days from now
    if (/^next week$/i.test(p)) {
      return new Date(y, m, d + 7);
    }

    // "Monday afternoon", "Friday morning" etc.
    const dayPeriodMatch = p.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(morning|afternoon|evening|night)$/i);
    if (dayPeriodMatch) {
      const targetDay = DAYS.indexOf(dayPeriodMatch[1].toLowerCase());
      let diff = targetDay - currentDayOfWeek;
      if (diff <= 0) diff += 7;
      return new Date(y, m, d + diff);
    }

    // "July 15", "15th July", "August 3rd" — specific date
    const monthNames = ["january","february","march","april","may","june","july","august","september","october","november","december"];
    const specificDateMatch1 = p.match(/^(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?$/i);
    if (specificDateMatch1) {
      const monthIdx = monthNames.indexOf(specificDateMatch1[1].toLowerCase());
      if (monthIdx !== -1) {
        const dayNum = parseInt(specificDateMatch1[2], 10);
        let targetYear = y;
        const candidate = new Date(targetYear, monthIdx, dayNum);
        if (candidate < new Date(y, m, d)) targetYear++;
        return new Date(targetYear, monthIdx, dayNum);
      }
    }
    const specificDateMatch2 = p.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)$/i);
    if (specificDateMatch2) {
      const monthIdx = monthNames.indexOf(specificDateMatch2[2].toLowerCase());
      if (monthIdx !== -1) {
        const dayNum = parseInt(specificDateMatch2[1], 10);
        let targetYear = y;
        const candidate = new Date(targetYear, monthIdx, dayNum);
        if (candidate < new Date(y, m, d)) targetYear++;
        return new Date(targetYear, monthIdx, dayNum);
      }
    }

    return null;
  }

  /**
   * Resolve a time expression to { hours, minutes }.
   * Returns ambiguous:true if AM/PM cannot be safely inferred (e.g. bare "4").
   *
   * @param {string} expr
   * @returns {{ resolved: boolean, hours?: number, minutes?: number, ambiguous?: boolean, ambiguityReason?: string, error?: string }}
   */
  static _resolveTime(expr) {
    if (!expr) return { resolved: false, error: "No time expression provided." };
    const p = expr.toLowerCase().trim();

    // Period keywords from date expression ("morning", "afternoon", "evening")
    if (/^morning$/i.test(p))   return { resolved: true, hours: 9,  minutes: 0 };
    if (/^afternoon$/i.test(p)) return { resolved: true, hours: 14, minutes: 0 };
    if (/^evening$/i.test(p))   return { resolved: true, hours: 18, minutes: 0 };
    if (/^night$/i.test(p))     return { resolved: true, hours: 20, minutes: 0 };

    // 24-hour format: "16:00", "08:30"
    const time24 = p.match(/^(\d{1,2}):(\d{2})$/);
    if (time24) {
      const h = parseInt(time24[1], 10);
      const min = parseInt(time24[2], 10);
      if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
        return { resolved: true, hours: h, minutes: min };
      }
    }

    // "4 PM", "4:30 PM", "4am", "10:15pm"
    const timeAmPm = p.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (timeAmPm) {
      let h   = parseInt(timeAmPm[1], 10);
      const min = parseInt(timeAmPm[2] || "0", 10);
      const period = timeAmPm[3].toLowerCase();
      if (period === "pm" && h < 12) h += 12;
      if (period === "am" && h === 12) h = 0;
      return { resolved: true, hours: h, minutes: min };
    }

    // Bare number "4", "10", "11" — AMBIGUOUS if between 1-11
    const bareNum = p.match(/^(\d{1,2})$/);
    if (bareNum) {
      const h = parseInt(bareNum[1], 10);
      if (h === 0 || h === 12) return { resolved: true, hours: h, minutes: 0 };
      if (h >= 13 && h <= 23)  return { resolved: true, hours: h, minutes: 0 };
      // 1-11: truly ambiguous
      return {
        resolved: false,
        ambiguous: true,
        ambiguityReason: `Do you mean ${h} AM or ${h} PM?`,
        error: null,
      };
    }

    return {
      resolved: false,
      ambiguous: false,
      ambiguityReason: null,
      error: `Could not understand time expression: "${expr}"`,
    };
  }

  /**
   * Build an ISO 8601 datetime string by combining a Date and time parts.
   * Adjusts for the user's timezone by building in local time.
   *
   * @param {Date} baseDate
   * @param {number} hours
   * @param {number} minutes
   * @param {string} tz
   * @returns {string} ISO 8601 string
   */
  static _buildDateTime(baseDate, hours, minutes, tz) {
    // Build a date in local time (year/month/day from baseDate, h/m as given)
    const localDate = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate(),
      hours,
      minutes,
      0,
      0
    );

    // Format as a "local" ISO string and attach timezone context
    // Google Calendar API accepts RFC 3339 with timezone; we use the user's
    // timezone name (e.g. "Asia/Kathmandu") in the event body, not a raw offset.
    // We return the ISO string in the UTC equivalent of the intended local time.
    const utcMs = DateTimeResolver._localToUtcMs(localDate, tz);
    return new Date(utcMs).toISOString();
  }

  /**
   * Convert a "local" Date (whose year/month/day/h/m are already in the target timezone)
   * to the UTC millisecond equivalent.
   *
   * @param {Date} localDate
   * @param {string} tz
   * @returns {number}
   */
  static _localToUtcMs(localDate, tz) {
    // Use Intl to find the UTC offset at this moment for the given timezone
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    });

    // Find the timezone offset by comparing the "local" time string interpretation
    // against UTC, using a binary-search-like approach (simple version)
    const utcMs = localDate.getTime();
    // Parse the formatted string of a reference UTC date to find offset
    const refUtc = new Date(utcMs);
    const parts  = fmt.formatToParts(refUtc);
    const partsMap = Object.fromEntries(parts.map(p => [p.type, p.value]));

    const tzYear  = parseInt(partsMap.year, 10);
    const tzMonth = parseInt(partsMap.month, 10) - 1;
    const tzDay   = parseInt(partsMap.day, 10);
    const tzHour  = parseInt(partsMap.hour, 10) === 24 ? 0 : parseInt(partsMap.hour, 10);
    const tzMin   = parseInt(partsMap.minute, 10);
    const tzSec   = parseInt(partsMap.second, 10);

    const tzLocalMs = Date.UTC(tzYear, tzMonth, tzDay, tzHour, tzMin, tzSec);
    const offsetMs  = utcMs - tzLocalMs;

    // Now compute the real UTC for our desired local time
    const desiredLocalMs = Date.UTC(
      localDate.getFullYear(),
      localDate.getMonth(),
      localDate.getDate(),
      localDate.getHours(),
      localDate.getMinutes(),
      0
    );
    return desiredLocalMs + offsetMs;
  }

  /**
   * Parse a duration expression to minutes.
   * E.g. "1 hour" → 60, "90 minutes" → 90, "2 hours" → 120, "1.5 hours" → 90
   *
   * @param {string} expr
   * @returns {number|null} Minutes, or null on parse failure
   */
  static _parseDuration(expr) {
    if (!expr) return null;
    const p = expr.toLowerCase().trim();

    // "X hour(s)" or "X hr(s)"
    const hoursMatch = p.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i);
    if (hoursMatch) return Math.round(parseFloat(hoursMatch[1]) * 60);

    // "X minute(s)" or "X min(s)"
    const minsMatch = p.match(/(\d+)\s*(?:minutes?|mins?)/i);
    if (minsMatch) return parseInt(minsMatch[1], 10);

    // Named: "half hour", "half an hour"
    if (/half\s+(?:an\s+)?hour/i.test(p)) return 30;

    // "one hour", "two hours" etc.
    const wordNums = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 };
    for (const [word, num] of Object.entries(wordNums)) {
      if (new RegExp(`\\b${word}\\s+(?:hours?|hrs?)\\b`, "i").test(p)) return num * 60;
      if (new RegExp(`\\b${word}\\s+(?:minutes?|mins?)\\b`, "i").test(p)) return num;
    }

    return null;
  }

  /**
   * Resolve just the effective timezone for a request, reading from:
   *   1. userPreferences.timezone  (Cognitive Memory)
   *   2. CALENDAR_TIMEZONE env var
   *   3. System locale (Intl)
   *
   * @param {object} [userPreferences={}]
   * @returns {string} IANA timezone string
   */
  static getTimezone(userPreferences = {}) {
    return (
      userPreferences?.timezone ||
      CALENDAR_CONFIG.CONFIGURED_TIMEZONE ||
      CALENDAR_CONFIG.FALLBACK_TIMEZONE
    );
  }
}
