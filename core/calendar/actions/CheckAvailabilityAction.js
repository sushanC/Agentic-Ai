import { AvailabilityEngine } from "../scheduling/AvailabilityEngine.js";
import { calendarRegistry } from "../CalendarRegistry.js";

/**
 * CheckAvailabilityAction.js
 *
 * ToolRegistry-compatible action for checking calendar availability.
 * Does NOT require confirmation — it is read-only.
 *
 * Delegates to AvailabilityEngine, which uses the provider to check free/busy.
 */
export class CheckAvailabilityAction {
  requiresConfirmation = false;

  async execute(action) {
    const input    = action.input || {};
    const provider = calendarRegistry.getProvider();

    // Mode 1: Specific window check ("Am I free from 2 to 4?")
    if (input.startISO && input.endISO) {
      return await AvailabilityEngine.checkWindow({
        startISO:   input.startISO,
        endISO:     input.endISO,
        timezone:   input.timezone,
        calendarId: input.calendarId,
        provider,
      });
    }

    // Mode 2: Find free slots ("Find me a free 1-hour slot Friday afternoon")
    if (input.searchStartISO && input.searchEndISO) {
      return await AvailabilityEngine.findFreeSlots({
        searchStartISO: input.searchStartISO,
        searchEndISO:   input.searchEndISO,
        durationMinutes: input.durationMinutes || 60,
        timezone:       input.timezone,
        calendarId:     input.calendarId,
        provider,
      });
    }

    return {
      success: false,
      answer:  "Please specify a time window to check availability.",
      error:   "Missing time window parameters.",
    };
  }
}
