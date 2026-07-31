import { capabilityDiagnostics } from "./CapabilityDiagnostics.js";
import { CapabilityResult } from "./CapabilityResult.js";

/**
 * CapabilityLifecycle.js
 *
 * Reusable 5-stage lifecycle runner for capabilities:
 *   initialize -> analyze -> plan -> execute -> cleanup
 */
export class CapabilityLifecycle {
  /**
   * Run the full 5-stage capability lifecycle for a capability instance.
   *
   * @param {import("./BaseCapability.js").BaseCapability} capability
   * @param {import("./CapabilityContext.js").CapabilityContext} context
   * @returns {Promise<import("./CapabilityResult.js").CapabilityResult>}
   */
  static async run(capability, context) {
    const startTime = Date.now();
    capabilityDiagnostics.logLifecycleEvent("started", capability.name);

    try {
      // 1. Initialize
      if (!capability.isInitialized) {
        capabilityDiagnostics.logLifecycleEvent("initialize", capability.name);
        await capability.initialize();
      }

      // 2. Analyze
      capabilityDiagnostics.logLifecycleEvent("analyze", capability.name);
      const analysis = await capability.analyze(context);

      // 3. Plan
      capabilityDiagnostics.logLifecycleEvent("plan", capability.name, { analysis });
      const plan = await capability.plan(context);

      // 4. Execute
      capabilityDiagnostics.logLifecycleEvent("execute", capability.name, { plan });
      const result = await capability.execute(context);

      const durationMs = Date.now() - startTime;
      capabilityDiagnostics.logExecutionFinished(capability.name, durationMs, result.success);

      return CapabilityResult.create({
        ...result,
        capability: capability.name,
        diagnostics: { executionTimeMs: durationMs, ...result.diagnostics },
      });

    } catch (err) {
      capabilityDiagnostics.logError(capability.name, err);
      throw err;

    } finally {
      // 5. Cleanup
      try {
        await capability.cleanup();
        capabilityDiagnostics.logLifecycleEvent("cleanup", capability.name);
      } catch (cleanupErr) {
        console.warn(`[CapabilityLifecycle] Cleanup error for ${capability.name}:`, cleanupErr.message);
      }
    }
  }
}
