/**
 * core/calendar/index.js
 *
 * Public API for Calendar System V1.
 * All external consumers import from here, not from internal calendar modules.
 */

export { calendarManager }    from "./CalendarManager.js";
export { calendarRegistry }   from "./CalendarRegistry.js";
export { calendarDiagnostics } from "./CalendarDiagnostics.js";
export { CalendarResult }     from "./CalendarResult.js";
export { CALENDAR_STATUS, CALENDAR_INTENT, CALENDAR_ERROR, CALENDAR_CONFIG } from "./CalendarConfig.js";
