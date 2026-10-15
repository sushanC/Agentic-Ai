/**
 * CalendarConfig.js
 *
 * Centralized configuration, status constants, intent constants,
 * and defaults for the Calendar & Scheduling System V1.
 *
 * All magic strings and tuneable values live here.
 * CalendarManager, DateTimeResolver, and CalendarConfirmationPolicy
 * read from this file — never hard-code these values elsewhere.
 */

// ─── Conversation State Machine States ────────────────────────────────────────

export const CALENDAR_STATUS = Object.freeze({
  IDLE:                 "idle",
  COLLECTING_TITLE:     "collecting_title",
  COLLECTING_DATE:      "collecting_date",
  COLLECTING_START_TIME:"collecting_start_time",
  COLLECTING_END_TIME:  "collecting_end_time",
  COLLECTING_DURATION:  "collecting_duration",
  COLLECTING_ATTENDEES: "collecting_attendees",
  CHECKING_CONFLICTS:   "checking_conflicts",
  WAITING_CONFIRMATION: "waiting_confirmation",
  CREATING:             "creating",
  UPDATING:             "updating",
  DELETING:             "deleting",
  COMPLETED:            "completed",
  CANCELLED:            "cancelled",
  RECOVERY_REQUIRED:    "recovery_required",
  FAILED:               "failed",
});

// ─── Intent Constants ─────────────────────────────────────────────────────────

export const CALENDAR_INTENT = Object.freeze({
  CREATE_EVENT:         "CREATE_EVENT",
  UPDATE_EVENT:         "UPDATE_EVENT",
  DELETE_EVENT:         "DELETE_EVENT",
  RESCHEDULE_EVENT:     "RESCHEDULE_EVENT",
  LIST_EVENTS:          "LIST_EVENTS",
  FIND_EVENT:           "FIND_EVENT",
  CHECK_AVAILABILITY:   "CHECK_AVAILABILITY",
  CONFIRM:              "CONFIRM",
  CANCEL:               "CANCEL",
});

// ─── Error Codes ──────────────────────────────────────────────────────────────

export const CALENDAR_ERROR = Object.freeze({
  AUTH_REQUIRED:          "CALENDAR_AUTH_REQUIRED",
  PERMISSION_DENIED:      "CALENDAR_PERMISSION_DENIED",
  EVENT_NOT_FOUND:        "CALENDAR_EVENT_NOT_FOUND",
  CONFLICT:               "CALENDAR_CONFLICT",
  INVALID_DATETIME:       "CALENDAR_INVALID_DATETIME",
  INVALID_ATTENDEE:       "CALENDAR_INVALID_ATTENDEE",
  PROVIDER_ERROR:         "CALENDAR_PROVIDER_ERROR",
  RATE_LIMITED:           "CALENDAR_RATE_LIMITED",
  DUPLICATE_PREVENTED:    "CALENDAR_DUPLICATE_PREVENTED",
  VALIDATION_FAILED:      "CALENDAR_VALIDATION_FAILED",
  AMBIGUOUS_EVENT:        "CALENDAR_AMBIGUOUS_EVENT",
});

// ─── Tuneable Configuration ───────────────────────────────────────────────────

export const CALENDAR_CONFIG = {
  /**
   * Default event duration in minutes when only a start time is given.
   * Used by DateTimeResolver and CalendarManager.
   */
  DEFAULT_EVENT_DURATION_MINUTES: 60,

  /**
   * Session expiration TTL in milliseconds.
   * Conversations that have been idle longer than this are discarded.
   */
  CONVERSATION_EXPIRATION_MS: 30 * 60 * 1000,   // 30 minutes

  /**
   * How long (in minutes) a pending calendar confirmation remains valid
   * before it auto-expires in pendingActionsStorage.
   */
  CONFIRMATION_TTL_MINUTES: 30,

  /**
   * Primary Google Calendar ID to operate on.
   * "primary" refers to the user's main calendar.
   */
  DEFAULT_CALENDAR_ID: "primary",

  /**
   * Default provider name (used by CalendarRegistry).
   */
  DEFAULT_PROVIDER: "google",

  /**
   * Fallback timezone when userPreferences.timezone and CALENDAR_TIMEZONE are both absent.
   * Derived from the Node.js runtime's system locale.
   */
  get FALLBACK_TIMEZONE() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  },

  /**
   * User-configured timezone from environment variable (optional).
   * Checked before FALLBACK_TIMEZONE.
   */
  get CONFIGURED_TIMEZONE() {
    return process.env.CALENDAR_TIMEZONE || null;
  },

  /**
   * Maximum number of events returned by ListEvents by default.
   */
  LIST_EVENTS_MAX_RESULTS: 10,

  /**
   * Maximum number of events to check when looking for conflicts.
   */
  CONFLICT_CHECK_MAX_RESULTS: 50,

  /**
   * Intents that require user confirmation before provider execution.
   * Read-only intents (LIST, FIND, CHECK_AVAILABILITY) are excluded.
   */
  CONFIRMATION_REQUIRED_INTENTS: [
    "CREATE_EVENT",
    "UPDATE_EVENT",
    "RESCHEDULE_EVENT",
    "DELETE_EVENT",
  ],
};
