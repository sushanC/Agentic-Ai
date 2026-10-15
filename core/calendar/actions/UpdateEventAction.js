import { calendarRegistry } from "../CalendarRegistry.js";
import { CalendarValidationPolicy } from "../policy/CalendarValidationPolicy.js";
import { CALENDAR_ERROR } from "../CalendarConfig.js";

/**
 * UpdateEventAction.js
 *
 * ToolRegistry-compatible action for confirmed calendar event updates.
 * Used for both UPDATE_EVENT and RESCHEDULE_EVENT intents.
 */
export class UpdateEventAction {
  requiresConfirmation = true;

  async execute(action) {
    const input = action.input || {};
    const { eventId, patch, conversationId } = input;

    const validation = CalendarValidationPolicy.validateUpdateAction({ eventId, patch });
    if (!validation.valid) {
      const err = new Error(validation.errors.join("; "));
      err.code = CALENDAR_ERROR.VALIDATION_FAILED;
      err.userMessage = `Update validation failed: ${validation.errors[0]}`;
      throw err;
    }

    const provider = calendarRegistry.getProvider();
    const result   = await provider.updateEvent(eventId, patch);

    if (!result.success) {
      const err = new Error(result.error || "Failed to update calendar event.");
      err.code              = result.errorCode || CALENDAR_ERROR.PROVIDER_ERROR;
      err.recoverable       = result.recoverable !== false;
      err.automaticRetryable = result.automaticRetryable === true;
      err.recoveryAction    = result.recoveryAction || null;
      err.requiresReauth    = result.requiresAuthorization === true;
      err.authUrl           = result.authUrl || null;
      err.userMessage       = result.requiresAuthorization
        ? "Please connect your Google Calendar to update events."
        : "Failed to update the calendar event.";
      throw err;
    }

    return {
      success: true,
      eventId: result.eventId || eventId,
      event:   result.event,
      message: `✅ Event updated successfully.`,
    };
  }
}
