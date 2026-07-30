/**
 * RuntimeConfig.js
 *
 * Centralized configuration parameters for the Production Runtime Reliability Layer.
 * Single source of truth for retry limits, backoff bounds, circuit thresholds,
 * health decay rates, probe intervals, and latency thresholds.
 */
export const RUNTIME_CONFIG = Object.freeze({
  // Retry & Backoff Parameters
  RETRY: Object.freeze({
    maxRetries: 3,                // Maximum retry attempts for transient errors
    initialBackoffMs: 500,        // Initial exponential backoff delay (ms)
    maxBackoffMs: 8000,           // Maximum exponential backoff cap (ms)
    jitterFactor: 0.2,            // Random jitter (+/- 20%) to prevent thundering herd
  }),

  // Circuit Breaker Parameters
  CIRCUIT: Object.freeze({
    failureThreshold: 3,          // Consecutive failures to trip CLOSED -> OPEN
    cooldownMs: 30_000,           // Base duration (ms) before OPEN -> HALF_OPEN
    maxCooldownMs: 120_000,       // Escalated cooldown cap (ms)
    halfOpenMaxProbes: 1,         // Probe requests allowed during HALF_OPEN
  }),

  // Health Metrics Parameters
  HEALTH: Object.freeze({
    emaAlpha: 0.2,                // Exponential Moving Average smoothing factor
    decayRate: 0.05,              // Health score decay rate
    healthyThreshold: 0.7,       // Minimum score to be considered fully healthy
    degradedThreshold: 0.4,      // Score below which provider is marked degraded
    offlineThreshold: 0.15,       // Score below which provider is marked offline
    p95WindowSize: 20,            // Moving window for P95 latency calculation
  }),

  // Latency Thresholds (ms)
  LATENCY: Object.freeze({
    mediumPenaltyMs: 6_000,       // >6s latency incurs moderate penalty
    highPenaltyMs: 12_000,        // >12s latency incurs heavy penalty
  }),

  // Recovery & Probe Scheduler Parameters
  RECOVERY: Object.freeze({
    probeIntervalMs: 20_000,      // Periodicity (ms) of background health probes
    enabled: true,                // Background recovery scheduler enabled
  }),

  // Logging & Diagnostics
  DIAGNOSTICS: Object.freeze({
    defaultLevel: process.env.NODE_ENV === "production" ? "INFO" : "DEBUG",
    enableTrace: false,
  })
});
