import { developerEvents } from "../events/DeveloperEvents.js";

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
      prompt: prompt.slice(0, 100),
    });
  }

  logLifecycleEvent(stage, capabilityName, details = {}) {
    this.events.emitDevEvent("CapabilityLifecycle", {
      stage,
      capability: capabilityName,
      ...details,
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
      error: error.message || error,
    });
  }
}

export const capabilityDiagnostics = new CapabilityDiagnostics();
