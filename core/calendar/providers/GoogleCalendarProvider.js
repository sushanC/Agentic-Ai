import { google } from "googleapis";
import { BaseCalendarProvider } from "./BaseCalendarProvider.js";
import { googleAuthManager } from "../../google/GoogleAuthManager.js";
import { RecurrenceResolver } from "../scheduling/RecurrenceResolver.js";
import { CALENDAR_CONFIG, CALENDAR_ERROR } from "../CalendarConfig.js";

/**
 * GoogleCalendarProvider.js
 *
 * Google Calendar API provider implementing BaseCalendarProvider.
 *
 * Responsibilities:
 *   - All Google Calendar API calls are made here and ONLY here.
 *   - Normalizes raw Google API responses into stable internal result objects.
 *   - Translates provider-independent CalendarEventDraft → Google event format.
 *   - Detects and classifies authorization errors (missing Calendar scope) vs.
 *     generic API errors vs. rate limiting.
 *   - Translates provider-independent recurrence specs to RRULE strings.
 *
 * CalendarManager never sees raw googleapis objects.
 */
export class GoogleCalendarProvider extends BaseCalendarProvider {
  constructor() {
    super("google", "Google Calendar API");
    this._authManager = googleAuthManager;
  }

  // ─── Status ───────────────────────────────────────────────────────────────

  async getStatus() {
    return this._authManager.getCalendarStatus();
  }

  // ─── Auth Helper ──────────────────────────────────────────────────────────

  /**
   * Get an authenticated Google Calendar API client.
   * Returns null + sets requiresAuthorization if Calendar scope is missing.
   *
   * @returns {Promise<{calendar: object}|{requiresAuthorization: true, authUrl: string, reason: string}>}
   */
  async _getCalendarClient() {
    const authResult = await this._authManager.getCalendarAuthenticatedClient();

    if (authResult.requiresAuthorization) {
      return authResult; // Propagate recovery metadata
    }

    const calendar = google.calendar({ version: "v3", auth: authResult.client });
    return { calendar };
  }

  // ─── Create Event ─────────────────────────────────────────────────────────

  /**
   * Create a new Google Calendar event from a CalendarEventDraft.
   *
   * @param {object} draft           - CalendarEventDraft
   * @param {string} [calendarId]
   * @returns {Promise<{success: boolean, event: object|null, eventId: string|null, error: string|null, errorCode: string|null, requiresAuthorization?: boolean, authUrl?: string}>}
   */
  async createEvent(draft, calendarId = CALENDAR_CONFIG.DEFAULT_CALENDAR_ID) {
    try {
      const clientResult = await this._getCalendarClient();
      if (clientResult.requiresAuthorization) {
        return this._authRequiredResult(clientResult);
      }

      const { calendar } = clientResult;
      const googleEvent  = this._draftToGoogleEvent(draft);

      const response = await calendar.events.insert({
        calendarId,
        requestBody: googleEvent,
        sendUpdates: draft.attendees && draft.attendees.length > 0 ? "all" : "none",
      });

      return {
        success:  true,
        event:    this._normalizeEvent(response.data),
        eventId:  response.data.id,
        error:    null,
        errorCode: null,
      };

    } catch (err) {
      return this._handleProviderError("createEvent", err);
    }
  }

  // ─── Update Event ─────────────────────────────────────────────────────────

  /**
   * Update an existing event with a patch.
   *
   * @param {string} eventId
   * @param {object} patch   - Partial event fields (same structure as CalendarEventDraft)
   * @param {string} [calendarId]
   * @returns {Promise<{success: boolean, event: object|null, error: string|null, errorCode: string|null}>}
   */
  async updateEvent(eventId, patch, calendarId = CALENDAR_CONFIG.DEFAULT_CALENDAR_ID) {
    try {
      const clientResult = await this._getCalendarClient();
      if (clientResult.requiresAuthorization) {
        return this._authRequiredResult(clientResult);
      }

      const { calendar } = clientResult;
      const googlePatch  = this._draftToGoogleEvent(patch);

      const response = await calendar.events.patch({
        calendarId,
        eventId,
        requestBody: googlePatch,
      });

      return {
        success:  true,
        event:    this._normalizeEvent(response.data),
        eventId:  response.data.id,
        error:    null,
        errorCode: null,
      };

    } catch (err) {
      return this._handleProviderError("updateEvent", err);
    }
  }

  // ─── Delete Event ─────────────────────────────────────────────────────────

  /**
   * Delete a calendar event by ID.
   *
   * @param {string} eventId
   * @param {string} [calendarId]
   * @returns {Promise<{success: boolean, error: string|null, errorCode: string|null}>}
   */
  async deleteEvent(eventId, calendarId = CALENDAR_CONFIG.DEFAULT_CALENDAR_ID) {
    try {
      const clientResult = await this._getCalendarClient();
      if (clientResult.requiresAuthorization) {
        return this._authRequiredResult(clientResult);
      }

      const { calendar } = clientResult;
      await calendar.events.delete({ calendarId, eventId });

      return { success: true, error: null, errorCode: null };

    } catch (err) {
      // 410 Gone = already deleted; treat as success
      if (err.code === 410 || (err.response && err.response.status === 410)) {
        return { success: true, error: null, errorCode: null };
      }
      return this._handleProviderError("deleteEvent", err);
    }
  }

