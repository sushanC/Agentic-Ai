import { CALENDAR_STATUS } from "./CalendarConfig.js";

/**
 * CalendarResult.js
 *
 * Standardized return contract for all Calendar System V1 operations.
 * Mirrors the pattern of EmailResult.js to maintain architectural consistency.
 *
 * CalendarManager always returns a CalendarResult.
 * CalendarCapability wraps it in a CapabilityResult.
 */
export class CalendarResult {
  /**
   * Create a standardized CalendarResult object.
   *
   * @param {object} params
   * @param {boolean} [params.success=true]
   * @param {string}  [params.status]                 - CALENDAR_STATUS constant
   * @param {string}  [params.intent]                  - CALENDAR_INTENT constant
   * @param {string}  [params.operation="query"]        - "create"|"update"|"delete"|"list"|"availability"|"query"
   * @param {string}  [params.conversationId=""]
   * @param {string}  [params.answer=""]               - Human-readable response (Chat + Voice)
   * @param {object}  [params.draft=null]              - CalendarEventDraft before confirmation
   * @param {Array}   [params.events=[]]               - Returned event list (for LIST/FIND)
   * @param {object}  [params.availability=null]       - Availability result for CHECK_AVAILABILITY
   * @param {string}  [params.missingField=null]       - Which field is being collected
   * @param {string}  [params.confirmationId=null]
   * @param {string}  [params.eventId=null]            - Google Calendar event ID on success
   * @param {string}  [params.error=null]              - Error code or message
   * @param {object}  [params.metadata={}]             - Recovery metadata, timestamps, etc.
   * @returns {object}
   */
  static create({
    success         = true,
    status          = CALENDAR_STATUS.IDLE,
    intent          = null,
    operation       = "query",
    conversationId  = "",
    answer          = "",
    draft           = null,
    events          = [],
    availability    = null,
    missingField    = null,
    confirmationId  = null,
    eventId         = null,
    error           = null,
    metadata        = {},
  }) {
    return {
      success:        Boolean(success),
      status:         String(status),
      intent:         intent ? String(intent) : null,
      operation:      String(operation),
      conversationId: String(conversationId || ""),
      answer:         String(answer || ""),
      response:       String(answer || ""),  // alias for WorkflowResult compatibility
      draft:          draft   ? { ...draft }   : null,
      events:         Array.isArray(events) ? events : [],
      availability:   availability ? { ...availability } : null,
      missingField:   missingField  ? String(missingField)  : null,
      confirmationId: confirmationId ? String(confirmationId) : null,
      eventId:        eventId  ? String(eventId)  : null,
      error:          error ? (typeof error === "string" ? error : (error.message || String(error))) : null,
      metadata: {
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    };
  }
}
