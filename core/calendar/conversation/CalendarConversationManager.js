import { CalendarConversationState } from "./CalendarConversationState.js";
import { CALENDAR_STATUS } from "../CalendarConfig.js";

/**
 * CalendarConversationManager.js
 *
 * Manages active multi-turn CalendarConversation sessions across user turns.
 * Mirrors EmailConversationManager in structure and API.
 *
 * Session lifecycle:
 *   startSession()     → creates a new session
 *   getActiveSession() → finds the most recent non-expired active session
 *   getSession(id)     → lookup by conversationId
 *   endSession(id)     → terminates the session
 */
export class CalendarConversationManager {
  constructor() {
    /** @type {Map<string, CalendarConversationState>} */
    this.sessions = new Map();
  }

  /**
   * Start a new calendar conversation session.
   * @param {object} [initialFields={}]
   * @returns {CalendarConversationState}
   */
  startSession(initialFields = {}) {
    const session = new CalendarConversationState(initialFields);
    this.sessions.set(session.conversationId, session);
    return session;
  }

  /**
   * Get a session by conversationId. Returns null if expired.
   * @param {string} conversationId
   * @returns {CalendarConversationState|null}
   */
  getSession(conversationId) {
    if (!conversationId) return null;
    const session = this.sessions.get(conversationId);
    if (!session) return null;

    if (new Date(session.expiresAt).getTime() < Date.now()) {
      this.sessions.delete(conversationId);
      return null;
    }
    return session;
  }

  /**
   * Find the most recent non-expired active session.
   * Used when no explicit conversationId is provided (most common case).
   *
   * @returns {CalendarConversationState|null}
   */
  getActiveSession() {
    const activeStates = new Set([
      CALENDAR_STATUS.COLLECTING_TITLE,
      CALENDAR_STATUS.COLLECTING_DATE,
      CALENDAR_STATUS.COLLECTING_START_TIME,
      CALENDAR_STATUS.COLLECTING_END_TIME,
      CALENDAR_STATUS.COLLECTING_DURATION,
      CALENDAR_STATUS.COLLECTING_ATTENDEES,
      CALENDAR_STATUS.CHECKING_CONFLICTS,
      CALENDAR_STATUS.WAITING_CONFIRMATION,
      CALENDAR_STATUS.FAILED,  // allow recovery
    ]);

    const now = Date.now();
    const activeList = Array.from(this.sessions.values())
      .filter(s => activeStates.has(s.status) && new Date(s.expiresAt).getTime() > now)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return activeList[0] || null;
  }

  /**
   * Find a session by its confirmationId.
   * @param {string} confirmationId
   * @returns {CalendarConversationState|null}
   */
  getSessionByConfirmation(confirmationId) {
    if (!confirmationId) return null;
    for (const session of this.sessions.values()) {
      if (session.confirmationId === confirmationId) return session;
    }
    return null;
  }

  /**
   * Terminate a session.
   * @param {string} conversationId
   */
  endSession(conversationId) {
    this.sessions.delete(conversationId);
  }

  /**
   * Purge all expired sessions.
   * Called lazily on getActiveSession for memory hygiene.
   */
  purgeExpired() {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (new Date(session.expiresAt).getTime() < now) {
        this.sessions.delete(id);
      }
    }
  }
}

export const calendarConversationManager = new CalendarConversationManager();
