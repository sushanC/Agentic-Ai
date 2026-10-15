/**
 * GoogleScopes.js
 *
 * Centralized Google OAuth2 scope constants for all Google services in samGPT.
 *
 * Why centralized:
 *   - Prevents scope strings from being scattered through individual providers.
 *   - Ensures consistent scope requests across auth flows.
 *   - Makes it easy to audit exactly which permissions samGPT requests.
 *
 * Usage:
 *   import { GOOGLE_SCOPES } from "../../google/GoogleScopes.js";
 *   const scopes = GOOGLE_SCOPES.gmail;          // Gmail only
 *   const scopes = GOOGLE_SCOPES.calendar;       // Calendar only
 *   const scopes = GOOGLE_SCOPES.combined;       // Gmail + Calendar (combined auth)
 */

export const GOOGLE_SCOPES = Object.freeze({
  /**
   * Gmail scopes — permission to send email on behalf of the user.
   */
  gmail: [
    "https://www.googleapis.com/auth/gmail.send"
  ],

  /**
   * Google Calendar scopes — full read/write access to calendar events.
   * Required for: listing events, creating, updating, deleting events,
   * checking free/busy, and reading calendar metadata.
   */
  calendar: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events"
  ],

  /**
   * Combined scopes for a single OAuth flow that covers both Gmail and Calendar.
   * Preferred when the user authorizes samGPT once for all Google services.
   */
  combined: [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events"
  ]
});

/**
 * Check whether a set of stored token scopes contains the required scopes.
 *
 * Google tokens include a `scope` string (space-separated) listing
 * every scope the user consented to.
 *
 * @param {string|null} tokenScopeString - The token's scope field (may be null or undefined)
 * @param {string[]} requiredScopes      - Array of scope URIs to check for
 * @returns {boolean}
 */
export function hasRequiredScopes(tokenScopeString, requiredScopes) {
  if (!tokenScopeString || typeof tokenScopeString !== "string") return false;
  const granted = new Set(tokenScopeString.split(/\s+/).filter(Boolean));
  return requiredScopes.every(s => granted.has(s));
}
