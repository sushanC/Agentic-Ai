import { RUNTIME_CONFIG } from "./RuntimeConfig.js";
import { providerPool } from "./ProviderPool.js";
import { circuitBreaker, CircuitState } from "./CircuitBreaker.js";
import { diagnostics } from "./Diagnostics.js";

/**
 * RecoveryScheduler.js
 *
 * Background recovery scheduler.
 * Periodically inspects all tracked circuit keys for OPEN or HALF_OPEN states.
 * When a circuit transitions to HALF_OPEN (cooldown expired), notifies ProviderPool
 * so the registry immediately reflects the recovery — future requests automatically
 * consider the provider again without requiring any restart.
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
   *
   * When a circuit transitions from OPEN to HALF_OPEN (cooldown expired),
   * ProviderPool.notifyRecovery() is called so the registry immediately reflects
   * the live state — no restart required.
   */
  async probe() {
    if (this.isProbing) return;
    this.isProbing = true;

    try {
      const circuits = circuitBreaker.circuits;

      for (const [key] of circuits.entries()) {
        const state = circuitBreaker.getState(key);

        if (state === CircuitState.OPEN) {
          diagnostics.debug("RecoveryScheduler", `Provider/model "${key}" is OPEN. Awaiting cooldown.`);
          continue;
        }

        if (state === CircuitState.HALF_OPEN) {
          // Circuit cooldown has expired — provider is ready for a probe request.
          // Notify ProviderPool so the registry reflects recovery immediately.
          diagnostics.info("RecoveryScheduler", `Provider/model "${key}" transitioned to HALF_OPEN. Notifying registry.`);
          this.pool.notifyRecovery(key);
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
