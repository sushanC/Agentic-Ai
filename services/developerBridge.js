/**
 * developerBridge.js — Backward Compatibility Adapter
 *
 * Forwards calls to core/events/DeveloperEvents.js.
 */
import { developerEvents } from "../core/events/DeveloperEvents.js";

export function emitDevEvent(eventName, payload) {
  return developerEvents.emitDevEvent(eventName, payload);
}

export function beginRequest() {
  return developerEvents.beginRequest();
}

export function endRequest() {
  return developerEvents.endRequest();
}
