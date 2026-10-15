import { CALENDAR_ERROR } from "../CalendarConfig.js";

/**
 * CalendarValidationPolicy.js
 *
 * Validates calendar event drafts and action inputs before provider execution.
 * Rejects malformed actions before they reach Google Calendar API.
 *
 * Called by CalendarManager immediately before creating a confirmation or
 * executing a read-only action.
 */
export class CalendarValidationPolicy {
  static EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /**
   * Validate an email address string.
   * @param {string} str
   * @returns {boolean}
   */
  static isValidEmail(str) {
    return typeof str === "string" && CalendarValidationPolicy.EMAIL_REGEX.test(str.trim());
  }

  /**
   * Validate a CalendarEventDraft for CREATE_EVENT.
   *
   * @param {object} draft
   * @returns {{ valid: boolean, errors: string[], errorCode: string|null }}
   */
  static validateCreateDraft(draft) {
    const errors = [];

    if (!draft) {
      return { valid: false, errors: ["No event draft provided."], errorCode: CALENDAR_ERROR.VALIDATION_FAILED };
    }

    // Title
    if (!draft.title || typeof draft.title !== "string" || draft.title.trim().length === 0) {
      errors.push("Event title is required.");
    }

    // Start datetime
    if (!draft.start || !draft.start.dateTime) {
      errors.push("Event start time is required.");
    } else if (isNaN(new Date(draft.start.dateTime).getTime())) {
      errors.push(`Invalid start datetime: "${draft.start.dateTime}"`);
    }

    // End datetime
    if (!draft.end || !draft.end.dateTime) {
      errors.push("Event end time is required.");
    } else if (isNaN(new Date(draft.end.dateTime).getTime())) {
      errors.push(`Invalid end datetime: "${draft.end.dateTime}"`);
    }

    // Start < End
    if (draft.start?.dateTime && draft.end?.dateTime) {
      const s = new Date(draft.start.dateTime).getTime();
      const e = new Date(draft.end.dateTime).getTime();
      if (s >= e) {
        errors.push("Event start time must be before end time.");
      }
    }

    // Timezone
    if (!draft.start?.timeZone) {
      errors.push("Event timezone is required.");
    }

    // Attendee emails
    if (draft.attendees && draft.attendees.length > 0) {
      for (const attendee of draft.attendees) {
        if (attendee.email && !CalendarValidationPolicy.isValidEmail(attendee.email)) {
          errors.push(`Invalid attendee email: "${attendee.email}"`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      errorCode: errors.length > 0 ? CALENDAR_ERROR.VALIDATION_FAILED : null,
    };
  }

  /**
   * Validate an UPDATE_EVENT action.
   *
   * @param {object} params
   * @param {string} params.eventId
   * @param {object} params.patch
   * @returns {{ valid: boolean, errors: string[], errorCode: string|null }}
   */
  static validateUpdateAction({ eventId, patch }) {
    const errors = [];

    if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
      errors.push("Event ID is required for update.");
    }

    if (!patch || typeof patch !== "object" || Object.keys(patch).length === 0) {
      errors.push("At least one field must be provided for update.");
    }

    // If new times are provided, they must be valid and start < end
    if (patch?.start?.dateTime && patch?.end?.dateTime) {
      const s = new Date(patch.start.dateTime).getTime();
      const e = new Date(patch.end.dateTime).getTime();
      if (s >= e) {
        errors.push("Updated start time must be before end time.");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      errorCode: errors.length > 0 ? CALENDAR_ERROR.VALIDATION_FAILED : null,
    };
  }

  /**
   * Validate a DELETE_EVENT action.
   *
   * @param {object} params
   * @param {string} params.eventId
   * @returns {{ valid: boolean, errors: string[], errorCode: string|null }}
   */
  static validateDeleteAction({ eventId }) {
    const errors = [];
    if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
      errors.push("Event ID is required for deletion.");
    }
    return {
      valid: errors.length === 0,
      errors,
      errorCode: errors.length > 0 ? CALENDAR_ERROR.VALIDATION_FAILED : null,
    };
  }

  /**
   * Validate a time window for availability checking.
   *
   * @param {string} startISO
   * @param {string} endISO
   * @returns {{ valid: boolean, errors: string[], errorCode: string|null }}
   */
  static validateTimeWindow(startISO, endISO) {
    const errors = [];

    if (!startISO || isNaN(new Date(startISO).getTime())) {
      errors.push("Invalid start time for availability check.");
    }
    if (!endISO || isNaN(new Date(endISO).getTime())) {
      errors.push("Invalid end time for availability check.");
    }
    if (startISO && endISO && !isNaN(new Date(startISO)) && !isNaN(new Date(endISO))) {
      if (new Date(startISO).getTime() >= new Date(endISO).getTime()) {
        errors.push("Start time must be before end time.");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      errorCode: errors.length > 0 ? CALENDAR_ERROR.INVALID_DATETIME : null,
    };
  }
}
