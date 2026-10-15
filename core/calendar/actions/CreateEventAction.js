import { calendarRegistry } from "../CalendarRegistry.js";
import { CalendarValidationPolicy } from "../policy/CalendarValidationPolicy.js";
import { CALENDAR_ERROR } from "../CalendarConfig.js";

/**
 * CreateEventAction.js
 *
 * ToolRegistry-compatible action for confirmed calendar event creation.
 *
 * Called ONLY after the user has confirmed via the confirmation flow:
 *   CalendarConfirmationPolicy.requestCreateConfirmation()
 *     → confirmationService.createPending()
 *       → confirmAction(id)
 *         → ToolRegistry → CreateEventAction.execute()
 *           → GoogleCalendarProvider.createEvent()
 *
 * Idempotency: The confirmationService removes the pending record on first
 * execution. A second confirmAction() for the same ID returns "not found",
 * which CalendarManager maps to a safe already-completed response.
 * This class never needs to track its own idempotency state.
 *
 * ToolRegistry contract: execute(action) where action = { tool, action, input, _confirmedAt }
 */
export class CreateEventAction {
  requiresConfirmation = true;

  async execute(action) {
    const input = action.input || {};
    const { draft, conversationId } = input;

    // Validate the draft before calling the provider
    const validation = CalendarValidationPolicy.validateCreateDraft(draft);
    if (!validation.valid) {
      const err = new Error(validation.errors.join("; "));
      err.code = CALENDAR_ERROR.VALIDATION_FAILED;
      err.userMessage = `Calendar event validation failed: ${validation.errors[0]}`;
      throw err;
    }

    const provider = calendarRegistry.getProvider();
    const result   = await provider.createEvent(draft);

    if (!result.success) {
      // Propagate structured error metadata through to confirmationService
      const err = new Error(result.error || "Failed to create calendar event.");
      err.code              = result.errorCode || CALENDAR_ERROR.PROVIDER_ERROR;
      err.recoverable       = result.recoverable !== false;
      err.automaticRetryable = result.automaticRetryable === true;
      err.recoveryAction    = result.recoveryAction || null;
      err.requiresReauth    = result.requiresAuthorization === true;
      err.authUrl           = result.authUrl || null;
      err.userMessage       = result.requiresAuthorization
        ? "Please connect your Google Calendar to create events."
        : "Failed to create the calendar event.";
      throw err;
    }

    return {
      success:  true,
      eventId:  result.eventId,
      event:    result.event,
      message:  `✅ "${draft.title}" has been added to your calendar.`,
    };
  }
}
