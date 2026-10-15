import { calendarRegistry } from "../CalendarRegistry.js";
import { CalendarValidationPolicy } from "../policy/CalendarValidationPolicy.js";
import { CALENDAR_ERROR } from "../CalendarConfig.js";

/**
 * DeleteEventAction.js
 *
 * ToolRegistry-compatible action for confirmed calendar event deletion.
 * Idempotency: If the event was already deleted (410 Gone), the provider
 * returns success, and this action returns cleanly.
 */
export class DeleteEventAction {
  requiresConfirmation = true;

  async execute(action) {
    const input = action.input || {};
    const { eventId, conversationId } = input;

    const validation = CalendarValidationPolicy.validateDeleteAction({ eventId });
    if (!validation.valid) {
      const err = new Error(validation.errors.join("; "));
      err.code = CALENDAR_ERROR.VALIDATION_FAILED;
      err.userMessage = `Delete validation failed: ${validation.errors[0]}`;
      throw err;
    }

    const provider = calendarRegistry.getProvider();
    const result   = await provider.deleteEvent(eventId);

    if (!result.success) {
      const err = new Error(result.error || "Failed to delete calendar event.");
      err.code              = result.errorCode || CALENDAR_ERROR.PROVIDER_ERROR;
      err.recoverable       = result.recoverable !== false;
      err.automaticRetryable = result.automaticRetryable === true;
      err.recoveryAction    = result.recoveryAction || null;
      err.requiresReauth    = result.requiresAuthorization === true;
      err.authUrl           = result.authUrl || null;
      err.userMessage       = result.requiresAuthorization
        ? "Please connect your Google Calendar to delete events."
        : "Failed to delete the calendar event.";
      throw err;
    }

    return {
      success: true,
      eventId,
      message: "✅ Event has been deleted from your calendar.",
    };
  }
}
