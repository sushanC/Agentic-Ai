/**
 * ProviderErrorClassifier.js
 *
 * Centralized error normalization for the samGPT AI pipeline.
 *
 * Every raw provider exception is classified into a typed ProviderError with
 * deterministic flags that drive the RetryPolicyEngine:
 *
 *   - shouldCompress  → true ONLY for genuine context-limit errors (413, token limit)
 *   - shouldFallback  → true for rate limits, auth failures, network errors, etc.
 *   - retryable       → true if the same provider may succeed on a later attempt
 *
 * This module has zero external dependencies.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Error Type Enum
// ─────────────────────────────────────────────────────────────────────────────

export const ProviderErrorType = Object.freeze({
  CONTEXT_LIMIT:        "CONTEXT_LIMIT",        // Prompt too long for model
  PAYLOAD_TOO_LARGE:    "PAYLOAD_TOO_LARGE",    // HTTP 413
  RATE_LIMIT:           "RATE_LIMIT",           // HTTP 429
  AUTH_ERROR:           "AUTH_ERROR",           // HTTP 401, invalid API key
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE", // HTTP 402, out of credits
  NETWORK:              "NETWORK",              // Connection refused, DNS failure
  TIMEOUT:              "TIMEOUT",              // Request timed out
  MODEL_OVERLOADED:     "MODEL_OVERLOADED",     // Model at capacity
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE", // HTTP 503 / 502 / service down
  INVALID_REQUEST:      "INVALID_REQUEST",      // Bad input, HTTP 400
  UNKNOWN:              "UNKNOWN",              // Unrecognized error
});

// ─────────────────────────────────────────────────────────────────────────────
// ProviderError — Normalized error object
// ─────────────────────────────────────────────────────────────────────────────

export class ProviderError extends Error {
  /**
   * @param {object} params
   * @param {string} params.provider       - Provider key (e.g. "google", "groq")
   * @param {string} params.errorType      - One of ProviderErrorType values
   * @param {string} params.message        - Human-readable message
   * @param {number|null} params.statusCode     - HTTP status code if known
   * @param {string|null} params.providerCode   - Provider-specific error code
   * @param {boolean} params.retryable     - Whether retrying same provider is sensible
   * @param {boolean} params.shouldFallback - Whether to fall back to next provider
   * @param {boolean} params.shouldCompress - Whether to compress context and retry
   * @param {Error|null} params.cause      - Original error
   */
  constructor({
    provider,
    errorType,
    message,
    statusCode = null,
    providerCode = null,
    retryable = false,
    shouldFallback = false,
    shouldCompress = false,
    cause = null,
  }) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.errorType = errorType;
    this.statusCode = statusCode;
    this.providerCode = providerCode;
    this.retryable = retryable;
    this.shouldFallback = shouldFallback;
    this.shouldCompress = shouldCompress;
    this.cause = cause;
    this.details = cause ? (cause.message || String(cause)) : null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Signal Extraction Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract HTTP status code from an error message or error object.
 * @param {Error} err
 * @returns {number|null}
 */
function extractStatusCode(err) {
  // OpenAI SDK exposes status directly
  if (err?.status && typeof err.status === "number") return err.status;
  if (err?.statusCode && typeof err.statusCode === "number") return err.statusCode;

  // Extract from message string
  const msg = String(err?.message || "");
  const match = msg.match(/\b(4\d{2}|5\d{2})\b/);
  if (match) return parseInt(match[1], 10);

  return null;
}

/**
 * Normalize the full error text for pattern matching.
 * @param {Error} err
 * @returns {string}
 */
