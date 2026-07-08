/**
 * developerBridge.js
 *
 * Emits structured developer events from the backend process to the
 * Electron main process via Node.js child-process IPC (process.send).
 *
 * This module is entirely passive:
 *   - When running as an Electron child process: events are sent via IPC
 *   - When running standalone (node server.js): all calls are no-ops
 *   - Zero impact on latency (synchronous send, fire-and-forget)
 *
 * Security:
 *   API keys and OAuth tokens are masked before any event is emitted.
 *   Pattern list covers Bearer tokens, sk- keys, and env-style secrets.
 */

import { randomUUID } from 'crypto';

// ─── Active request tracking ──────────────────────────────────────────────────

let _currentRequestId = null;

/**
 * Begin a new logical request context.
 * Returns the new requestId so callers can reference it.
 * @returns {string}
 */
export function beginRequest() {
  _currentRequestId = randomUUID();
  return _currentRequestId;
}

/**
 * End the current request context.
 */
export function endRequest() {
  _currentRequestId = null;
}

/**
 * Get the current active requestId, or generate a transient one.
 * @returns {string}
 */
export function getCurrentRequestId() {
  return _currentRequestId || randomUUID();
}

// ─── Security: secret masking ─────────────────────────────────────────────────

/** @type {RegExp[]} Patterns that match sensitive values */
const SENSITIVE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._\-]{20,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /AIza[A-Za-z0-9_\-]{35}/g,
  /ya29\.[A-Za-z0-9._\-]+/g,
  /gsk_[A-Za-z0-9]{50,}/g,
  /(?<="[A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD|API)[A-Z_]*"\s*:\s*")[^"]{8,}/g,
];

/**
 * Deep-clone a value and redact any string matching a sensitive pattern.
 * @param {*} value
 * @returns {*}
 */
function redact(value) {
  if (typeof value === 'string') {
    let result = value;
    for (const pattern of SENSITIVE_PATTERNS) {
      result = result.replace(pattern, '[REDACTED]');
    }
    return result;
  }

  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redact(v);
    }
    return out;
  }

  return value;
}

// ─── Emit ─────────────────────────────────────────────────────────────────────

/**
 * Emit a developer event to the Electron main process.
 *
 * @param {string} type   — One of the defined DevEvent types
 * @param {object} payload — Type-specific data (will be redacted)
 */
export function emitDevEvent(type, payload = {}) {
  if (typeof process.send !== 'function') {
    // Running standalone — silently skip
    return;
  }

  try {
    const event = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type,
      requestId: getCurrentRequestId(),
      payload: redact(payload),
    };

    process.send({ type: 'DEV_EVENT', event });
  } catch {
    // Never let dev tooling crash the application
  }
}
