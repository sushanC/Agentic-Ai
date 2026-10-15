/**
 * BaseCalendarProvider.js
 *
 * Abstract base class for calendar provider implementations.
 * Defines the normalized provider contract that CalendarManager depends on.
 *
 * GoogleCalendarProvider extends this.
 * Future providers (Outlook, CalDAV) extend this.
 *
 * CalendarManager NEVER calls googleapis directly — it calls provider methods.
 * Provider responses are normalized into stable internal result objects.
 */
export class BaseCalendarProvider {
  /**
   * @param {string} name         - Provider identifier (e.g. "google")
   * @param {string} displayName  - Human-readable name
   */
  constructor(name, displayName) {
    this.name        = name;
    this.displayName = displayName;
  }

  /**
   * Get provider authorization and configuration status.
   * @returns {Promise<{configured: boolean, linked: boolean, hasCalendarScope: boolean}>}
   */
  async getStatus() {
    throw new Error(`${this.name}: getStatus() not implemented.`);
  }

  /**
   * Create a new calendar event.
   * @param {object} draft  - Normalized CalendarEventDraft
   * @param {string} [calendarId]
   * @returns {Promise<{success: boolean, event: object|null, eventId: string|null, error: string|null}>}
   */
  async createEvent(draft, calendarId) {
    throw new Error(`${this.name}: createEvent() not implemented.`);
  }

  /**
   * Update an existing event.
   * @param {string} eventId
   * @param {object} patch  - Partial event fields to update
   * @param {string} [calendarId]
   * @returns {Promise<{success: boolean, event: object|null, error: string|null}>}
   */
  async updateEvent(eventId, patch, calendarId) {
    throw new Error(`${this.name}: updateEvent() not implemented.`);
  }

  /**
   * Delete a calendar event.
   * @param {string} eventId
   * @param {string} [calendarId]
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  async deleteEvent(eventId, calendarId) {
    throw new Error(`${this.name}: deleteEvent() not implemented.`);
  }

  /**
   * Get a single event by ID.
   * @param {string} eventId
   * @param {string} [calendarId]
   * @returns {Promise<{success: boolean, event: object|null, error: string|null}>}
   */
  async getEvent(eventId, calendarId) {
    throw new Error(`${this.name}: getEvent() not implemented.`);
  }

  /**
   * List events in a time range.
   * @param {object} options  - { timeMin, timeMax, maxResults, calendarId, singleEvents, query }
   * @returns {Promise<{success: boolean, events: object[], error: string|null}>}
   */
  async listEvents(options) {
    throw new Error(`${this.name}: listEvents() not implemented.`);
  }

  /**
   * Search events by text query.
   * @param {string} query
   * @param {object} options
   * @returns {Promise<{success: boolean, events: object[], error: string|null}>}
   */
  async findEvents(query, options) {
    throw new Error(`${this.name}: findEvents() not implemented.`);
  }
}