  // ─── Get Event ────────────────────────────────────────────────────────────

  /**
   * Retrieve a single event by ID.
   *
   * @param {string} eventId
   * @param {string} [calendarId]
   * @returns {Promise<{success: boolean, event: object|null, error: string|null, errorCode: string|null}>}
   */
  async getEvent(eventId, calendarId = CALENDAR_CONFIG.DEFAULT_CALENDAR_ID) {
    try {
      const clientResult = await this._getCalendarClient();
      if (clientResult.requiresAuthorization) {
        return this._authRequiredResult(clientResult);
      }

      const { calendar } = clientResult;
      const response = await calendar.events.get({ calendarId, eventId });

      return {
        success:  true,
        event:    this._normalizeEvent(response.data),
        error:    null,
        errorCode: null,
      };

    } catch (err) {
      return this._handleProviderError("getEvent", err);
    }
  }

  // ─── List Events ──────────────────────────────────────────────────────────

  /**
   * List events in a time range.
   *
   * @param {object} options
   * @param {string} [options.calendarId]
   * @param {string} [options.timeMin]
   * @param {string} [options.timeMax]
   * @param {number} [options.maxResults]
   * @param {boolean} [options.singleEvents]
   * @param {string} [options.orderBy]
   * @returns {Promise<{success: boolean, events: object[], error: string|null, errorCode: string|null}>}
   */
  async listEvents({
    calendarId   = CALENDAR_CONFIG.DEFAULT_CALENDAR_ID,
    timeMin,
    timeMax,
    maxResults   = CALENDAR_CONFIG.LIST_EVENTS_MAX_RESULTS,
    singleEvents = true,
    orderBy      = "startTime",
  } = {}) {
    try {
      const clientResult = await this._getCalendarClient();
      if (clientResult.requiresAuthorization) {
        return { ...this._authRequiredResult(clientResult), events: [] };
      }

      const { calendar } = clientResult;

      const params = {
        calendarId,
        maxResults,
        singleEvents,
        orderBy: singleEvents ? orderBy : undefined,
      };
      if (timeMin) params.timeMin = timeMin;
      if (timeMax) params.timeMax = timeMax;

      const response = await calendar.events.list(params);
      const events   = (response.data.items || []).map(e => this._normalizeEvent(e));

      return { success: true, events, error: null, errorCode: null };

    } catch (err) {
      return { ...this._handleProviderError("listEvents", err), events: [] };
    }
  }

  // ─── Find Events ──────────────────────────────────────────────────────────

  /**
   * Search events by text query.
   *
   * @param {string} query
   * @param {object} [options]
   * @returns {Promise<{success: boolean, events: object[], error: string|null}>}
   */
  async findEvents(query, options = {}) {
    try {
      const clientResult = await this._getCalendarClient();
      if (clientResult.requiresAuthorization) {
        return { ...this._authRequiredResult(clientResult), events: [] };
      }

      const { calendar } = clientResult;
      const calendarId = options.calendarId || CALENDAR_CONFIG.DEFAULT_CALENDAR_ID;

      const params = {
        calendarId,
        q: query,
        maxResults: options.maxResults || 10,
        singleEvents: true,
        orderBy: "startTime",
      };
      if (options.timeMin) params.timeMin = options.timeMin;
      if (options.timeMax) params.timeMax = options.timeMax;

      const response = await calendar.events.list(params);
      const events   = (response.data.items || []).map(e => this._normalizeEvent(e));

      return { success: true, events, error: null, errorCode: null };

    } catch (err) {
      return { ...this._handleProviderError("findEvents", err), events: [] };
    }
  }

  // ─── Normalization ────────────────────────────────────────────────────────

  /**
   * Normalize a raw Google Calendar event object into a stable internal shape.
   * Ensures CalendarManager never processes raw API objects.
   *
   * @param {object} rawEvent
   * @returns {object}
   */
  _normalizeEvent(rawEvent) {
    if (!rawEvent) return null;

    const startRaw = rawEvent.start?.dateTime || rawEvent.start?.date || null;
    const endRaw   = rawEvent.end?.dateTime   || rawEvent.end?.date   || null;

    return {
      id:          rawEvent.id             || null,
      title:       rawEvent.summary        || "(Untitled Event)",
      description: rawEvent.description    || "",
      start:       startRaw,
      startISO:    startRaw,
      end:         endRaw,
      endISO:      endRaw,
      timezone:    rawEvent.start?.timeZone || rawEvent.end?.timeZone || null,
      location:    rawEvent.location        || null,
      attendees:   (rawEvent.attendees || []).map(a => ({
        name:  a.displayName || null,
        email: a.email || null,
        status: a.responseStatus || null,
      })),
      recurrence:  rawEvent.recurrence      || null,
      htmlLink:    rawEvent.htmlLink         || null,
      status:      rawEvent.status           || null,
      created:     rawEvent.created          || null,
      updated:     rawEvent.updated          || null,
    };
  }

