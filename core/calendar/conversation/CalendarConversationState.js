import { CALENDAR_STATUS, CALENDAR_CONFIG } from "../CalendarConfig.js";

/**
 * CalendarConversationState.js
 *
 * Encapsulates multi-turn calendar conversation state for a single session.
 *
 * A CalendarEventDraft is built incrementally across turns:
 *   title, date, startTime, endTime, duration, attendees, location,
 *   recurrence, reminders — collected as the user provides them.
 *
 * The finalized draft is persisted on the session before confirmation,
 * ensuring it can never be reconstructed lossily after an error.
 */
export class CalendarConversationState {
  /**
   * @param {object} [params={}]
   * @param {string} [params.conversationId]
   * @param {string} [params.status]
   * @param {string} [params.intent]         - CALENDAR_INTENT constant
   * @param {string} [params.title]
   * @param {string} [params.rawDate]         - Raw user date expression ("tomorrow", "Friday")
   * @param {string} [params.rawStartTime]    - Raw user time expression ("4 PM", "16:00")
   * @param {string} [params.rawEndTime]
   * @param {number|null} [params.durationMinutes]
   * @param {string} [params.resolvedStart]   - ISO 8601 datetime string
   * @param {string} [params.resolvedEnd]     - ISO 8601 datetime string
   * @param {string} [params.timezone]
   * @param {Array}  [params.attendees]       - [{name, email}]
   * @param {string} [params.location]
   * @param {object} [params.recurrence]      - Provider-independent recurrence spec
   * @param {Array}  [params.reminders]
   * @param {string} [params.description]
   * @param {object} [params.targetEvent]     - For UPDATE/DELETE: event being modified
   * @param {Array}  [params.missingFields]
   * @param {string} [params.confirmationId]
   * @param {object} [params.draft]           - Finalized CalendarEventDraft
   * @param {string} [params.eventId]         - Created/modified event ID
   */
  constructor({
    conversationId   = null,
    status           = CALENDAR_STATUS.IDLE,
    intent           = null,
    title            = "",
    rawDate          = "",
    rawStartTime     = "",
    rawEndTime       = "",
    durationMinutes  = null,
    resolvedStart    = null,
    resolvedEnd      = null,
    timezone         = null,
    attendees        = [],
    location         = null,
    recurrence       = null,
    reminders        = [],
    description      = "",
    targetEvent      = null,
    missingFields    = [],
    confirmationId   = null,
    draft            = null,
    eventId          = null,
  } = {}) {
    this.conversationId  = conversationId || `cal-conv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    this.status          = status;
    this.intent          = intent;
    this.title           = title;
    this.rawDate         = rawDate;
    this.rawStartTime    = rawStartTime;
    this.rawEndTime      = rawEndTime;
    this.durationMinutes = durationMinutes;
    this.resolvedStart   = resolvedStart;
    this.resolvedEnd     = resolvedEnd;
    this.timezone        = timezone;
    this.attendees       = attendees;
    this.location        = location;
    this.recurrence      = recurrence;
    this.reminders       = reminders;
    this.description     = description;
    this.targetEvent     = targetEvent;
    this.missingFields   = missingFields;
    this.confirmationId  = confirmationId;
    this.draft           = draft;
    this.eventId         = eventId;
    this.createdAt       = new Date().toISOString();
    this.updatedAt       = new Date().toISOString();
    this.expiresAt       = new Date(Date.now() + CALENDAR_CONFIG.CONVERSATION_EXPIRATION_MS).toISOString();
  }

  /**
   * Merge field updates into the session, refreshing updatedAt.
   * @param {object} fields
   * @returns {CalendarConversationState}
   */
  update(fields = {}) {
    Object.assign(this, fields);
    this.updatedAt = new Date().toISOString();
    return this;
  }

  /**
   * Determine which required fields are still missing for a CREATE_EVENT.
   * Returns an array of field names that still need to be collected.
   *
   * @returns {string[]}
   */
  getMissingFields() {
    const missing = [];
    if (!this.title)                        missing.push("title");
    if (!this.resolvedStart && !this.rawDate && !this.rawStartTime) {
      // No date/time at all
      missing.push("date");
    } else if (this.rawDate && !this.resolvedStart) {
      // Date known but time unknown
      if (!this.rawStartTime)               missing.push("startTime");
    }
    return missing;
  }

  /**
   * Build the structured CalendarEventDraft from session fields.
   * Call this when all required fields are present.
   *
   * @returns {object} CalendarEventDraft
   */
  buildDraft() {
    return {
      title:       this.title || "(Calendar Event)",
      description: this.description || "",
      start: {
        dateTime: this.resolvedStart,
        timeZone: this.timezone,
      },
      end: {
        dateTime: this.resolvedEnd,
        timeZone: this.timezone,
      },
      attendees:   this.attendees || [],
      location:    this.location  || null,
      recurrence:  this.recurrence || null,
      reminders:   this.reminders || [],
      metadata: {
        conversationId: this.conversationId,
        intent:         this.intent,
      },
    };
  }

  toJSON() {
    return {
      conversationId:  this.conversationId,
      status:          this.status,
      intent:          this.intent,
      title:           this.title,
      rawDate:         this.rawDate,
      rawStartTime:    this.rawStartTime,
      rawEndTime:      this.rawEndTime,
      durationMinutes: this.durationMinutes,
      resolvedStart:   this.resolvedStart,
      resolvedEnd:     this.resolvedEnd,
      timezone:        this.timezone,
      attendees:       this.attendees,
      location:        this.location,
      recurrence:      this.recurrence,
      missingFields:   this.missingFields,
      confirmationId:  this.confirmationId,
      draft:           this.draft,
      eventId:         this.eventId,
      createdAt:       this.createdAt,
      updatedAt:       this.updatedAt,
      expiresAt:       this.expiresAt,
    };
  }
}
