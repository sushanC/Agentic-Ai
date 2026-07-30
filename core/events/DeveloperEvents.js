/**
 * DeveloperEvents.js
 *
 * Central event bridge for the Agent Core.
 * Manages developer console telemetry logging, active request lifecycle tracking,
 * and IPC dev event emissions.
 */
class DeveloperEventEmitter {
  constructor() {
    this.activeRequestId = null;
    this.requestStartTime = null;
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
    const event = {
      event: eventName,
      timestamp,
      requestId: this.activeRequestId,
      ...payload
    };

    console.log(`[DevBridge Event] ${eventName}:`, JSON.stringify(payload));

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
  beginRequest() {
    this.activeRequestId = `req-${Date.now()}`;
    this.requestStartTime = Date.now();
    console.log(`[DevBridge] Request started: ${this.activeRequestId}`);
    return this.activeRequestId;
  }

  /**
   * End the current logical request context.
   */
  endRequest() {
    const duration = this.requestStartTime ? Date.now() - this.requestStartTime : 0;
    console.log(`[DevBridge] Request ended: ${this.activeRequestId} (Duration: ${duration}ms)`);
    this.activeRequestId = null;
    this.requestStartTime = null;
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
