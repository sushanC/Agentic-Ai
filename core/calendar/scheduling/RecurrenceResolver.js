/**
 * RecurrenceResolver.js
 *
 * Translates natural language recurrence expressions into a
 * provider-independent recurrence specification object.
 *
 * Provider-independent format:
 * {
 *   frequency: "DAILY" | "WEEKLY" | "MONTHLY",
 *   interval: number,       // e.g. 1 = every, 2 = every other
 *   byDay: string[],        // e.g. ["MO"], ["MO","WE","FR"]
 *   byMonthDay: number|null, // e.g. 1 (first of the month)
 *   count: number|null,     // null = infinite
 *   until: string|null,     // ISO date string, null = infinite
 * }
 *
 * GoogleCalendarProvider translates this to RRULE syntax.
 * No RRULE strings leak into CalendarManager or conversation logic.
 */
export class RecurrenceResolver {
  /**
   * Resolve a natural language recurrence expression.
   *
   * @param {string} recurrenceText - Raw expression ("every Monday at 7 PM", "weekly", etc.)
   * @returns {{ resolved: boolean, spec: object|null, error: string|null }}
   */
  static resolve(recurrenceText) {
    if (!recurrenceText) {
      return { resolved: false, spec: null, error: "No recurrence expression provided." };
    }

    const p = recurrenceText.toLowerCase().trim();

    try {
      // "daily" / "every day"
      if (/\b(daily|every day)\b/i.test(p)) {
        return {
          resolved: true,
          spec: { frequency: "DAILY", interval: 1, byDay: [], byMonthDay: null, count: null, until: null },
          error: null,
        };
      }

      // "every weekday" / "weekdays" / "every working day"
      if (/\b(every weekday|weekdays|every working day)\b/i.test(p)) {
        return {
          resolved: true,
          spec: { frequency: "WEEKLY", interval: 1, byDay: ["MO","TU","WE","TH","FR"], byMonthDay: null, count: null, until: null },
          error: null,
        };
      }

      // "every weekend" / "weekends"
      if (/\b(every weekend|weekends)\b/i.test(p)) {
        return {
          resolved: true,
          spec: { frequency: "WEEKLY", interval: 1, byDay: ["SA","SU"], byMonthDay: null, count: null, until: null },
          error: null,
        };
      }

      // "weekly" / "every week"
      if (/\b(weekly|every week)\b/i.test(p) && !/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(p)) {
        return {
          resolved: true,
          spec: { frequency: "WEEKLY", interval: 1, byDay: [], byMonthDay: null, count: null, until: null },
          error: null,
        };
      }

      // "every Monday", "every Tuesday", etc. (specific day of week)
      const dayMap = {
        monday: "MO", tuesday: "TU", wednesday: "WE", thursday: "TH",
        friday: "FR", saturday: "SA", sunday: "SU",
      };
      const weekdayMatch = p.match(/\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
      if (weekdayMatch) {
        const dayCode = dayMap[weekdayMatch[1].toLowerCase()];
        return {
          resolved: true,
          spec: { frequency: "WEEKLY", interval: 1, byDay: [dayCode], byMonthDay: null, count: null, until: null },
          error: null,
        };
      }

      // "every other week" / "biweekly"
      if (/\b(every other week|biweekly|bi-weekly|every 2 weeks)\b/i.test(p)) {
        return {
          resolved: true,
          spec: { frequency: "WEEKLY", interval: 2, byDay: [], byMonthDay: null, count: null, until: null },
          error: null,
        };
      }

      // "every month on the 1st / 15th" — MUST come before generic "every month" check
      const monthlyDayMatch = p.match(/\bevery month(?:ly)?\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
      if (monthlyDayMatch) {
        const dayNum = parseInt(monthlyDayMatch[1], 10);
        return {
          resolved: true,
          spec: { frequency: "MONTHLY", interval: 1, byDay: [], byMonthDay: dayNum, count: null, until: null },
          error: null,
        };
      }

      // "monthly" / "every month"
      if (/\b(monthly|every month)\b/i.test(p)) {
        return {
          resolved: true,
          spec: { frequency: "MONTHLY", interval: 1, byDay: [], byMonthDay: null, count: null, until: null },
          error: null,
        };
      }

      // "every X weeks"
      const everyXWeeksMatch = p.match(/\bevery\s+(\d+)\s+weeks?\b/i);
      if (everyXWeeksMatch) {
        return {
          resolved: true,
          spec: { frequency: "WEEKLY", interval: parseInt(everyXWeeksMatch[1], 10), byDay: [], byMonthDay: null, count: null, until: null },
          error: null,
        };
      }

      // "every X days"
      const everyXDaysMatch = p.match(/\bevery\s+(\d+)\s+days?\b/i);
      if (everyXDaysMatch) {
        return {
          resolved: true,
          spec: { frequency: "DAILY", interval: parseInt(everyXDaysMatch[1], 10), byDay: [], byMonthDay: null, count: null, until: null },
          error: null,
        };
      }

      return {
        resolved: false,
        spec: null,
        error: `Could not understand recurrence expression: "${recurrenceText}"`,
      };

    } catch (err) {
      return { resolved: false, spec: null, error: err.message };
    }
  }

  /**
   * Convert a provider-independent recurrence spec to a Google Calendar RRULE string.
   * Used by GoogleCalendarProvider — NOT by CalendarManager.
   *
   * @param {object} spec
   * @returns {string[]} Array with one RRULE string, e.g. ["RRULE:FREQ=WEEKLY;BYDAY=MO"]
   */
  static toGoogleRRule(spec) {
    if (!spec || !spec.frequency) return [];

    const parts = [`FREQ=${spec.frequency}`];

    if (spec.interval && spec.interval > 1) {
      parts.push(`INTERVAL=${spec.interval}`);
    }
    if (spec.byDay && spec.byDay.length > 0) {
      parts.push(`BYDAY=${spec.byDay.join(",")}`);
    }
    if (spec.byMonthDay != null) {
      parts.push(`BYMONTHDAY=${spec.byMonthDay}`);
    }
    if (spec.count != null) {
      parts.push(`COUNT=${spec.count}`);
    }
    if (spec.until) {
      // UNTIL requires UTC date string in YYYYMMDDTHHMMSSZ format
      const d = new Date(spec.until);
      const until = d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      parts.push(`UNTIL=${until}`);
    }

    return [`RRULE:${parts.join(";")}`];
  }

  /**
   * Return a human-readable recurrence description for confirmation previews.
   * @param {object} spec
   * @returns {string}
   */
  static toHumanReadable(spec) {
    if (!spec || !spec.frequency) return "";

    const dayNames = { MO:"Monday", TU:"Tuesday", WE:"Wednesday", TH:"Thursday", FR:"Friday", SA:"Saturday", SU:"Sunday" };

    if (spec.frequency === "DAILY") {
      return spec.interval > 1 ? `Every ${spec.interval} days` : "Every day";
    }
    if (spec.frequency === "WEEKLY") {
      const interval = spec.interval > 1 ? `Every ${spec.interval} weeks` : "Every week";
      if (spec.byDay && spec.byDay.length > 0) {
        const dayList = spec.byDay.map(d => dayNames[d] || d).join(", ");
        return `Every ${dayList}`;
      }
      return interval;
    }
    if (spec.frequency === "MONTHLY") {
      if (spec.byMonthDay) return `Monthly on the ${spec.byMonthDay}${RecurrenceResolver._ordinal(spec.byMonthDay)}`;
      return "Every month";
    }
    return "Recurring";
  }

  static _ordinal(n) {
    const s = ["th","st","nd","rd"];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }
}
