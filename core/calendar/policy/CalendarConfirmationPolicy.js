import { createPending, confirmAction, cancelAction } from "../../../services/confirmationService.js";
import { CALENDAR_CONFIG, CALENDAR_INTENT } from "../CalendarConfig.js";
import { RecurrenceResolver } from "../scheduling/RecurrenceResolver.js";

/**
 * CalendarConfirmationPolicy.js
 *
 * Enforces calendar confirmation policy:
 *   - Read-only intents (LIST, FIND, CHECK_AVAILABILITY) → NO confirmation.
 *   - Mutating intents (CREATE, UPDATE, RESCHEDULE, DELETE) → confirmation REQUIRED.
 *
 * Reuses the EXISTING generic confirmationService — does NOT create a separate
 * calendar confirmation service.
 *
 * Builds structured confirmation previews that the frontend can render
 * without understanding Google Calendar API objects.
 */
export class CalendarConfirmationPolicy {
  /**
   * Determine whether an intent requires user confirmation.
   * @param {string} intent
   * @returns {boolean}
   */
  static requiresConfirmation(intent) {
    return CALENDAR_CONFIG.CONFIRMATION_REQUIRED_INTENTS.includes(intent);
  }

  /**
   * Create a pending confirmation for a CREATE_EVENT action.
   *
   * @param {object} params
   * @param {object} params.draft         - Finalized CalendarEventDraft
   * @param {string} params.conversationId
   * @returns {Promise<object>} Confirmation record from confirmationService
   */
  static async requestCreateConfirmation({ draft, conversationId }) {
    const preview = CalendarConfirmationPolicy._buildCreatePreview(draft);

    const payload = {
      tool:   "calendar_create",
      action: "confirmed_create",
      input: {
        draft,
        conversationId,
      },
    };

    return await createPending({
      tool:       "calendar_create",
      action:     "create",
      payload,
      preview,
      title:      "Create Calendar Event",
      message:    CalendarConfirmationPolicy._buildCreateMessage(draft),
      ttlMinutes: CALENDAR_CONFIG.CONFIRMATION_TTL_MINUTES,
    });
  }

  /**
   * Create a pending confirmation for an UPDATE_EVENT / RESCHEDULE_EVENT action.
   *
   * @param {object} params
   * @param {string} params.eventId
   * @param {object} params.before        - Current event state (normalized)
   * @param {object} params.after         - Proposed event state (patch)
   * @param {string} params.conversationId
   * @returns {Promise<object>}
   */
  static async requestUpdateConfirmation({ eventId, before, after, conversationId }) {
    const preview = {
      type:    "calendar_update",
      eventId,
      before: CalendarConfirmationPolicy._buildCreatePreview(before),
      after:  CalendarConfirmationPolicy._buildCreatePreview(after),
    };

    const payload = {
      tool:   "calendar_update",
      action: "confirmed_update",
      input: { eventId, patch: after, conversationId },
    };

    const title = before?.title || after?.title || "Event";
    return await createPending({
      tool:       "calendar_update",
      action:     "update",
      payload,
      preview,
      title:      "Update Calendar Event",
      message:    `Update "${title}"? Here's what will change.`,
      ttlMinutes: CALENDAR_CONFIG.CONFIRMATION_TTL_MINUTES,
    });
  }

  /**
   * Create a pending confirmation for a DELETE_EVENT action.
   *
   * @param {object} params
   * @param {string} params.eventId
   * @param {object} params.event          - Normalized event being deleted
   * @param {string} params.conversationId
   * @returns {Promise<object>}
   */
  static async requestDeleteConfirmation({ eventId, event, conversationId }) {
    const preview = {
      type:    "calendar_delete",
      eventId,
      title:   event.title || "Event",
      start:   event.start || event.startISO,
      end:     event.end   || event.endISO,
      date:    event.start ? new Date(event.start).toDateString() : null,
    };

    const payload = {
      tool:   "calendar_delete",
      action: "confirmed_delete",
      input:  { eventId, conversationId },
    };

    return await createPending({
      tool:       "calendar_delete",
      action:     "delete",
      payload,
      preview,
      title:      "Delete Calendar Event",
      message:    `Are you sure you want to delete "${event.title || "this event"}"?`,
      ttlMinutes: CALENDAR_CONFIG.CONFIRMATION_TTL_MINUTES,
    });
  }

  /**
   * Confirm and execute a pending calendar action.
   * Delegates to the generic confirmationService.confirmAction().
   *
   * @param {string} confirmationId
   * @returns {Promise<object>}
   */
  static async confirm(confirmationId) {
    return await confirmAction(confirmationId);
  }

  /**
   * Cancel a pending calendar confirmation.
   * @param {string} confirmationId
   * @returns {Promise<object>}
   */
  static async cancel(confirmationId) {
    return await cancelAction(confirmationId);
  }

  // ─── Private Preview Builders ─────────────────────────────────────────────

  /**
   * Build a structured CREATE preview for frontend rendering.
   * @param {object} draft
   * @returns {object}
   */
  static _buildCreatePreview(draft) {
    if (!draft) return {};

    const recurrenceHuman = draft.recurrence
      ? RecurrenceResolver.toHumanReadable(draft.recurrence)
      : null;

    return {
      type:       "calendar_create",
      title:      draft.title      || "(Untitled Event)",
      start:      draft.start?.dateTime || null,
      end:        draft.end?.dateTime   || null,
      timezone:   draft.start?.timeZone || null,
      location:   draft.location   || null,
      attendees:  (draft.attendees || []).map(a => ({ name: a.name, email: a.email })),
      recurrence: recurrenceHuman,
      description: draft.description || null,
    };
  }

  /**
   * Build a human-readable confirmation message for a create event.
   * @param {object} draft
   * @returns {string}
   */
  static _buildCreateMessage(draft) {
    const title = draft.title || "Event";
    const tz = draft.start?.timeZone || "UTC";

    let timeStr = "";
    if (draft.start?.dateTime) {
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        weekday: "long", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
      });
      const endFmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true,
      });
      timeStr = fmt.format(new Date(draft.start.dateTime));
      if (draft.end?.dateTime) {
        timeStr += ` – ${endFmt.format(new Date(draft.end.dateTime))}`;
      }
    }

    const recurrenceHuman = draft.recurrence
      ? ` (${RecurrenceResolver.toHumanReadable(draft.recurrence)})`
      : "";

    return `Create "${title}"${recurrenceHuman}?\n${timeStr}`;
  }
}
