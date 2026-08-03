import { EmailConversationState } from "./EmailConversationState.js";
import { EMAIL_STATUS } from "../EmailConfig.js";

/**
 * EmailConversationManager.js
 *
 * Manages active multi-turn EmailConversation sessions across user turns.
 * Supports concurrent sessions identified by conversationId or confirmationId.
 */
export class EmailConversationManager {
  constructor() {
    /** @type {Map<string, EmailConversationState>} */
    this.sessions = new Map();
  }

  /**
   * Start a new email conversation session.
   * @param {object} [initialFields={}]
   * @returns {EmailConversationState}
   */
  startSession(initialFields = {}) {
    const session = new EmailConversationState(initialFields);
    this.sessions.set(session.conversationId, session);
    return session;
  }

  /**
   * Get session by conversationId.
   * @param {string} conversationId
   * @returns {EmailConversationState|null}
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
   * Find the most recent active non-expired session.
   * @returns {EmailConversationState|null}
   */
  getActiveSession() {
    const activeStates = new Set([
      EMAIL_STATUS.COLLECTING_RECIPIENT,
      EMAIL_STATUS.COLLECTING_EMAIL_ADDRESS,
      EMAIL_STATUS.COLLECTING_CONTENT,
      EMAIL_STATUS.DRAFT,
      EMAIL_STATUS.WAITING_CONFIRMATION,
      EMAIL_STATUS.FAILED_RETRYABLE
    ]);

    const activeList = Array.from(this.sessions.values())
      .filter(s => activeStates.has(s.status) && new Date(s.expiresAt).getTime() > Date.now())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return activeList[0] || null;
  }

  /**
   * Get session by confirmationId.
   * @param {string} confirmationId
   * @returns {EmailConversationState|null}
   */
  getSessionByConfirmation(confirmationId) {
    if (!confirmationId) return null;
    for (const session of this.sessions.values()) {
      if (session.confirmationId === confirmationId) {
        return session;
      }
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
}

export const emailConversationManager = new EmailConversationManager();
