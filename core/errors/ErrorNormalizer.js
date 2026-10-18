import { ERROR_CODES } from "./ErrorCodes.js";
import { getUserErrorMessage, DEFAULT_USER_ERROR_MESSAGE } from "./UserErrorMessages.js";
import { getCurrentRequestContext } from "../request/RequestContext.js";

/**
 * ErrorNormalizer.js
 *
 * Centralized error normalization layer for samGPT.
 * Converts any error (Error object, string, or domain result) into a unified, stable contract:
 *
 * {
 *   success: false,
 *   code: string,
 *   userMessage: string,       // Safe for display to user / frontend
 *   technicalMessage: string,  // Sanitized compatibility field
 *   diagnostics: object,        // Safe error type/code only
 *   requestId: string|null,
 *   retryable: boolean,
 *   requiresReauth: boolean,
 *   authUrl: string|null,
 *   capability: string,
 *   tool: string
 * }
 */
export class ErrorNormalizer {
  /**
   * Convert any error or failure state into a normalized error payload.
   *
   * @param {Error|object|string} error - Internal error object or message
   * @param {object} [context={}] - Context metadata (e.g. { capability: "calendar", tool: "calendar_create" })
   * @returns {object} Normalized error object
   */
  static normalize(error, context = {}) {
    const rawMessage = typeof error === "string" ? error : (error?.message || String(error || ""));
    const rawCode = error?.code || error?.errorCode || context?.code || null;

    // Detect structured error code
    const code = ErrorNormalizer._determineErrorCode(rawCode, rawMessage, error);

    const errorName = typeof error?.name === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(error.name)
      ? error.name
      : "Error";
    const technicalMessage = `${errorName}:${code}`;

    // Determine user-safe message
    let userMessage = error?.userMessage || context?.userMessage || null;
    if (!userMessage || ErrorNormalizer._containsSensitiveDetails(userMessage)) {
      userMessage = getUserErrorMessage(code);
    }
    if (typeof userMessage === "string" && userMessage.length > 500) userMessage = getUserErrorMessage(code);

    // Auth & reauth flags
    const requiresReauth = Boolean(
      error?.requiresReauth ||
      error?.requiresAuthorization ||
      code === ERROR_CODES.GMAIL_REAUTH_REQUIRED ||
      code === ERROR_CODES.GOOGLE_AUTH_REQUIRED ||
      code === ERROR_CODES.CALENDAR_AUTH_REQUIRED ||
      code === ERROR_CODES.AUTH_REQUIRED
    );

    const candidateAuthUrl = error?.authUrl || context?.authUrl || null;
    const authUrl = typeof candidateAuthUrl === "string" && candidateAuthUrl.length <= 4096 ? candidateAuthUrl : null;

    // Retryable flag
    const retryable = error?.retryable !== undefined
      ? Boolean(error.retryable)
      : (code === ERROR_CODES.RATE_LIMITED || code === ERROR_CODES.TIMEOUT || code === ERROR_CODES.NETWORK_ERROR);

    const capability = context?.capability || error?.capability || "unknown";
    const tool       = context?.tool || error?.tool || capability;

    return {
      success: false,
      code,
      userMessage,
      technicalMessage,
      diagnostics: { errorName, errorCode: code },
      requestId: context?.requestId || getCurrentRequestContext()?.requestId || null,
      retryable,
      requiresReauth,
      authUrl,
      capability,
      tool
    };
  }

  /**
   * Determine the canonical ErrorCode from raw code, message, or error properties.
   * @private
   */
  static _determineErrorCode(rawCode, rawMessage, error) {
    if (rawCode && ERROR_CODES[rawCode]) {
      return ERROR_CODES[rawCode];
    }
    if (typeof rawCode === "string" && /^[A-Z0-9_-]{1,64}$/.test(rawCode)) {
      return rawCode;
    }

    const msg = (rawMessage || "").toLowerCase();

    if (msg.includes("invalid_grant") || msg.includes("token has been expired")) {
      return ERROR_CODES.GMAIL_REAUTH_REQUIRED;
    }
    if (msg.includes("calendar authorization") || msg.includes("calendar_auth_required")) {
      return ERROR_CODES.CALENDAR_AUTH_REQUIRED;
    }
    if (msg.includes("rate limit") || msg.includes("429")) {
      return ERROR_CODES.RATE_LIMITED;
    }
    if (msg.includes("timeout") || msg.includes("etimedout")) {
      return ERROR_CODES.TIMEOUT;
    }
    if (msg.includes("all available ai providers") || msg.includes("all providers exhausted")) {
      return ERROR_CODES.ALL_MODELS_FAILED;
    }
    if (msg.includes("event not found") || msg.includes("calendar_event_not_found")) {
      return ERROR_CODES.CALENDAR_EVENT_NOT_FOUND;
    }
    if (msg.includes("network") || msg.includes("econnrefused")) {
      return ERROR_CODES.NETWORK_ERROR;
    }
    if (msg.includes("validation")) {
      return ERROR_CODES.VALIDATION_ERROR;
    }

    return ERROR_CODES.INTERNAL_ERROR;
  }

  /**
   * Check if a string contains sensitive technical details (stack traces, file paths, keys, tokens).
   * @private
   */
  static _containsSensitiveDetails(text) {
    if (typeof text !== "string") return false;
    if (text.includes("at ") && text.includes(".js:")) return true; // Stack trace line
    if (text.includes("/home/") || text.includes("/Users/") || text.includes("C:\\")) return true; // File path
    if (text.includes("sk-") || text.includes("gsk_") || text.includes("gocspx")) return true; // API key / OAuth secret
    if (text.includes("invalid_grant") || text.includes("OAuth2")) return true;
    if (/\b(?:bearer\s+)?(?:ya29\.|gh[pousr]_|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}/i.test(text)) return true;
    if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) return true;
    if (/\b(?:provider|api) error\b/i.test(text)) return true;
    return false;
  }
}
