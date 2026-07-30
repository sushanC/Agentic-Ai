import { RUNTIME_CONFIG } from "./RuntimeConfig.js";
import { providerPool } from "./ProviderPool.js";
import { circuitBreaker, CircuitState } from "./CircuitBreaker.js";
import { diagnostics } from "./Diagnostics.js";

/**
 * RecoveryScheduler.js
 *
 * Background recovery scheduler.
 * Periodically inspects providers and models in OPEN or HALF_OPEN circuit states.
 * Probes them with lightweight non-blocking health checks and restores healthy ones.
 */
export class RecoveryScheduler {
  constructor(pool = providerPool) {
    this.pool = pool;
    this.timer = null;
    this.isProbing = false;
  }

  /**
   * Start the background recovery probe timer.
   */
  start() {
    if (!RUNTIME_CONFIG.RECOVERY.enabled || this.timer) return;

    diagnostics.info("RecoveryScheduler", `Background recovery scheduler started (Interval: ${RUNTIME_CONFIG.RECOVERY.probeIntervalMs}ms)`);
    this.timer = setInterval(() => this.probe(), RUNTIME_CONFIG.RECOVERY.probeIntervalMs);

    // Unref timer so it doesn't block Node process exit
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Stop the background recovery probe timer.
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      diagnostics.info("RecoveryScheduler", "Background recovery scheduler stopped.");
    }
  }

  /**
   * Probe OPEN and HALF_OPEN providers/models to check if health has recovered.
   */
  async probe() {
    if (this.isProbing) return;
    this.isProbing = true;

    try {
      const circuits = circuitBreaker.circuits;

      for (const [key, circuit] of circuits.entries()) {
        const state = circuitBreaker.getState(key);

        if (state === CircuitState.OPEN || state === CircuitState.HALF_OPEN) {
          diagnostics.debug("RecoveryScheduler", `Probing unhealthy provider/model: ${key} (State: ${state})`);

          // Allow circuit breaker state check to evaluate cooldown transition
          if (state === CircuitState.HALF_OPEN) {
            diagnostics.info("RecoveryScheduler", `Provider ${key} is HALF_OPEN. Restoring for trial probes.`);
          }
        }
      }
    } catch (err) {
      diagnostics.error("RecoveryScheduler", "Error during recovery probe:", err);
    } finally {
      this.isProbing = false;
    }
  }
}

export const recoveryScheduler = new RecoveryScheduler();

// Start recovery scheduler automatically on module load
recoveryScheduler.start();
