import { ERROR_CODES } from "./ErrorCodes.js";

/**
 * UserErrorMessages.js
 *
 * Centralized mapping of structured error codes to user-safe, professional natural language messages.
 *
 * Rules:
 *   - NEVER expose stack traces
 *   - NEVER expose API keys or OAuth tokens
 *   - NEVER expose local file paths (/home/...)
 *   - NEVER expose internal module/class names or provider vendor raw error strings
 */

export const USER_ERROR_MESSAGES = Object.freeze({
  [ERROR_CODES.INTERNAL_ERROR]:         "Sorry for the inconvenience. I wasn't able to complete that request. Please try again.",
  [ERROR_CODES.CAPABILITY_FAILED]:      "Sorry for the inconvenience. I wasn't able to complete that request.",
  [ERROR_CODES.MODEL_FAILED]:           "Sorry for the inconvenience. I'm temporarily unable to process your request. Please try again in a moment.",
  [ERROR_CODES.ALL_MODELS_FAILED]:      "Sorry for the inconvenience. I'm temporarily unable to process your request. Please try again in a moment.",
  [ERROR_CODES.PROVIDER_FAILED]:        "Sorry for the inconvenience. The AI provider encountered an issue. Please try again.",
  [ERROR_CODES.TIMEOUT]:                "Sorry for the inconvenience. The request took too long to complete. Please try again.",
  [ERROR_CODES.RATE_LIMITED]:           "Sorry for the inconvenience. The AI provider rate limit was reached. Please try again in a moment.",
  [ERROR_CODES.AUTH_REQUIRED]:          "Sorry for the inconvenience. This service needs to be connected before I can complete that request.",
  [ERROR_CODES.GMAIL_REAUTH_REQUIRED]:  "Sorry for the inconvenience. Gmail needs to be reconnected before I can send that email. Your draft is still saved.",
  [ERROR_CODES.GOOGLE_AUTH_REQUIRED]:   "Sorry for the inconvenience. Google Calendar needs to be connected before I can complete that request.",
  [ERROR_CODES.CALENDAR_NOT_FOUND]:     "Sorry for the inconvenience. I couldn't find that event on your calendar.",
  [ERROR_CODES.CALENDAR_EVENT_NOT_FOUND]: "Sorry for the inconvenience. I couldn't find that event on your calendar.",
  [ERROR_CODES.CALENDAR_AMBIGUOUS]:     "I found multiple matching calendar events. Please tell me which one you mean.",
  [ERROR_CODES.CALENDAR_AUTH_REQUIRED]: "Sorry for the inconvenience. Google Calendar needs to be connected before I can complete that request.",
  [ERROR_CODES.CALENDAR_PERMISSION_DENIED]: "Sorry for the inconvenience. Calendar permission was denied. Please check your account permissions.",
  [ERROR_CODES.CALENDAR_CONFLICT]:      "You already have a conflicting event scheduled at that time. Would you like to schedule it anyway?",
  [ERROR_CODES.CALENDAR_INVALID_DATETIME]: "I couldn't understand that date or time format. Please specify the date and time clearly.",
  [ERROR_CODES.CALENDAR_VALIDATION_FAILED]: "Please provide complete event details (title, date, and time).",
  [ERROR_CODES.INVALID_REQUEST]:        "I didn't understand that request. Could you please rephrase or provide more details?",
  [ERROR_CODES.VALIDATION_ERROR]:       "Some required information is missing or invalid. Please check and try again.",
  [ERROR_CODES.NETWORK_ERROR]:          "A network communication error occurred. Please check your network connection and try again.",
  [ERROR_CODES.STREAMING_INTERRUPTED]:  "Sorry for the interruption. I wasn't able to finish generating that response. Please try again.",
  [ERROR_CODES.UNKNOWN_ERROR]:          "Sorry for the inconvenience. I wasn't able to complete that request. Please try again.",
});

export const DEFAULT_USER_ERROR_MESSAGE = "Sorry for the inconvenience. I wasn't able to complete that request. Please try again.";

/**
 * Get a user-safe message for a given error code.
 * @param {string} code
 * @param {string} [customFallback]
 * @returns {string}
 */
export function getUserErrorMessage(code, customFallback = null) {
  if (code && USER_ERROR_MESSAGES[code]) {
    return USER_ERROR_MESSAGES[code];
  }
  return customFallback || DEFAULT_USER_ERROR_MESSAGE;
}
