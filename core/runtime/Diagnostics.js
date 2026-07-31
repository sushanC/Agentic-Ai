import { RUNTIME_CONFIG } from "./RuntimeConfig.js";

export const LogLevel = Object.freeze({
  TRACE: 0,
  DEBUG: 1,
  INFO:  2,
  WARN:  3,
  ERROR: 4,
});

const LEVEL_NAMES = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"];

/**
 * Diagnostics.js
 *
 * Structured logger for the AI Runtime Reliability Layer.
 * Provides level-filtered logging (TRACE, DEBUG, INFO, WARN, ERROR)
 * with structured payloads.
 *
 * Structured event helpers provide rich, consistent diagnostic output for:
 *   - Provider discovery and candidate ranking
 *   - Capability filtering decisions
 *   - Fallback transitions
 *   - Recovery events
 *   - Execution results
 */
export class RuntimeDiagnostics {
  constructor(level = RUNTIME_CONFIG.DIAGNOSTICS.defaultLevel) {
    this.setLevel(level);
  }

  /**
   * Set log level by name string or LogLevel enum.
   * @param {string|number} level
   */
  setLevel(level) {
    if (typeof level === "string") {
      const idx = LEVEL_NAMES.indexOf(level.toUpperCase());
      this.currentLevel = idx !== -1 ? idx : LogLevel.INFO;
    } else if (typeof level === "number") {
      this.currentLevel = level;
    } else {
      this.currentLevel = LogLevel.INFO;
    }
  }

  trace(tag, message, meta) {
    this._log(LogLevel.TRACE, tag, message, meta);
  }

  debug(tag, message, meta) {
    this._log(LogLevel.DEBUG, tag, message, meta);
  }

  info(tag, message, meta) {
    this._log(LogLevel.INFO, tag, message, meta);
  }

  warn(tag, message, meta) {
    this._log(LogLevel.WARN, tag, message, meta);
  }

  error(tag, message, meta) {
    this._log(LogLevel.ERROR, tag, message, meta);
  }

  _log(level, tag, message, meta) {
    if (level < this.currentLevel) return;

    const levelName = LEVEL_NAMES[level];
    const metaStr = meta !== undefined ? ` | ${JSON.stringify(meta)}` : "";

    if (level >= LogLevel.ERROR) {
      console.error(`[Runtime:${levelName}] [${tag}] ${message}${metaStr}`);
    } else if (level === LogLevel.WARN) {
      console.warn(`[Runtime:${levelName}] [${tag}] ${message}${metaStr}`);
    } else {
      console.log(`[Runtime:${levelName}] [${tag}] ${message}${metaStr}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STRUCTURED EVENT HELPERS
  //
  // These methods produce consistent, machine-parseable log lines for
  // key runtime events. Use these instead of ad-hoc info/debug calls
  // when emitting events that tooling or monitoring may need to parse.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Log a provider discovery event (candidate list resolved from ProviderPool).
   *
   * @param {object[]} candidates - Ordered candidate list
   * @param {object} [filters] - Active capability filters
   */
  logProviderDiscovery(candidates, filters = {}) {
    this.info("Discovery", `Provider discovery resolved ${candidates.length} candidate(s).`, {
      event: "PROVIDER_DISCOVERY",
      totalCandidates: candidates.length,
      candidates: candidates.map(c => ({
        provider:    c.provider,
        model:       c.displayName,
        score:       c._score?.toFixed(3),
        streaming:   c.supportsStreaming || c.streamingSupport,
        priority:    c.priority,
      })),
      filters,
    });
  }

  /**
   * Log a capability filter decision — which candidates were excluded and why.
   *
   * @param {string} filterKey - The filter that was applied (e.g. "vision", "streaming")
   * @param {string} excludedProvider - Provider display name that was excluded
   * @param {string} reason
   */
  logCapabilityFilter(filterKey, excludedProvider, reason) {
    this.debug("CapabilityFilter", `Excluded "${excludedProvider}" — failed filter "${filterKey}": ${reason}`, {
      event: "CAPABILITY_FILTER",
      filter: filterKey,
      excluded: excludedProvider,
      reason,
    });
  }

  /**
   * Log the final selection decision with ranking scores.
   *
   * @param {object} selectedCandidate
   * @param {string} reason - Human-readable selection reason
   * @param {object[]} [allCandidates] - Full ranked list for context
   */
  logSelectionDecision(selectedCandidate, reason, allCandidates = []) {
    this.info("Selection", `Selected provider: ${selectedCandidate?.displayName ?? "none"} — ${reason}`, {
      event: "SELECTION_DECISION",
      selected: {
        provider: selectedCandidate?.provider,
        model:    selectedCandidate?.displayName,
        score:    selectedCandidate?._score?.toFixed(3),
      },
      reason,
      allCandidates: allCandidates.map(c => ({
        provider: c.provider,
        model:    c.displayName,
        score:    c._score?.toFixed(3),
      })),
    });
  }

  /**
   * Log a fallback transition event.
   *
   * @param {string} fromProvider - Provider display name that failed
   * @param {string} toProvider - Provider display name being tried next
   * @param {string} reason - Why the transition occurred
   * @param {number} [attemptNumber]
   */
  logFallbackTransition(fromProvider, toProvider, reason, attemptNumber = 1) {
    this.warn("Fallback", `Fallback transition: "${fromProvider}" → "${toProvider}" (attempt ${attemptNumber}) — ${reason}`, {
      event: "FALLBACK_TRANSITION",
      from:    fromProvider,
      to:      toProvider,
      reason,
      attempt: attemptNumber,
    });
  }

  /**
   * Log a circuit state change / recovery event.
   *
   * @param {string} key - Provider or model key
   * @param {string} fromState - Previous circuit state
   * @param {string} toState - New circuit state
   */
  logRecoveryEvent(key, fromState, toState) {
    this.info("Recovery", `Circuit state changed for "${key}": ${fromState} → ${toState}`, {
      event: "RECOVERY_EVENT",
      key,
      fromState,
      toState,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log execution result (success path).
   *
   * @param {object} params
   * @param {string} params.provider - Provider key
   * @param {string} params.model - Model display name
   * @param {number} params.latencyMs
   * @param {number} params.totalProvidersAttempted
   * @param {boolean} params.wasStreaming
   */
  logExecutionResult({ provider, model, latencyMs, totalProvidersAttempted, wasStreaming }) {
    this.info("Execution", `Request completed via ${model} in ${latencyMs}ms.`, {
      event: "EXECUTION_RESULT",
      finalProvider:            provider,
      finalModel:               model,
      latencyMs,
      totalProvidersAttempted,
      wasStreaming,
    });
  }

  /**
   * Log retry history for a candidate.
   *
   * @param {string} provider - Provider display name
   * @param {number} attempt - Current attempt number (1-based)
   * @param {number} maxRetries
   * @param {string} errorType
   * @param {number} backoffMs
   */
  logRetryAttempt(provider, attempt, maxRetries, errorType, backoffMs) {
    this.info("Retry", `Retry ${attempt}/${maxRetries} for ${provider} (${errorType}) — backoff ${backoffMs}ms`, {
      event: "RETRY_ATTEMPT",
      provider,
      attempt,
      maxRetries,
      errorType,
      backoffMs,
    });
  }
}

export const diagnostics = new RuntimeDiagnostics();