  /**
   * Convert a CalendarEventDraft to a Google Calendar event request body.
   *
   * @param {object} draft
   * @returns {object} Google Calendar API event body
   */
  _draftToGoogleEvent(draft) {
    const event = {};

    if (draft.title       !== undefined) event.summary     = draft.title;
    if (draft.description !== undefined) event.description = draft.description;
    if (draft.location    !== undefined) event.location    = draft.location;

    if (draft.start) {
      event.start = {
        dateTime: draft.start.dateTime,
        timeZone: draft.start.timeZone,
      };
    }
    if (draft.end) {
      event.end = {
        dateTime: draft.end.dateTime,
        timeZone: draft.end.timeZone,
      };
    }

    // Attendees — only include if email is present
    if (draft.attendees && draft.attendees.length > 0) {
      event.attendees = draft.attendees
        .filter(a => a && a.email)
        .map(a => ({ email: a.email, displayName: a.name || undefined }));
    }

    // Recurrence — translate provider-independent spec to RRULE
    if (draft.recurrence) {
      event.recurrence = RecurrenceResolver.toGoogleRRule(draft.recurrence);
    }

    // Reminders
    if (draft.reminders && draft.reminders.length > 0) {
      event.reminders = {
        useDefault: false,
        overrides: draft.reminders,
      };
    }

    return event;
  }

  // ─── Error Handling ───────────────────────────────────────────────────────

  /**
   * Classify and normalize a Google Calendar API error.
   * Returns a structured result object — never throws.
   *
   * @param {string} operation
   * @param {Error} err
   * @returns {object}
   */
  _handleProviderError(operation, err) {
    const status  = err.code || (err.response && err.response.status) || 0;
    const message = err.message || String(err);

    console.error("[GoogleCalendarProvider] Calendar operation failed", { operation, code: err.code || err.status || "CALENDAR_ERROR" });

    // Authorization errors
    if (
      status === 401 ||
      message.includes("invalid_grant") ||
      message.includes("Token has been expired or revoked") ||
      err.code === "UNAUTHORIZED" ||
      err.code === "MISSING_CREDENTIALS"
    ) {
      const formattedErr = new Error("Google Calendar authorization is required.");
      formattedErr.code  = CALENDAR_ERROR.AUTH_REQUIRED;
      formattedErr.recoverable = true;
      formattedErr.automaticRetryable = false;
      formattedErr.recoveryAction = "google_calendar_authorization";
      formattedErr.authUrl = this._authManager.getCombinedAuthUrl();
      return {
        success:              false,
        event:                null,
        eventId:              null,
        events:               [],
        error:                formattedErr.message,
        errorCode:            CALENDAR_ERROR.AUTH_REQUIRED,
        recoverable:          true,
        automaticRetryable:   false,
        recoveryAction:       "google_calendar_authorization",
        requiresAuthorization: true,
        authUrl:              formattedErr.authUrl,
      };
    }

    // Permission denied
    if (status === 403) {
      return {
        success: false, event: null, eventId: null, events: [],
        error: "Calendar permission denied.",
        errorCode: CALENDAR_ERROR.PERMISSION_DENIED,
        recoverable: true, automaticRetryable: false,
        recoveryAction: "google_calendar_authorization",
        requiresAuthorization: true,
        authUrl: this._authManager.getCombinedAuthUrl(),
      };
    }

    // Event not found
    if (status === 404) {
      return {
        success: false, event: null, eventId: null, events: [],
        error: "Calendar event not found.",
        errorCode: CALENDAR_ERROR.EVENT_NOT_FOUND,
        recoverable: true, automaticRetryable: false,
        recoveryAction: "find_event",
      };
    }

    // Rate limited
    if (status === 429) {
      return {
        success: false, event: null, eventId: null, events: [],
        error: "Google Calendar rate limit reached. Please try again shortly.",
        errorCode: CALENDAR_ERROR.RATE_LIMITED,
        recoverable: true, automaticRetryable: true,
      };
    }

    // Generic provider error
    return {
      success: false, event: null, eventId: null, events: [],
      error: message,
      errorCode: CALENDAR_ERROR.PROVIDER_ERROR,
      recoverable: true, automaticRetryable: true,
    };
  }

  /**
   * Build a standardized auth-required result from getCalendarAuthenticatedClient output.
   * @param {{requiresAuthorization: boolean, authUrl: string, reason: string}} authResult
   * @returns {object}
   */
  _authRequiredResult(authResult) {
    return {
      success:              false,
      event:                null,
      eventId:              null,
      events:               [],
      error:                "Google Calendar authorization required.",
      errorCode:            CALENDAR_ERROR.AUTH_REQUIRED,
      recoverable:          true,
      automaticRetryable:   false,
      recoveryAction:       "google_calendar_authorization",
      requiresAuthorization: true,
      authUrl:              authResult.authUrl,
      reason:               authResult.reason,
    };
  }
}

export const googleCalendarProvider = new GoogleCalendarProvider();