function errorText(err) {
  return [
    err?.message || "",
    err?.code || "",
    err?.error?.message || "",
    err?.error?.code || "",
  ].join(" ").toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Classification Logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determines the error type from the raw error and HTTP status code.
 * Compression is ONLY set for genuine context-size errors.
 *
 * @param {number|null} statusCode
 * @param {string} text - Lowercased error text
 * @returns {{ errorType: string, retryable: boolean, shouldFallback: boolean, shouldCompress: boolean }}
 */
function determineErrorFlags(statusCode, text) {
  // ── HTTP 413 — Payload Too Large ──────────────────────────────────────────
  if (statusCode === 413 || text.includes("payload too large") || text.includes("request entity too large")) {
    return {
      errorType: ProviderErrorType.PAYLOAD_TOO_LARGE,
      retryable: true,
      shouldFallback: false,
      shouldCompress: true,  // ✅ Compress and retry
    };
  }

  // ── Context / Token Limit ─────────────────────────────────────────────────
  // IMPORTANT: "context" alone is not enough — require token/limit phrases too.
  // This prevents network errors containing the word "context" from triggering compression.
  const isContextLimit = (
    (text.includes("context") && (text.includes("limit") || text.includes("length") || text.includes("window") || text.includes("exceed"))) ||
    text.includes("context_length_exceeded") ||
    text.includes("context window") ||
    text.includes("token limit") ||
    text.includes("max tokens") ||
    text.includes("too many tokens") ||
    text.includes("tokens exceed") ||
    text.includes("input is too long") ||
    text.includes("prompt is too long") ||
    text.includes("sequence length") ||
    text.includes("maximum context") ||
    text.includes("exceeds the maximum") ||
    text.includes("exceeds context") ||
    (statusCode === 400 && text.includes("too long"))
  );
  if (isContextLimit) {
    return {
      errorType: ProviderErrorType.CONTEXT_LIMIT,
      retryable: true,
      shouldFallback: false,
      shouldCompress: true,  // ✅ Compress and retry
    };
  }

  // ── HTTP 429 — Rate Limit ─────────────────────────────────────────────────
  if (
    statusCode === 429 ||
    text.includes("rate limit") ||
    text.includes("ratelimit") ||
    text.includes("rate_limit") ||
    text.includes("too many requests") ||
    text.includes("request limit")
  ) {
    return {
      errorType: ProviderErrorType.RATE_LIMIT,
      retryable: false,        // Don't hammer a rate-limited endpoint
      shouldFallback: true,    // ✅ Fallback to another provider
      shouldCompress: false,   // ❌ Never compress for rate limits
    };
  }

  // ── HTTP 401 — Authentication ─────────────────────────────────────────────
  if (
    statusCode === 401 ||
    text.includes("unauthorized") ||
    text.includes("invalid api key") ||
    text.includes("api key") ||
    text.includes("authentication") ||
    text.includes("invalid_api_key") ||
    text.includes("access denied") ||
    text.includes("permission denied")
  ) {
    return {
      errorType: ProviderErrorType.AUTH_ERROR,
      retryable: false,        // Auth errors won't self-heal
      shouldFallback: true,    // ✅ Fallback immediately
      shouldCompress: false,
    };
  }

  // ── HTTP 402 — Insufficient Balance ───────────────────────────────────────
  if (
    statusCode === 402 ||
    text.includes("insufficient balance") ||
    text.includes("insufficient credits") ||
    text.includes("billing") ||
    text.includes("payment required") ||
    text.includes("quota exceeded")
  ) {
    return {
      errorType: ProviderErrorType.INSUFFICIENT_BALANCE,
      retryable: false,
      shouldFallback: true,    // ✅ Fallback immediately
      shouldCompress: false,
    };
  }

  // ── HTTP 503/502 — Provider Unavailable ───────────────────────────────────
  if (
    statusCode === 503 ||
    statusCode === 502 ||
    text.includes("service unavailable") ||
    text.includes("service temporarily") ||
    text.includes("provider unavailable") ||
    text.includes("bad gateway") ||
    text.includes("gateway timeout") ||
    text.includes("upstream")
  ) {
    return {
      errorType: ProviderErrorType.PROVIDER_UNAVAILABLE,
      retryable: false,
      shouldFallback: true,    // ✅ Fallback to another provider
      shouldCompress: false,
    };
  }

  // ── Model Overloaded ──────────────────────────────────────────────────────
  if (
    text.includes("overloaded") ||
    text.includes("model_overloaded") ||
    text.includes("server busy") ||
    text.includes("capacity") ||
    text.includes("currently unavailable")
  ) {
    return {
      errorType: ProviderErrorType.MODEL_OVERLOADED,
      retryable: false,
      shouldFallback: true,    // ✅ Fallback to another provider
      shouldCompress: false,
    };
  }

  // ── Timeout ───────────────────────────────────────────────────────────────
  if (
    statusCode === 408 ||
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("etimedout") ||
    text.includes("request timeout")
  ) {
    return {
      errorType: ProviderErrorType.TIMEOUT,
      retryable: true,         // May succeed on retry
      shouldFallback: true,    // ✅ Also try fallback
      shouldCompress: false,
    };
  }

  // ── Network Error ─────────────────────────────────────────────────────────
  if (
    text.includes("econnrefused") ||
    text.includes("econnreset") ||
    text.includes("enotfound") ||
    text.includes("econnaborted") ||
    text.includes("network") ||
    text.includes("fetch failed") ||
    text.includes("socket") ||
    text.includes("dns")
  ) {
    return {
      errorType: ProviderErrorType.NETWORK,
      retryable: false,
      shouldFallback: true,    // ✅ Fallback to another provider
      shouldCompress: false,
    };
  }

  // ── HTTP 400 — Invalid Request ────────────────────────────────────────────
  if (statusCode === 400) {
    return {
      errorType: ProviderErrorType.INVALID_REQUEST,
      retryable: false,        // Bad request won't self-heal
      shouldFallback: true,    // Try fallback in case it's model-specific
      shouldCompress: false,
    };
  }

  // ── Unknown ───────────────────────────────────────────────────────────────
  return {
    errorType: ProviderErrorType.UNKNOWN,
    retryable: true,           // Unknown — try once more
    shouldFallback: true,
    shouldCompress: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify a raw provider exception into a normalized ProviderError.
 *
 * Usage in provider files:
 *   } catch (err) {
 *     throw classifyProviderError("groq", err);
 *   }
 *
 * @param {string} providerKey - Provider identifier (e.g. "google", "groq")
 * @param {Error} rawError     - The raw exception from the provider SDK
 * @returns {ProviderError}    - Normalized, classified error
 */
export function classifyProviderError(providerKey, rawError) {
  // If already classified, pass through
  if (rawError instanceof ProviderError) return rawError;

  const statusCode = extractStatusCode(rawError);
  const text = errorText(rawError);
  const { errorType, retryable, shouldFallback, shouldCompress } = determineErrorFlags(statusCode, text);

  const providerCode = rawError?.code || rawError?.error?.code || null;

  return new ProviderError({
    provider: providerKey,
    errorType,
    message: `[${providerKey.toUpperCase()} ${errorType}] ${rawError?.message || "Unknown error"}`,
    statusCode,
    providerCode,
    retryable,
    shouldFallback,
    shouldCompress,
    cause: rawError,
  });
}
