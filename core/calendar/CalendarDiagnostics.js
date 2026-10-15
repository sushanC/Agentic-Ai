import { developerEvents } from "../events/DeveloperEvents.js";

/**
 * CalendarDiagnostics.js
 *
 * Structured telemetry and event bridge for Calendar System V1.
 * Emits developer events to DeveloperEvents — the same event bus used by Email V2.
 *
 * Security:
 *   - Never logs OAuth tokens, authorization codes, or client secrets.
 *   - Does not dump full calendar event details (avoid private calendar leakage).
 *   - Truncates user prompts to 100 chars in logs.
 */
export class CalendarDiagnostics {
  constructor() {
    this.events = developerEvents;
  }

  // ─── Conversation Lifecycle ───────────────────────────────────────────────

  logConversationStarted(conversationId, prompt) {
    this.events.emitDevEvent("CalendarConversationStarted", {
      conversationId,
      prompt: (prompt || "").slice(0, 100),
    });
  }

  logConversationUpdated(conversationId, status, missingField) {
    this.events.emitDevEvent("CalendarConversationUpdated", {
      conversationId,
      status,
      missingField: missingField || null,
    });
  }

  // ─── Intent & Fields ─────────────────────────────────────────────────────

  logIntentDetected(conversationId, intent, confidence) {
    this.events.emitDevEvent("CalendarIntentDetected", {
      conversationId,
      intent,
      confidence,
    });
  }

  logFieldsExtracted(conversationId, fields) {
    // Only log field names (not values) to avoid logging private calendar content
    this.events.emitDevEvent("CalendarFieldsExtracted", {
      conversationId,
      extractedFields: Object.keys(fields).filter(k => fields[k] !== null && fields[k] !== ""),
    });
  }

  // ─── Date/Time Resolution ────────────────────────────────────────────────

  logDateTimeResolved(conversationId, expression, resolvedISO, timezone) {
    this.events.emitDevEvent("DateTimeResolved", {
      conversationId,
      expression: (expression || "").slice(0, 80),
      resolvedISO,
      timezone,
    });
  }

  logDateTimeAmbiguous(conversationId, expression, reason) {
    this.events.emitDevEvent("DateTimeAmbiguous", {
      conversationId,
      expression: (expression || "").slice(0, 80),
      reason,
    });
  }

  // ─── Attendee Resolution ─────────────────────────────────────────────────

  logAttendeeResolved(conversationId, name, email) {
    this.events.emitDevEvent("AttendeeResolved", {
      conversationId,
      name,
      email,  // email is safe to log (not a secret)
    });
  }

  logAttendeeAmbiguous(conversationId, query, count) {
    this.events.emitDevEvent("AttendeeAmbiguous", {
      conversationId,
      query,
      count,
    });
  }

  // ─── Availability & Conflicts ────────────────────────────────────────────

  logAvailabilityChecked(conversationId, isFree, conflictCount) {
    this.events.emitDevEvent("AvailabilityChecked", {
      conversationId,
      isFree,
      conflictCount,
    });
  }

  logConflictDetected(conversationId, conflictingEventTitle, conflictingStart) {
    this.events.emitDevEvent("ConflictDetected", {
      conversationId,
      conflictingEventTitle,
      conflictingStart,
    });
  }

  // ─── Draft & Confirmation ────────────────────────────────────────────────

  logDraftCreated(conversationId, draftSummary) {
    this.events.emitDevEvent("CalendarDraftCreated", {
      conversationId,
      title:    draftSummary.title || "(untitled)",
      date:     draftSummary.date  || null,
      hasRecurrence: Boolean(draftSummary.recurrence),
    });
  }

  logConfirmationCreated(conversationId, confirmationId, intent) {
    this.events.emitDevEvent("CalendarConfirmationCreated", {
      conversationId,
      confirmationId,
      intent,
    });
  }

  logConfirmationResolved(confirmationId, intent, success) {
    this.events.emitDevEvent("CalendarConfirmationResolved", {
      confirmationId,
      intent,
      success,
    });
  }

  // ─── Provider Calls ───────────────────────────────────────────────────────

  logProviderCallStarted(conversationId, operation) {
    this.events.emitDevEvent("CalendarProviderCallStarted", {
      conversationId,
      operation,
    });
  }

  logProviderCallFinished(conversationId, operation, durationMs, success) {
    this.events.emitDevEvent("CalendarProviderCallFinished", {
      conversationId,
      operation,
      durationMs,
      success,
    });
  }

  // ─── Event Mutations ─────────────────────────────────────────────────────

  logEventCreated(conversationId, eventId) {
    this.events.emitDevEvent("CalendarEventCreated", {
      conversationId,
      eventId,
    });
  }

  logEventUpdated(conversationId, eventId) {
    this.events.emitDevEvent("CalendarEventUpdated", {
      conversationId,
      eventId,
    });
  }

  logEventDeleted(conversationId, eventId) {
    this.events.emitDevEvent("CalendarEventDeleted", {
      conversationId,
      eventId,
    });
  }

  // ─── Recovery & Errors ───────────────────────────────────────────────────

  logRecoveryRequired(conversationId, reason, recoveryAction) {
    this.events.emitDevEvent("CalendarRecoveryRequired", {
      conversationId,
      reason,
      recoveryAction,
    });
  }

  logError(conversationId, operation, errorCode, errorMessage) {
    this.events.emitDevEvent("CalendarError", {
      conversationId,
      operation,
      errorCode,
      // Truncate error messages; never log full stack traces with tokens
      errorMessage: (errorMessage || "").slice(0, 200),
    });
  }
}

export const calendarDiagnostics = new CalendarDiagnostics();
