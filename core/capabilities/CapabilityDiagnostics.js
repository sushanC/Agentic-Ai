import { developerEvents } from "../events/DeveloperEvents.js";
import { getCurrentRequestContext } from "../request/RequestContext.js";

/**
 * CapabilityDiagnostics.js
 *
 * Diagnostic logging and telemetry for the Capability Framework.
 * Logs capability selection, planning time, execution time, fallbacks,
 * and bridges lifecycle events to DeveloperEvents.
 */
export class CapabilityDiagnostics {
  constructor() {
    this.events = developerEvents;
  }

  logSelection(capabilityName, score, prompt) {
    this.events.emitDevEvent("CapabilitySelected", {
      capability: capabilityName,
      score,
      promptLength: String(prompt || "").length,
      requestId: getCurrentRequestContext()?.requestId || null,
    });
  }

  logLifecycleEvent(stage, capabilityName, details = {}) {
    this.events.emitDevEvent("CapabilityLifecycle", {
      stage,
      capability: capabilityName,
      detailKeys: Object.keys(details || {}),
      requestId: getCurrentRequestContext()?.requestId || null,
    });
  }

  logExecutionFinished(capabilityName, durationMs, success = true) {
    this.events.emitDevEvent("CapabilityFinished", {
      capability: capabilityName,
      durationMs,
      success,
    });
  }

  logError(capabilityName, error) {
    this.events.emitDevEvent("CapabilityError", {
      capability: capabilityName,
      errorCode: error?.code || error?.errorCode || error?.name || "CAPABILITY_FAILED",
      requestId: getCurrentRequestContext()?.requestId || null,
    });
  }
}

export const capabilityDiagnostics = new CapabilityDiagnostics();
