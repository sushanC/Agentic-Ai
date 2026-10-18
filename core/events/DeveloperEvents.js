/**
 * DeveloperEvents.js
 *
 * Central event bridge for the Agent Core.
 * Manages developer console telemetry logging, active request lifecycle tracking,
 * and IPC dev event emissions.
 */
import { createRequestContext, getCurrentRequestContext } from "../request/RequestContext.js";

class DeveloperEventEmitter {
  constructor() {
    this.listeners = new Set();
  }

  /**
   * Emit a structured developer event.
   * Prints to node console and notifies any registered listeners.
   *
   * @param {string} eventName
   * @param {object} payload
   */
  emitDevEvent(eventName, payload = {}) {
    const timestamp = new Date().toISOString();
    const requestId = payload.requestId || getCurrentRequestContext()?.requestId || null;
    const event = {
      event: eventName,
      timestamp,
      requestId,
      ...payload
    };

    // Payload remains available to internal subscribers; console output is metadata-only.
    console.log(`[DevBridge Event] ${eventName}`, { requestId });

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error(`[DevBridge] Listener error on event "${eventName}":`, err);
      }
    }
  }

  /**
   * Begin a logical request context.
   * @returns {string} Session ID
   */
  beginRequest(requestId) {
    const context = createRequestContext(requestId || getCurrentRequestContext()?.requestId);
    console.log("[DevBridge] Request started", { requestId: context.requestId });
    return context.requestId;
  }

  /**
   * End the current logical request context.
   */
  endRequest(requestId) {
    console.log("[DevBridge] Request ended", {
      requestId: requestId || getCurrentRequestContext()?.requestId || null,
    });
  }

  /**
   * Subscribe to developer events.
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  onEvent(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}

export const developerEvents = new DeveloperEventEmitter();
